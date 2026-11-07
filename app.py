#!/usr/bin/env python3
"""
Servidor web local para el Dashboard Analizador de Facturas CFE.
No requiere librerías externas (usa la biblioteca estándar de Python).
"""

import os
import re
import json
import xml.etree.ElementTree as ET
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from src.cfe_parser import load_env, load_all_cfe_data, parse_xml_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "src", "static")
ENV_PATH = os.path.join(BASE_DIR, ".env")


class CFEDashboardHandler(SimpleHTTPRequestHandler):
    """Manejador HTTP para servir la interfaz estática y la API REST de facturas."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, fmt, *args):
        # Log conciso en consola
        print(f"[CFE-Dashboard] {self.address_string()} - {fmt % args}")

    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path == "/api/data":
            env_vars = load_env(ENV_PATH)
            input_dir = os.path.join(BASE_DIR, env_vars.get("INPUT_DIR", "input"))
            os.makedirs(input_dir, exist_ok=True)
            data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
            self._send_json(200, data)
            return

        if parsed_url.path in ("/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed_url = urlparse(self.path)
        if parsed_url.path != "/api/upload":
            self._send_json(404, {"error": "Ruta no encontrada"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
            files_list = payload.get("files", [])
        except Exception as exc:
            self._send_json(400, {"error": f"Formato de petición inválido: {exc}"})
            return

        env_vars = load_env(ENV_PATH)
        input_dir = os.path.join(BASE_DIR, env_vars.get("INPUT_DIR", "input"))
        os.makedirs(input_dir, exist_ok=True)

        # Obtener claves existentes (Serie-Folio) para evitar duplicados
        existing_data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
        existing_keys = {inv["key"] for inv in existing_data["invoices"]} | {
            pay["key"] for pay in existing_data["payments"]
        }

        added = []
        skipped = []
        errors = []

        for item in files_list:
            orig_name = os.path.basename(item.get("name", "factura.xml"))
            xml_content = item.get("content", "")
            if not xml_content.strip():
                errors.append(f"{orig_name}: Archivo vacío")
                continue

            try:
                root = ET.fromstring(xml_content.encode("utf-8"))
            except Exception:
                errors.append(f"{orig_name}: No es un XML válido")
                continue

            serie = root.attrib.get("Serie", "").strip()
            folio = root.attrib.get("Folio", "").strip()
            tipo = root.attrib.get("TipoDeComprobante", "").strip()

            if not serie or not folio or tipo not in ("I", "P"):
                errors.append(f"{orig_name}: No parece ser un CFDI de CFE (Serie/Folio/Tipo faltante)")
                continue

            key = f"{serie}-{folio}"
            if key in existing_keys:
                skipped.append(f"{orig_name} ({key} ya existe)")
                continue

            safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", f"{serie}-{folio}.xml")
            dest_path = os.path.join(input_dir, safe_filename)

            with open(dest_path, "w", encoding="utf-8") as f_out:
                f_out.write(xml_content)

            parsed_check = parse_xml_file(dest_path)
            if not parsed_check:
                os.remove(dest_path)
                errors.append(f"{orig_name}: No contiene estructura CFE válida")
                continue

            existing_keys.add(key)
            added.append(safe_filename)

        updated_data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
        self._send_json(
            200,
            {
                "status": "ok",
                "added": added,
                "skipped": skipped,
                "errors": errors,
                "data": updated_data,
            },
        )


def run_server():
    env_vars = load_env(ENV_PATH)
    port = int(env_vars.get("PORT", "8050") or 8050)
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, CFEDashboardHandler)
    print(f"============================================================")
    print(f"⚡ CFE Analizer Dashboard activo en: http://localhost:{port}")
    print(f"📂 Directorio de facturas XML: {env_vars.get('INPUT_DIR', 'input')}/")
    print(f"🔒 Datos personales cargados desde: .env")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()

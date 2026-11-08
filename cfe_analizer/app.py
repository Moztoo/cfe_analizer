#!/usr/bin/env python3
"""
Servidor web para el Dashboard Analizador de Facturas CFE.
Compatible con ejecución local y como Home Assistant Add-on con Ingress.
No requiere librerías externas (usa la biblioteca estándar de Python).
"""

import os
import sys
import re
import csv
import io
import json
import glob
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from src.cfe_parser import load_env, load_all_cfe_data, parse_xml_file

STATIC_DIR = os.path.join(BASE_DIR, "src", "static")


def get_env_path() -> str:
    """Retorna la ruta del archivo .env buscando en el directorio actual o en la raíz."""
    if os.environ.get("ENV_PATH"):
        return os.environ["ENV_PATH"]
    local_env = os.path.join(BASE_DIR, ".env")
    if os.path.exists(local_env):
        return local_env
    parent_env = os.path.join(os.path.dirname(BASE_DIR), ".env")
    if os.path.exists(parent_env):
        return parent_env
    return local_env


ENV_PATH = get_env_path()


def get_input_dir() -> str:
    """Retorna la ruta absoluta del directorio de facturas XML."""
    env_vars = load_env(ENV_PATH)
    raw_dir = os.environ.get("INPUT_DIR") or env_vars.get("INPUT_DIR", "input")
    if os.path.isabs(raw_dir):
        input_dir = raw_dir
    else:
        # Si existe en la raíz del repositorio, usar esa ruta; si no, relativa a BASE_DIR
        parent_candidate = os.path.join(os.path.dirname(BASE_DIR), raw_dir)
        local_candidate = os.path.join(BASE_DIR, raw_dir)
        if os.path.isdir(parent_candidate) and not os.path.isdir(local_candidate):
            input_dir = parent_candidate
        else:
            input_dir = local_candidate
    os.makedirs(input_dir, exist_ok=True)
    return input_dir


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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Manejo de CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.end_headers()

    def _verify_api_auth(self) -> bool:
        """Valida el token Bearer o API Key si está configurado en el servidor."""
        env_vars = load_env(ENV_PATH)
        configured_token = (
            os.environ.get("CFE_API_TOKEN") or env_vars.get("CFE_API_TOKEN", "")
        ).strip()

        # Si el servidor no tiene token configurado, no bloquea pero avisa en consola
        if not configured_token:
            print("[CFE-Dashboard] Advertencia: CFE_API_TOKEN no configurado; petición aceptada sin autenticación.")
            return True

        auth_header = self.headers.get("Authorization", "").strip()
        x_api_key = self.headers.get("X-API-Key", "").strip()

        provided_token = ""
        if auth_header.startswith("Bearer "):
            provided_token = auth_header[7:].strip()
        elif auth_header:
            provided_token = auth_header
        elif x_api_key:
            provided_token = x_api_key

        return provided_token == configured_token

    def do_GET(self):
        parsed_url = urlparse(self.path)
        req_path = parsed_url.path.rstrip("/")

        # API: Obtener todos los datos analizados
        if req_path == "/api/data":
            input_dir = get_input_dir()
            data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
            self._send_json(200, data)
            return

        # API: Descargar todas las facturas XML en un archivo ZIP
        if req_path in ("/api/download/invoices.zip", "/api/download/all"):
            input_dir = get_input_dir()
            xml_files = sorted(
                glob.glob(os.path.join(input_dir, "*.xml"))
                + glob.glob(os.path.join(input_dir, "*.XML"))
            )

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
                if not xml_files:
                    zf.writestr(
                        "LEEME.txt",
                        "No se encontraron facturas XML en el directorio de almacenamiento.\n"
                    )
                else:
                    for fpath in xml_files:
                        arcname = os.path.basename(fpath)
                        zf.write(fpath, arcname=arcname)

            zip_bytes = zip_buffer.getvalue()
            filename = f"facturas_cfe_{datetime.now().strftime('%Y%m%d')}.zip"

            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(zip_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(zip_bytes)
            return

        # API: Exportar resumen de facturas en formato CSV
        if req_path == "/api/download/summary.csv":
            input_dir = get_input_dir()
            data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
            invoices = data.get("invoices", [])

            csv_buffer = io.StringIO()
            writer = csv.writer(csv_buffer)
            writer.writerow([
                "Folio",
                "Serie",
                "Periodo_Desde",
                "Periodo_Hasta",
                "Dias",
                "Bimestre",
                "kWh_Basico",
                "kWh_Intermedio",
                "kWh_Excedente",
                "kWh_Total",
                "Importe_Energia_MXN",
                "IVA_MXN",
                "DAP_MXN",
                "Subsidio_MXN",
                "Total_Recibo_MXN",
                "Fecha_Limite",
                "Estado_Pago",
                "Origen",
            ])

            for inv in invoices:
                writer.writerow([
                    inv.get("folio", ""),
                    inv.get("serie", ""),
                    inv.get("periodo_desde", ""),
                    inv.get("periodo_hasta", ""),
                    inv.get("dias", 0),
                    inv.get("periodo_label", ""),
                    inv.get("kwh_basico", 0),
                    inv.get("kwh_intermedio", 0),
                    inv.get("kwh_excedente", 0),
                    inv.get("kwh_total", 0),
                    inv.get("subtotal_energia", 0.0),
                    inv.get("iva", 0.0),
                    inv.get("dap", 0.0),
                    inv.get("subsidio_gub", 0.0),
                    inv.get("total_recibo", 0.0),
                    inv.get("fecha_limite", ""),
                    "Pagado" if inv.get("is_paid") else "Pendiente",
                    "Addenda Histórica" if inv.get("is_historical_only") else "Factura XML",
                ])

            # UTF-8 con BOM para que Excel abra acentos y columnas correctamente
            csv_bytes = ("\ufeff" + csv_buffer.getvalue()).encode("utf-8")
            filename = f"cfe_resumen_facturas_{datetime.now().strftime('%Y%m%d')}.csv"

            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(csv_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(csv_bytes)
            return

        if parsed_url.path in ("", "/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def _handle_api_v1_facturas_cfe(self):
        """Maneja el endpoint POST /api/v1/facturas/cfe para Google Apps Script según contrato."""
        # 1. Validar autenticación
        if not self._verify_api_auth():
            self._send_json(401, {
                "status": "error",
                "message": "API Key o Token inválido o no proporcionado"
            })
            return

        # 2. Leer y parsear body JSON
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 10 * 1024 * 1024:
                self._send_json(400, {
                    "status": "error",
                    "message": "Payload JSON inválido o faltan campos obligatorios (fileName, xmlContent)"
                })
                return
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
        except Exception:
            self._send_json(400, {
                "status": "error",
                "message": "Payload JSON inválido o faltan campos obligatorios (fileName, xmlContent)"
            })
            return

        if not isinstance(payload, dict):
            self._send_json(400, {
                "status": "error",
                "message": "Payload JSON inválido o faltan campos obligatorios (fileName, xmlContent)"
            })
            return

        file_name = payload.get("fileName")
        xml_content = payload.get("xmlContent")

        if (
            not file_name
            or not isinstance(file_name, str)
            or not xml_content
            or not isinstance(xml_content, str)
            or not xml_content.strip()
        ):
            self._send_json(400, {
                "status": "error",
                "message": "Payload JSON inválido o faltan campos obligatorios (fileName, xmlContent)"
            })
            return

        # 3. Parsear XML y validar estructura CFE
        try:
            root = ET.fromstring(xml_content.encode("utf-8"))
        except Exception:
            self._send_json(400, {
                "status": "error",
                "message": "El contenido proporcionado no es un XML válido"
            })
            return

        serie = root.attrib.get("Serie", "").strip()
        folio = root.attrib.get("Folio", "").strip()
        tipo = root.attrib.get("TipoDeComprobante", "").strip()

        if not serie or not folio or tipo not in ("I", "P"):
            self._send_json(400, {
                "status": "error",
                "message": "El comprobante no corresponde a un CFDI válido de CFE (Serie, Folio o TipoDeComprobante faltante)"
            })
            return

        input_dir = get_input_dir()
        existing_data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
        existing_keys = {inv["key"] for inv in existing_data["invoices"]} | {
            pay["key"] for pay in existing_data["payments"]
        }

        key = f"{serie}-{folio}"
        safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", f"{serie}-{folio}.xml")
        dest_path = os.path.join(input_dir, safe_filename)

        # Si ya existe, responder de forma exitosa e idempotente sin duplicar
        if key in existing_keys and os.path.isfile(dest_path):
            self._send_json(200, {
                "status": "success",
                "message": f"XML ya procesado previamente ({key})",
                "data": {
                    "filename": safe_filename,
                    "processedAt": datetime.now().isoformat()
                }
            })
            return

        # Guardar en almacenamiento seguro
        with open(dest_path, "w", encoding="utf-8") as f_out:
            f_out.write(xml_content)

        # Validar que cfe_parser lo pueda leer correctamente
        parsed_check = parse_xml_file(dest_path)
        if not parsed_check:
            os.remove(dest_path)
            self._send_json(400, {
                "status": "error",
                "message": "El XML no contiene una estructura reconocida de CFE"
            })
            return

        self._send_json(200, {
            "status": "success",
            "message": "XML procesado correctamente",
            "data": {
                "filename": safe_filename,
                "processedAt": datetime.now().isoformat()
            }
        })

    def _handle_web_upload(self):
        """Maneja la carga manual múltiple desde la interfaz web."""
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
            files_list = payload.get("files", [])
        except Exception as exc:
            self._send_json(400, {"error": f"Formato de petición inválido: {exc}"})
            return

        input_dir = get_input_dir()

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

    def _handle_delete_file(self):
        """Elimina un archivo XML del directorio de almacenamiento de forma segura."""
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body)
        except Exception:
            self._send_json(400, {"status": "error", "message": "Petición JSON inválida"})
            return

        if not isinstance(payload, dict):
            self._send_json(400, {"status": "error", "message": "Formato de payload inválido"})
            return

        filename = os.path.basename(str(payload.get("filename", "")).strip())
        if not filename or not filename.lower().endswith(".xml"):
            self._send_json(400, {"status": "error", "message": "Nombre de archivo inválido (debe terminar en .xml)"})
            return

        # Validación de seguridad: caracteres alfanuméricos, guiones y puntos únicamente
        if not re.match(r"^[A-Za-z0-9._-]+\.xml$", filename, re.IGNORECASE):
            self._send_json(400, {"status": "error", "message": "Nombre de archivo contiene caracteres sospechosos"})
            return

        input_dir = get_input_dir()
        target_path = os.path.join(input_dir, filename)

        if not os.path.isfile(target_path):
            self._send_json(404, {"status": "error", "message": f"El archivo '{filename}' no existe en el almacenamiento"})
            return

        try:
            os.remove(target_path)
            updated_data = load_all_cfe_data(input_dir=input_dir, env_path=ENV_PATH)
            self._send_json(200, {
                "status": "success",
                "message": f"Archivo '{filename}' eliminado correctamente",
                "deleted": filename,
                "data": updated_data
            })
        except Exception as exc:
            self._send_json(500, {"status": "error", "message": f"Error al eliminar el archivo: {exc}"})

    def do_POST(self):
        parsed_url = urlparse(self.path)
        req_path = parsed_url.path.rstrip("/")

        # Endpoint de integración para Google Apps Script
        if req_path in ("/api/v1/facturas/cfe", "/api/facturas/cfe"):
            self._handle_api_v1_facturas_cfe()
            return

        # Endpoint de carga web (drag and drop)
        if req_path == "/api/upload":
            self._handle_web_upload()
            return

        # Endpoint para eliminar un archivo XML específico con confirmación
        if req_path in ("/api/delete", "/api/files/delete"):
            self._handle_delete_file()
            return

        self._send_json(404, {"error": "Ruta no encontrada"})


def run_server():
    env_vars = load_env(ENV_PATH)
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT") or env_vars.get("PORT", "8050") or 8050)
    input_dir = get_input_dir()

    server_address = (host, port)
    httpd = HTTPServer(server_address, CFEDashboardHandler)
    print("============================================================")
    print(f"⚡ CFE Analizer Dashboard activo en: http://{host}:{port}")
    print(f"📂 Directorio de facturas XML: {input_dir}")
    print(f"🔒 Datos personales cargados desde: {ENV_PATH}")
    print("============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando servidor...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()

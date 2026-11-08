#!/usr/bin/env python3
"""
Script utilitario para restaurar las facturas reales de Ricardo desde el respaldo local
hacia el servidor de Home Assistant.
Uso: python3 scripts/restore_real_invoices.py
"""

import io
import json
import os
import sys
import urllib.request
import zipfile

BACKUP_ZIP = os.path.expanduser("~/cfe_real_backup/facturas_cfe_real_backup.zip")
HA_URL_DATA = "http://192.168.1.20:8050/api/data"
HA_URL_DELETE = "http://192.168.1.20:8050/api/delete"
HA_URL_UPLOAD = "http://192.168.1.20:8050/api/upload"


def main():
    if not os.path.isfile(BACKUP_ZIP):
        print(f"Error: No se encontró el archivo de respaldo en: {BACKUP_ZIP}")
        sys.exit(1)

    print(f"Abriendo respaldo: {BACKUP_ZIP}")
    with open(BACKUP_ZIP, "rb") as f:
        zf = zipfile.ZipFile(io.BytesIO(f.read()))

    namelist = zf.namelist()
    print(f"Archivos reales encontrados en el respaldo: {len(namelist)}")

    # 1. Limpiar archivos actuales en HA
    print("Obteniendo lista de archivos dummy actuales en Home Assistant...")
    try:
        with urllib.request.urlopen(HA_URL_DATA) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Error conectando con {HA_URL_DATA}: {e}")
        sys.exit(1)

    to_delete = []
    for inv in data.get("invoices", []):
        if inv.get("filename") and not inv.get("is_historical_only"):
            to_delete.append(inv.get("filename"))
    for p in data.get("payments", []):
        if p.get("filename"):
            to_delete.append(p.get("filename"))

    to_delete = list(set(to_delete))
    if to_delete:
        print(f"Retirando {len(to_delete)} archivos dummy del servidor...")
        for fn in to_delete:
            req = urllib.request.Request(
                HA_URL_DELETE,
                data=json.dumps({"filename": fn}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req)
            except Exception:
                pass

    # 2. Subir facturas reales
    print("Restaurando facturas reales en Home Assistant...")
    payload_files = []
    for name in namelist:
        xml_content = zf.read(name).decode("utf-8")
        payload_files.append({"name": name, "content": xml_content})

    batch_size = 20
    for i in range(0, len(payload_files), batch_size):
        batch = payload_files[i : i + batch_size]
        req = urllib.request.Request(
            HA_URL_UPLOAD,
            data=json.dumps({"files": batch}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            pass

    print(f"Restauración completada: {len(payload_files)} archivos reales restaurados en Home Assistant.")


if __name__ == "__main__":
    main()

#!/bin/sh
set -e

echo "============================================================"
echo "⚡ CFE Analizer - Home Assistant Add-on"
echo "============================================================"

# Si se ejecuta como Home Assistant Add-on, procesar /data/options.json
if [ -f /data/options.json ]; then
    echo "📋 Cargando configuración desde Home Assistant options.json..."
    python3 -c "
import json
import os

options_file = '/data/options.json'
try:
    with open(options_file, 'r', encoding='utf-8') as f:
        opts = json.load(f)
except Exception as e:
    print(f'Error leyendo {options_file}: {e}')
    opts = {}

input_dir = opts.get('input_dir', '/share/cfe_analizer/input')
os.makedirs(input_dir, exist_ok=True)

env_lines = [
    f'INPUT_DIR={input_dir}',
    f'PORT={opts.get(\"port\", 8050)}',
    f'CFE_TITULAR={opts.get(\"cfe_titular\", \"\")}',
    f'CFE_RPU={opts.get(\"cfe_rpu\", \"\")}',
    f'CFE_RFC={opts.get(\"cfe_rfc\", \"\")}',
    f'CFE_RMU={opts.get(\"cfe_rmu\", \"\")}',
    f'CFE_MEDIDOR={opts.get(\"cfe_medidor\", \"\")}',
    f'CFE_DIRECCION={opts.get(\"cfe_direccion\", \"\")}',
    f'CFE_TARIFA={opts.get(\"cfe_tarifa\", \"01\")}',
    f'DAC_LIMITE_ANUAL_KWH={opts.get(\"dac_limite_anual_kwh\", 3000)}',
]

with open('/app/.env', 'w', encoding='utf-8') as f_env:
    f_env.write('\n'.join(env_lines) + '\n')

print(f' Carpeta de facturas configurada en: {input_dir}')
"
fi

exec python3 /app/app.py

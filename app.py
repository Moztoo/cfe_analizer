#!/usr/bin/env python3
"""
Wrapper de entrada para ejecución local de CFE Analizer.
Permite ejecutar 'python3 app.py' directamente desde la raíz del repositorio.
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from cfe_analizer.app import run_server  # noqa: E402

if __name__ == "__main__":
    run_server()

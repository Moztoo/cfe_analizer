# ⚡ CFE Analizer — Dashboard de Consumo Eléctrico

Dashboard web local para visualizar y analizar el historial de consumo eléctrico a partir de los archivos XML (CFDI 4.0) emitidos por **CFE Suministrador de Servicios Básicos**.

## 🔒 Privacidad y Datos Personales

- **Cero datos personales en el código fuente**: El parser (`src/cfe_parser.py`) ignora explícitamente los nodos de identificación personal del XML (`NOMBRE`, `RFC`, `RPU`, `DIRECC`, `RMU`, `NumCta`, etc.).
- **Aislamiento en `.env`**: Los metadatos del suministro se leen únicamente desde el archivo `.env` local.
- **Exclusión en Git (`.gitignore`)**: Tanto el archivo `.env` como todos los archivos `.xml` dentro de `input/` están excluidos del control de versiones. En el repositorio únicamente se incluye la plantilla `.env.example`.
- **Modo Privacidad en pantalla**: La interfaz inicia con los datos de `.env` difuminados y cuenta con un botón para mostrarlos u ocultarlos en cualquier momento.

## 🚀 Uso Rápido

No requiere instalar paquetes externos (utiliza únicamente la biblioteca estándar de Python 3):

```bash
# 1. Revisar variables en .env (basado en .env.example)
cp -n .env.example .env

# 2. Iniciar el servidor del dashboard
python3 app.py
```

Abre en tu navegador: **http://localhost:8050**

## ➕ Cómo incluir facturas nuevas

Tienes dos formas de agregar nuevas facturas XML (`PE-*.xml`) o complementos de pago (`PV-*.xml`, `P9-*.xml`):

1. **Desde el Dashboard Web**: Arrastra y suelta los archivos `.xml` directamente en la zona de carga o haz clic en **"➕ Subir XML"**. El servidor validará el CFDI, evitará duplicados por `Serie-Folio` y guardará el archivo en `input/`.
2. **Directamente en la carpeta**: Copia tus nuevos archivos `.xml` dentro del directorio `input/` y recarga la página.

## 📊 Métricas Incluidas

- **Consumo por Escalón Tarifario (kWh)**: Desglose bimestral en **Básico** (0–150 kWh), **Intermedio** (151–280 kWh) y **Excedente** (>280 kWh).
- **Historial Extendido (2022–2026)**: Permite alternar entre las facturas XML directas (2024–2026) y el historial completo que extrae además los 11 bimestres previos (2022–2023) embebidos en la addenda `clsRegArchFact`.
- **Desglose Financiero y Subsidio CFE**: Energía, IVA (16%), DAP (Derecho de Alumbrado Público) y Aportación Gubernamental (`CostoDeProd`).
- **Monitor de Riesgo Tarifa DAC (12 Meses)**: Seguimiento de la suma móvil de los últimos 6 bimestres frente al límite anual de Tarifa 01 (`3,000 kWh/año`).
- **Simulador Interactivo de Ahorro**: Calcula el ahorro bimestral y anual al reducir el consumo en el escalón Excedente.
- **Conciliación de Pagos (`PV` y `P9`)**: Vincula automáticamente los XML de complementos de pago de Energía (`PV`) y DAP (`P9`) con cada factura (`PE`).

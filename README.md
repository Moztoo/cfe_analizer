# ⚡ CFE Analizer — Dashboard de Consumo Eléctrico

Dashboard web local para visualizar y analizar el historial de consumo eléctrico a partir de los archivos XML (CFDI 4.0) emitidos por **CFE Suministrador de Servicios Básicos**.

## 🔒 Privacidad y Datos Personales

- **Cero datos personales en el código fuente**: El parser (`src/cfe_parser.py`) ignora explícitamente los nodos de identificación personal del XML (`NOMBRE`, `RFC`, `RPU`, `DIRECC`, `RMU`, `NumCta`, etc.).
- **Aislamiento en `.env`**: Los metadatos del suministro se leen únicamente desde el archivo `.env` local.
- **Exclusión en Git (`.gitignore`)**: Tanto el archivo `.env` como todos los archivos `.xml` dentro de `input/` están excluidos del control de versiones. En el repositorio únicamente se incluye la plantilla `.env.example`.
- **Modo Privacidad en pantalla**: La interfaz inicia con los datos de `.env` difuminados y cuenta con un botón para mostrarlos u ocultarlos en cualquier momento.

## 🚀 Uso Rápido (Local)

No requiere instalar paquetes externos (utiliza únicamente la biblioteca estándar de Python 3):

```bash
# 1. Revisar variables en .env (basado en .env.example)
cp -n .env.example .env

# 2. Iniciar el servidor del dashboard
python3 app.py
```

Abre en tu navegador: **http://localhost:8050**

---

## 🏠 Instalación en Home Assistant OS (Add-on con Ingress)

Cualquier usuario de Home Assistant OS / Supervised puede instalar este Add-on directamente desde su panel de Home Assistant:

### Opción A: Instalación en 1 Clic (My Home Assistant)

Haz clic en el siguiente botón para agregar este repositorio a tu Home Assistant de forma automática:

[![Abrir tu instancia de Home Assistant y mostrar el diálogo para añadir el repositorio de complementos.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FMoztoo%2Fcfe_analizer)

---

### Opción B: Instalación Manual desde la Tienda de Add-ons

1. En tu Home Assistant, ve a **Ajustes** > **Complementos** > **Tienda de complementos**.
2. Haz clic en el menú de **3 puntos** (arriba a la derecha) > **Repositorios**.
3. Añade la URL de este repositorio:
   ```text
   https://github.com/Moztoo/cfe_analizer
   ```
4. Haz clic en **Añadir** y luego en **Cerrar**.
5. Recarga la tienda de complementos; verás la categoría **CFE Analizer Add-ons** con el complemento **CFE Analizer**.
6. Haz clic en **Instalar**.
7. Una vez instalado, activa la opción **"Mostrar en la barra lateral"** y haz clic en **Iniciar**.
8. En la pestaña **Configuración** puedes personalizar tu tarifa, titular y límite DAC.

---

### Opción C: Como Add-on Local (Desarrolladores)
1. En tu servidor Home Assistant (vía SSH o recurso compartido Samba `\\homeassistant\addons`):
   ```bash
   cd /addons
   git clone https://github.com/Moztoo/cfe_analizer.git cfe_analizer
   ```
2. En **Ajustes** > **Complementos** > **Tienda de complementos** > Menú 3 puntos > **Comprobar si hay actualizaciones**.
3. En la sección **Local add-ons**, verás aparecer **CFE Analizer**.
4. Haz clic en **Instalar**, activa **"Mostrar en la barra lateral"** e inicia.

---

## ➕ Cómo incluir facturas nuevas

Tienes varias formas de agregar nuevas facturas XML (`PE-*.xml`) o complementos de pago (`PV-*.xml`, `P9-*.xml`):

1. **Desde el Dashboard Web (Local o Home Assistant)**: Arrastra y suelta los archivos `.xml` directamente en la zona de carga o haz clic en **"➕ Subir XML"**. El servidor validará el CFDI, evitará duplicados por `Serie-Folio` y guardará el archivo en el directorio de facturas.
2. **Directamente en la carpeta compartida (Samba / Red Local)**:
   - En Home Assistant OS: Copia tus archivos `.xml` a `\\192.168.1.20\share\cfe_analizer\input\`.
   - En Local: Copia tus archivos `.xml` dentro del directorio `input/`.
   - Al recargar el dashboard, se incorporan automáticamente.

---

## 📥 Cómo descargar todos los reportes

Puedes respaldar tus facturas o exportar tus datos analizados en cualquier momento con un solo clic:

1. **Descarga masiva en ZIP (`⬇ ZIP`)**:
   - Descarga todas las facturas XML respaldadas en el servidor comprimidas en un único archivo `facturas_cfe_YYYYMMDD.zip`.
2. **Exportar Resumen a CSV (`📊 CSV`)**:
   - Genera un archivo tabular con el desglose histórico completo (Periodo, kWh por escalón, Importes, IVA, DAP, Subsidio, Total y Estado de pago) codificado en UTF-8 con BOM para apertura inmediata en Microsoft Excel o Google Sheets.

## 📊 Métricas Incluidas

- **Consumo por Escalón Tarifario (kWh)**: Desglose bimestral en **Básico** (0–150 kWh), **Intermedio** (151–280 kWh) y **Excedente** (>280 kWh).
- **Historial Extendido (2022–2026)**: Permite alternar entre las facturas XML directas (2024–2026) y el historial completo que extrae además los 11 bimestres previos (2022–2023) embebidos en la addenda `clsRegArchFact`.
- **Desglose Financiero y Subsidio CFE**: Energía, IVA (16%), DAP (Derecho de Alumbrado Público) y Aportación Gubernamental (`CostoDeProd`).
- **Monitor de Riesgo Tarifa DAC (12 Meses)**: Seguimiento de la suma móvil de los últimos 6 bimestres frente al límite anual de Tarifa 01 (`3,000 kWh/año`).
- **Simulador Interactivo de Ahorro**: Calcula el ahorro bimestral y anual al reducir el consumo en el escalón Excedente.
- **Conciliación de Pagos (`PV` y `P9`)**: Vincula automáticamente los XML de complementos de pago de Energía (`PV`) y DAP (`P9`) con cada factura (`PE`).

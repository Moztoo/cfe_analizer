# Home Assistant Add-on: CFE Analizer ⚡

Dashboard web interactivo para visualizar, analizar y auditar el historial de consumo eléctrico a partir de las facturas XML (CFDI 4.0) emitidas por **CFE Suministrador de Servicios Básicos**.

## Características

- 📊 **Desglose Tarifario Bimestral:** Consumo en kWh clasificado en escalones Básico, Intermedio y Excedente.
- 📈 **Historial Extendido (2022–2026):** Gráficas interactivas con historial bimestral directo y addenda histórica.
- ⚠️ **Semáforo y Monitor DAC:** Monitoreo del acumulado móvil anual frente al límite de Tarifa 01 (3,000 kWh/año).
- 🧮 **Simulador de Ahorro:** Cálculo en tiempo real del impacto de reducir consumo en escalón Excedente.
- 💾 **Descarga Masiva:** Exporta todas tus facturas en un archivo `.zip` o el resumen histórico en `.csv` con un solo clic.
- 🔒 **Privacidad Total:** Cero envío de datos a servidores externos. Los datos personales se configuran localmente.

---

## Cómo usar el Add-on

1. **Abrir en la Barra Lateral:**
   - Asegúrate de tener activada la opción **"Mostrar en la barra lateral"** en los ajustes del Add-on.
   - Haz clic en **CFE Analizer** en el menú izquierdo de Home Assistant.

2. **Cargar Facturas:**
   - **Desde la interfaz web:** Arrastra y suelta tus archivos `.xml` (facturas `PE` o complementos de pago `PV`/`P9`) directamente sobre el dashboard o haz clic en **"+ Subir XML"**.
   - **Desde la red local (Samba / SMB):** Copia tus archivos XML a la carpeta compartida:
     ```text
     \\<IP_DE_HOME_ASSISTANT>\share\cfe_analizer\input\
     ```
     Las facturas se almacenan de forma permanente en `/share/cfe_analizer/input/` y no se borran al reiniciar o actualizar el Add-on.

3. **Descargar Respaldos:**
   - Usa los botones **⬇ ZIP** o **📊 CSV** en la barra superior del dashboard para descargar todas tus facturas o la tabla consolidada en formato Excel.

---

## Configuración

En la pestaña **Configuración** del add-on puedes personalizar:

- `cfe_titular`: Nombre del titular del contrato.
- `cfe_tarifa`: Tarifa contratada (ej. `01`, `1A`, `1B`).
- `cfe_medidor`: Número del medidor.
- `cfe_direccion`: Dirección del suministro.
- `dac_limite_anual_kwh`: Límite anual para entrar en tarifa DAC (por defecto `3000` kWh).
- `input_dir`: Directorio persistente de almacenamiento (por defecto `/share/cfe_analizer/input`).

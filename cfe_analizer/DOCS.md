# Home Assistant Add-on: CFE Analizer ⚡

Dashboard web interactivo y seguro para auditar, visualizar y analizar el consumo eléctrico bimestral a partir de las facturas XML (CFDI 4.0) emitidas por **CFE Suministrador de Servicios Básicos**.

---

## 🌟 Características

- 📊 **Desglose Tarifario Bimestral:** Consumo en kWh clasificado en escalones **Básico** (0–150 kWh), **Intermedio** (151–280 kWh) y **Excedente** (>280 kWh).
- 📈 **Historial Extendido (2022–2026):** Gráficas interactivas con historial bimestral directo y los 11 bimestres previos de la addenda `clsRegArchFact`.
- ⚠️ **Semáforo y Monitor DAC:** Monitoreo del acumulado móvil anual frente al límite de Tarifa 01 (3,000 kWh/año).
- 🧮 **Simulador de Ahorro:** Cálculo en tiempo real del impacto financiero al reducir consumo en escalón Excedente.
- 🗑️ **Limpieza y Retiro de Archivos:** Vista de archivos XML almacenados en el servidor con opción de eliminar individuales mediante confirmación previa.
- 💾 **Descarga Masiva:** Exporta todas tus facturas en un archivo `.zip` o el resumen histórico en `.csv` con un solo clic.
- 🔒 **Privacidad Total:** Todos los datos se procesan y almacenan localmente en tu Raspberry Pi sin enviar información a terceros.

---

## 🚀 Cómo usar el Add-on

1. **Abrir en la Barra Lateral:**
   - Asegúrate de tener activada la opción **"Mostrar en la barra lateral"** en los ajustes del Add-on.
   - Haz clic en **CFE Analizer** en el menú izquierdo de Home Assistant.

2. **Cargar Facturas:**
   - **Ingesta Automática con Gmail:** Configura el script de Google Apps Script (ver sección abajo) para recibir facturas nuevas automáticamente.
   - **Desde la interfaz web:** Arrastra y suelta tus archivos `.xml` (`PE-*.xml`, `PV-*.xml`, `P9-*.xml`) directamente sobre el dashboard o haz clic en **"+ Subir XML"**.
   - **Desde la red local (Samba / SMB):** Copia tus archivos XML a la carpeta compartida:
     ```text
     \\<IP_DE_HOME_ASSISTANT>\share\cfe_analizer\input\
     ```
     Las facturas se almacenan de forma permanente en `/share/cfe_analizer/input/` y no se borran al reiniciar o actualizar el Add-on.

3. **Descargar Respaldos:**
   - Usa los botones **⬇ ZIP** o **📊 CSV** en la barra superior del dashboard para descargar todas tus facturas o la tabla consolidada en formato Excel.

4. **Retirar Facturas con Confirmación:**
   - En la tabla de facturas o en la pestaña "Suministro y XML", presiona `🗑️ Retirar` para eliminar un comprobante específico. Se te solicitará confirmación antes de borrar el archivo.

---

## ⚙️ Configuración

En la pestaña **Configuración** del add-on puedes personalizar:

- `api_token`: Token secreto para autorizar peticiones desde Google Apps Script (cabecera `Authorization: Bearer <TOKEN>`).
- `dac_limite_anual_kwh`: Límite anual para entrar en tarifa DAC (por defecto `3000` kWh).
- `input_dir`: Directorio persistente de almacenamiento de facturas (por defecto `/share/cfe_analizer/input`).

*(Nota: Los datos de tu contrato, tarifa, lecturas y medidor se extraen e importan de forma 100% automática desde los archivos XML de cada factura).*

---

## 📋 Contrato de API — Endpoint Ingesta CFE

El add-on expone el endpoint `POST /api/v1/facturas/cfe` para recibir facturas XML enviadas por Google Apps Script.

### Especificación de la Petición
- **Método:** `POST`
- **Ruta:** `/api/v1/facturas/cfe`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <TU_API_TOKEN>`

### Payload JSON Requerido
```json
{
  "fileName": "Factura_CFE_123456789.xml",
  "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><cfdi:Comprobante ...>...</cfdi:Comprobante>",
  "sender": "cfecontigo@cfe.mx",
  "receivedAt": "2026-11-07T18:35:00Z"
}
```

### Respuestas
- **`200 OK` (Éxito o Duplicado Idempotente):**
  ```json
  {
    "status": "success",
    "message": "XML procesado correctamente",
    "data": {
      "filename": "PE-123456789.xml",
      "processedAt": "2026-11-07T18:35:00.123456"
    }
  }
  ```
- **`400 Bad Request`:** Payload inválido o XML sin estructura CFE.
- **`401 Unauthorized`:** Token ausente o incorrecto.

---

## 🤖 Guía: Automatización con Google Apps Script y Gmail

### 1. Crear el proyecto en Google Apps Script
1. Entra a [script.google.com](https://script.google.com/) con la cuenta de Gmail donde recibes tus recibos de CFE.
2. Crea un **Nuevo proyecto** y nómbralo "CFE Ingesta Home Assistant".

### 2. Pegar el código
Reemplaza el contenido por el siguiente código, colocando tu URL y Token:

```javascript
function procesarFacturasCFE() {
  const EMAIL_REMITENTE = "cfecontigo@cfe.mx";
  const NOMBRE_ETIQUETA = "Facturas/CFE_Procesadas";
  
  // URL de tu servidor Home Assistant:
  // - Con Nabu Casa: "https://<tu-id>.ui.nabu.casa/api/v1/facturas/cfe"
  // - Con Cloudflare / DuckDNS: "https://tu-dominio.com/api/v1/facturas/cfe"
  // - En red local LAN: "http://192.168.1.20:8050/api/v1/facturas/cfe"
  const URL_SERVIDOR = "https://tu-dominio.com/api/v1/facturas/cfe";
  const API_TOKEN = "MI_TOKEN_SECRETO"; // El configurado en CFE Analizer

  let etiqueta = GmailApp.getUserLabelByName(NOMBRE_ETIQUETA);
  if (!etiqueta) {
    etiqueta = GmailApp.createLabel(NOMBRE_ETIQUETA);
  }

  const busqueda = `from:${EMAIL_REMITENTE} filename:xml -label:"${NOMBRE_ETIQUETA}"`;
  const hilos = GmailApp.search(busqueda, 0, 10);

  hilos.forEach(hilo => {
    const mensajes = hilo.getMessages();

    mensajes.forEach(mensaje => {
      const adjuntos = mensaje.getAttachments();

      adjuntos.forEach(adjunto => {
        if (adjunto.getName().toLowerCase().endsWith('.xml')) {
          const contenidoXml = adjunto.getDataAsString();
          const nombreArchivo = adjunto.getName();

          const payload = {
            fileName: nombreArchivo,
            xmlContent: contenidoXml,
            sender: mensaje.getFrom(),
            receivedAt: mensaje.getDate().toISOString()
          };

          const opciones = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            headers: {
              'Authorization': `Bearer ${API_TOKEN}`
            },
            muteHttpExceptions: true
          };

          try {
            const respuesta = UrlFetchApp.fetch(URL_SERVIDOR, opciones);
            const codigo = respuesta.getResponseCode();
            Logger.log(`[${nombreArchivo}] Código HTTP: ${codigo}`);
          } catch (e) {
            Logger.log(`Error al enviar [${nombreArchivo}]: ${e.toString()}`);
          }
        }
      });
    });

    hilo.addLabel(etiqueta);
  });
}
```

### 3. Crear el Activador (Temporizador automático)
1. En el menú izquierdo de Apps Script, entra al icono de reloj (**Activadores** / **Triggers**).
2. Añade un nuevo activador:
   - Función: `procesarFacturasCFE`
   - Fuente: `Según tiempo`
   - Temporizador: `Por horas` (cada 1 o 2 horas).
3. Guarda y listo. Tus facturas se sincronizarán solas cada bimestre.

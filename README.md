# ⚡ CFE Analizer — Dashboard y Add-on de Consumo Eléctrico

[![Abrir tu instancia de Home Assistant y mostrar el diálogo para añadir el repositorio de complementos.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FMoztoo%2Fcfe_analizer)

Dashboard web interactivo y **Add-on oficial para Home Assistant OS** diseñado para auditar, visualizar y analizar el consumo eléctrico bimestral a partir de las facturas XML (CFDI 4.0) emitidas por **CFE Suministrador de Servicios Básicos**.

---

## 🌟 Características Principales

- 📊 **Desglose Tarifario Bimestral:** Clasificación precisa en escalones **Básico** (0–150 kWh), **Intermedio** (151–280 kWh) y **Excedente** (>280 kWh).
- 📈 **Historial Extendido (2022–2026):** Gráficas interactivas que combinan facturas XML directas con los 11 bimestres previos embebidos en la addenda histórica (`clsRegArchFact`).
- ⚠️ **Semáforo y Monitor DAC:** Seguimiento del consumo móvil acumulado en 12 meses frente al límite anual de Tarifa 01 (`3,000 kWh/año`).
- 🧮 **Simulador de Ahorro:** Calcula en tiempo real cuánto dinero ahorras reduciendo tu consumo en el escalón Excedente.
- 🤖 **Ingesta Automática vía Webhook:** Recibe automáticamente las facturas desde Gmail utilizando Google Apps Script.
- 🗑️ **Gestión y Limpieza:** Permite inspeccionar la lista de XMLs en el servidor y retirar archivos individuales con diálogo de confirmación.
- 📥 **Exportación Masiva:** Descarga todas tus facturas XML respaldadas en un archivo `.zip` o la tabla histórica en `.csv` para Excel.
- 🔒 **Privacidad Total:** Todos los datos del contrato, tarifa, lecturas y fechas se extraen de forma 100% local sin enviar información a servidores de terceros.

---

## 🏠 Instalación en Home Assistant OS

Cualquier usuario de Home Assistant OS / Supervised puede instalar este Add-on directamente desde su panel:

### Opción 1: Con 1 solo clic (My Home Assistant)
Haz clic en el botón oficial:

[![Abrir en Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FMoztoo%2Fcfe_analizer)

### Opción 2: Instalación Manual desde la Tienda
1. En Home Assistant, ve a **Ajustes** > **Complementos** > **Tienda de complementos**.
2. Haz clic en el menú de **3 puntos** (arriba a la derecha) > **Repositorios**.
3. Añade la URL:
   ```text
   https://github.com/Moztoo/cfe_analizer
   ```
4. Haz clic en **Añadir** y luego en **Cerrar**.
5. En la sección **CFE Analizer Add-ons**, selecciona **CFE Analizer** y haz clic en **Instalar**.
6. Activa la opción **"Mostrar en la barra lateral"** y haz clic en **Iniciar**.

---

## ⚙️ Guía de Configuración

En Home Assistant, ve a la pestaña **Configuración** de **CFE Analizer**:

| Parámetro | Tipo | Por Defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `api_token` | Password | `""` *(vacío)* | Clave secreta para autorizar peticiones desde Google Apps Script (`Bearer <TOKEN>`). |
| `dac_limite_anual_kwh` | Entero | `3000` | Límite anual de kWh antes de reclasificar a Tarifa DAC. |
| `input_dir` | Texto | `/share/cfe_analizer/input` | Carpeta permanente en disco donde se guardan tus facturas XML. |

> [!NOTE]
> Todos los datos de tu contrato (tarifa, lecturas anterior/actual, fechas del periodo, desglose financiero, IVA y DAP) se detectan y calculan automáticamente desde cada XML.

---

## 💻 Uso Rápido en Máquina Local (Standalone)

No requiere dependencias externas (utiliza únicamente la biblioteca estándar de Python 3):

```bash
# 1. Clonar el repositorio
git clone https://github.com/Moztoo/cfe_analizer.git
cd cfe_analizer

# 2. Configurar variables locales (opcional)
cp .env.example .env

# 3. Iniciar el servidor
python3 app.py
```
Abre en tu navegador: **http://localhost:8050**

---

## ➕ Métodos para Cargar Facturas XML

1. **Recepción Automática (Recomendada):** Mediante webhook desde Google Apps Script cada vez que CFE te envía tu factura por correo.
2. **Desde el Dashboard Web:** Arrastra y suelta uno o varios archivos `.xml` (`PE-*.xml`, `PV-*.xml`, `P9-*.xml`) directamente sobre el dashboard o haz clic en **"+ Subir XML"**.
3. **Por Red Local (Samba / SMB):** Copia tus archivos XML a la carpeta compartida:
   - Home Assistant: `\\<IP_DE_TU_SERVER>\share\cfe_analizer\input\`
   - Local: carpeta `input/` dentro del repositorio.

---

## 📋 Contrato de API — Endpoint Ingesta CFE

Este endpoint recibe facturas XML enviadas automáticamente desde Google Apps Script u otros sistemas.

### Especificación de la Petición

- **Método HTTP:** `POST`
- **Ruta:** `/api/v1/facturas/cfe`
- **Header:** `Content-Type: application/json`
- **Header:** `Authorization: Bearer <TU_API_TOKEN>` *(Obligatorio si se configuró `api_token`)*

#### Campos del Payload JSON

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :--- | :--- |
| `fileName` | String | **Sí** | Nombre original del archivo adjunto (ej. `Factura_CFE.xml`). |
| `xmlContent` | String | **Sí** | Contenido completo del XML formateado como texto plano. |
| `sender` | String | No | Dirección de correo del remitente (ej. `cfecontigo@cfe.mx`). |
| `receivedAt` | String | No | Estampa de tiempo ISO 8601 de recepción del correo. |

#### Ejemplo de Petición

```json
{
  "fileName": "Factura_CFE_123456789.xml",
  "xmlContent": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Serie=\"PE\" Folio=\"123456789\" TipoDeComprobante=\"I\" ...>...</cfdi:Comprobante>",
  "sender": "cfecontigo@cfe.mx",
  "receivedAt": "2026-11-07T18:35:00Z"
}
```

### Respuestas del Servidor

#### 1. Éxito (`200 OK`)
Devuelto cuando el XML es validado, guardado y procesado correctamente (o si ya existía previamente, evitando duplicados):

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

#### 2. Error de Validación (`400 Bad Request`)
Devuelto si el JSON es inválido, faltan campos obligatorios o el XML no corresponde a un CFDI auténtico de CFE:

```json
{
  "status": "error",
  "message": "Payload JSON inválido o faltan campos obligatorios (fileName, xmlContent)"
}
```

#### 3. Error de Autenticación (`401 Unauthorized`)
Devuelto si el token en la cabecera `Authorization` no coincide con el `api_token` configurado:

```json
{
  "status": "error",
  "message": "API Key o Token inválido o no proporcionado"
}
```

---

## 🤖 Guía: Automatización con Google Apps Script y Gmail

Sigue estos pasos para que cada vez que llegue un correo de CFE a tu cuenta de Gmail con la factura XML adjunta, se envíe automáticamente a tu Home Assistant:

### Paso 1: Crear el proyecto en Google Apps Script
1. Abre [script.google.com](https://script.google.com/) e inicia sesión con la cuenta de Gmail donde recibes tus facturas de CFE.
2. Haz clic en **"Nuevo proyecto"**.
3. Nombra el proyecto como **"CFE Ingesta Home Assistant"**.

### Paso 2: Pegar el código del Script
Reemplaza el código del editor por el siguiente:

```javascript
function procesarFacturasCFE() {
  const EMAIL_REMITENTE = "cfecontigo@cfe.mx";
  const NOMBRE_ETIQUETA = "Facturas/CFE_Procesadas";
  
  // URL de tu servidor Home Assistant:
  // - Si usas Nabu Casa: "https://<tu-id>.ui.nabu.casa/api/v1/facturas/cfe"
  // - Si usas Cloudflare Tunnel / DuckDNS: "https://tu-dominio.com/api/v1/facturas/cfe"
  // - Si ejecutas en red local: "http://192.168.1.20:8050/api/v1/facturas/cfe"
  const URL_SERVIDOR = "https://tu-dominio.com/api/v1/facturas/cfe";
  const API_TOKEN = "MI_TOKEN_SECRETO"; // El mismo configurado en CFE Analizer

  // Asegurar etiqueta en Gmail para no reprocesar correos viejos
  let etiqueta = GmailApp.getUserLabelByName(NOMBRE_ETIQUETA);
  if (!etiqueta) {
    etiqueta = GmailApp.createLabel(NOMBRE_ETIQUETA);
  }

  // Buscar correos de CFE con archivos XML que no hayan sido etiquetados aún
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
            const cuerpo = respuesta.getContentText();
            Logger.log(`Archivo [${nombreArchivo}] enviado. Código HTTP: ${codigo}. Respuesta: ${cuerpo}`);
          } catch (e) {
            Logger.log(`Error al enviar [${nombreArchivo}]: ${e.toString()}`);
          }
        }
      });
    });

    // Marcar como procesado aplicando la etiqueta
    hilo.addLabel(etiqueta);
  });
}
```

### Paso 3: Probar la ejecución
1. Haz clic en **Guardar** (icono de disquete).
2. Selecciona la función `procesarFacturasCFE` y haz clic en **Ejecutar**.
3. Google te pedirá permisos para leer Gmail y realizar llamadas HTTP externas (`UrlFetchApp`). Otorga los permisos.
4. En el panel inferior **"Registro de ejecución"** podrás ver si encontró facturas y el código de respuesta `200` devuelto por tu servidor.

### Paso 4: Programar la ejecución automática (Trigger)
1. En el menú lateral izquierdo de Apps Script, haz clic en el icono del reloj (**Activadores** / **Triggers**).
2. Haz clic en **"Añadir activador"** (botón azul abajo a la derecha).
3. Configura:
   - **Función que se ejecutará:** `procesarFacturasCFE`
   - **Fuente del evento:** `Según tiempo`
   - **Tipo de temporizador:** `Temporizador por horas` (por ejemplo, cada 1 hora o cada 4 horas).
4. Haz clic en **Guardar**. ¡Listo! Cada vez que llegue tu recibo de CFE, se enviará solo sin que tengas que mover un solo dedo.

---

## 🗑️ Control y Limpieza de Facturas

Puedes auditar y gestionar tus archivos directamente desde la interfaz web del dashboard:

1. **Desde la tabla de Facturas y Pagos:** En la última columna (**Acción**), presiona el botón `🗑️ Retirar` de la factura deseada.
2. **Desde la pestaña "Suministro y XML":** En la tarjeta **"Limpieza y Control de Facturas XML"**, verás la lista completa de archivos en disco (`PE`, `PV`, `P9`) con su botón de eliminación.
3. **Confirmación obligatoria:** Antes de borrar cualquier archivo, el sistema despliega un aviso para evitar eliminaciones accidentales:
   > *"¿Estás seguro de que deseas retirar permanentemente el archivo `<nombre>.xml` del servidor?"*
4. Tras confirmar, el archivo se retira físicamente de `/share/cfe_analizer/input/` y el dashboard recalcula los acumulados al instante.

---

## 📥 Respaldos y Exportación Masiva

- **Descargar Todo en ZIP (`⬇ ZIP`):** Empaca en memoria todas las facturas XML guardadas en el servidor y las descarga en un archivo `facturas_cfe_YYYYMMDD.zip`.
- **Exportar Resumen en CSV (`📊 CSV`):** Genera una tabla con el historial de bimestres, kWh por escalón, IVA, DAP, Subsidio y Total a Pagar, compatible con Microsoft Excel y Google Sheets.

---

## 🔒 Privacidad y Seguridad

- **Cero Datos en Git:** Tu archivo `.env` y todas las facturas en `input/` están explícitamente ignoradas por Git en `.gitignore`.
- **Anti Path-Traversal:** El servidor ignora cualquier ruta enviada por el cliente y guarda únicamente archivos con nombres estructurados basados en Serie-Folio timbrado.
- **Parser Seguro:** Procesamiento mediante `xml.etree.ElementTree` de Python estándar, inmune a entidades externas (XXE).
- **Control de Acceso:** Peticiones HTTP protegidas por token Bearer en el endpoint de webhook.

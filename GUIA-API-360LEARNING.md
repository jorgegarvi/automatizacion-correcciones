# 🔑 Guía: Obtener API Key de 360Learning y Configurar Make

## Índice
1. [Requisitos previos](#1-requisitos-previos)
2. [Obtener la API Key](#2-obtener-la-api-key)
3. [Obtener el Company ID](#3-obtener-el-company-id)
4. [Estructura de la API de Archivos](#4-estructura-de-la-api-de-archivos)
5. [Configurar el Webhook en Make](#5-configurar-el-webhook-en-make)
6. [Configurar Make para descargar archivos](#6-configurar-make-para-descargar-archivos)
7. [Flujo completo: Extensión → Make → Archivo](#7-flujo-completo-extensión--make--archivo)
8. [Solución de problemas](#8-solución-de-problemas)

---

## 1. Requisitos previos

- ✅ Cuenta de **administrador** en 360Learning (rol Admin o Owner)
- ✅ Cuenta en [Make](https://www.make.com/) (antes Integromat)
- ✅ Extensión Chrome del scraper instalada

> **⚠️ IMPORTANTE:** Solo los usuarios con rol **Admin** u **Owner** pueden generar API Keys. Si no tienes este rol, pide a tu administrador que te lo asigne o que genere la API Key por ti.

---

## 2. Obtener la API Key

### Paso 2.1 — Acceder a la configuración de la plataforma

1. Inicia sesión en **360Learning** con tu cuenta de administrador
2. Haz clic en tu **avatar** (esquina superior derecha)
3. Selecciona **"Configuración de la plataforma"** (o "Platform Settings" en inglés)

   ![Menú perfil](https://i.imgur.com/placeholder-profile.png)

### Paso 2.2 — Navegar a la sección de Integraciones

1. En el menú lateral izquierdo de Configuración, busca **"Integraciones"** (o "Integrations")
2. Dentro de Integraciones, haz clic en **"API"**

   La ruta completa es:
   ```
   Configuración de la plataforma → Integraciones → API
   ```

   > Si no ves la sección "API", es posible que:
   > - No tengas permisos de Admin/Owner
   > - Tu plan de 360Learning no incluya acceso a la API (contacta a soporte)

### Paso 2.3 — Generar una nueva API Key

1. En la página de API, verás un botón **"Generar nueva clave API"** (o "Generate new API key")
2. Haz clic en él
3. Se te pedirá un **nombre descriptivo** para la clave. Usa algo como:
   ```
   Make - Descarga de archivos validaciones
   ```
4. Haz clic en **"Generar"** (o "Generate")
5. **⚠️ COPIA LA API KEY INMEDIATAMENTE** — Solo se muestra una vez. Guárdala en un lugar seguro

   La API Key tiene este formato (ejemplo ficticio):
   ```
   ak_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Paso 2.4 — Verificar que funciona

Abre una terminal (PowerShell, CMD o cualquier otra) y ejecuta:

```powershell
# Reemplaza los valores entre < >
$apiKey = "<TU_API_KEY>"
$company = "<TU_COMPANY_ID>"

Invoke-RestMethod -Uri "https://app.360learning.com/api/v1/users?company=$company&apiKey=$apiKey&limit=1" -Method GET
```

Si recibes datos de un usuario, la API Key funciona correctamente.

---

## 3. Obtener el Company ID

El **Company ID** es un identificador hexadecimal de 24 caracteres. Hay dos formas de obtenerlo:

### Opción A — Desde la URL de la plataforma (más fácil)

1. Navega a cualquier página de tu plataforma 360Learning
2. Mira la URL del navegador. El Company ID aparece en rutas como:
   ```
   https://app.360learning.com/api/medias/group/.../logo?company=6899f07f4a634f3d94b99cb0
   ```
3. El valor después de `company=` es tu Company ID

   **Tu Company ID (extraído de tus archivos HTML):**
   ```
   6899f07f4a634f3d94b99cb0
   ```

### Opción B — Desde la Configuración de la plataforma

1. Ve a **Configuración de la plataforma → General**
2. El Company ID aparece listado en los detalles de la cuenta

### Opción C — Inspeccionar el HTML

1. En cualquier página de 360Learning, `F12` → Consola
2. Ejecuta:
   ```javascript
   document.querySelector('[src*="company="]')?.src?.match(/company=([a-f0-9]{24})/)?.[1]
   ```
3. Devuelve el Company ID

---

## 4. Estructura de la API de Archivos

### Patrón confirmado de la API de medios

A partir del análisis del HTML de tu plataforma, la API de archivos de 360Learning usa estos endpoints:

| Tipo de recurso | Endpoint |
|----------------|----------|
| Logo de grupo | `/api/medias/group/{groupId}/logo?company={companyId}` |
| Avatar de usuario | `/api/medias/user/{userId}` |
| **Archivo/PDF (proxy)** | **`/api/medias/proxy/{companyId}/{mediaId}/pdf`** |
| **Archivo genérico** | **`/api/medias/proxy/{companyId}/{mediaId}/{tipo}`** |

### URL completa para descargar un archivo

```
https://app.360learning.com/api/medias/proxy/{companyId}/{mediaId}/{tipo}?apiKey={apiKey}
```

**Ejemplo real** (PDF encontrado en tu referencia-docs.html):
```
https://app.360learning.com/api/medias/proxy/6899f07f4a634f3d94b99cb0/69a6ce63130cc04a5e302543/pdf
```

### ¿Qué es el `mediaId`?

Es el identificador único de 24 caracteres del archivo subido. Cada archivo adjunto en una validación tiene un `mediaId`. **La extensión Chrome necesita extraer este ID** del árbol de componentes Vue en tiempo de ejecución.

### Alternativa: API REST v1 documentada

360Learning también expone endpoints REST documentados:

```
GET /api/v1/companies/{companyId}/files/{fileId}?apiKey={apiKey}
```

> **Nota:** Prueba ambas URLs. La primera (`/api/medias/proxy/...`) es la que usa la interfaz web; la segunda (`/api/v1/...`) es la API documentada oficialmente.

---

## 5. Configurar el Webhook en Make

### Paso 5.1 — Crear un nuevo Escenario

1. Entra en [Make](https://www.make.com/)
2. Haz clic en **"Create a new scenario"**

### Paso 5.2 — Agregar módulo Webhook

1. Haz clic en el **+** grande
2. Busca **"Webhooks"**
3. Selecciona **"Custom webhook"**
4. Haz clic en **"Add"** para crear un nuevo webhook
5. Ponle nombre: `360Learning Validaciones`
6. Haz clic en **"Save"**
7. **Copia la URL del webhook** — la necesitarás para la extensión Chrome

   Tiene este formato:
   ```
   https://hook.eu2.make.com/xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Paso 5.3 — Determinar la estructura de datos

1. Deja el escenario en modo **"listening"** (haz clic en "Run once")
2. Desde la extensión Chrome, envía datos de prueba al webhook
3. Make detectará automáticamente la estructura JSON

---

## 6. Configurar Make para descargar archivos

### Paso 6.1 — Agregar módulo HTTP después del Webhook

1. Después del módulo Webhook, agrega un módulo **"HTTP → Make a request"**
2. Configúralo así:

| Campo | Valor |
|-------|-------|
| **URL** | `https://app.360learning.com/api/medias/proxy/{{1.companyId}}/{{1.mediaId}}/raw` |
| **Method** | `GET` |
| **Headers** | (ver abajo) |

3. En **Headers**, agrega:

| Header Name | Header Value |
|-------------|-------------|
| `Authorization` | `Bearer {{TU_API_KEY}}` |

   > **Alternativa sin header:** Si la autenticación por header no funciona, usa query parameter:
   > ```
   > URL: https://app.360learning.com/api/medias/proxy/{{1.companyId}}/{{1.mediaId}}/raw?apiKey=TU_API_KEY
   > ```

4. Marca la opción **"Parse response"** como `No` (queremos el binario, no JSON)

### Paso 6.2 — Probar variantes de URL

Si la primera URL no funciona, prueba estas alternativas en orden:

```
1. /api/medias/proxy/{companyId}/{mediaId}/raw?apiKey={apiKey}
2. /api/medias/proxy/{companyId}/{mediaId}/xlsx?apiKey={apiKey}
3. /api/medias/proxy/{companyId}/{mediaId}/download?apiKey={apiKey}
4. /api/v1/files/{mediaId}?company={companyId}&apiKey={apiKey}
5. /api/v1/companies/{companyId}/medias/{mediaId}?apiKey={apiKey}
```

### Paso 6.3 — Usar el archivo descargado

Después del módulo HTTP, puedes:
- **Google Sheets:** Parsear el xlsx y escribir en una hoja
- **Email:** Enviar como adjunto
- **Otro webhook:** Reenviar a otro sistema
- **Google Drive / OneDrive:** Guardarlo (si cambias de opinión)

---

## 7. Flujo completo: Extensión → Make → Archivo

```
┌─────────────────────┐
│   Extensión Chrome   │
│                     │
│ 1. Scrapea la página│
│ 2. Extrae mediaId   │
│ 3. POST JSON →      │─────► Webhook Make
└─────────────────────┘         │
                                ▼
                    ┌───────────────────────┐
                    │        Make           │
                    │                       │
                    │ 4. Recibe JSON        │
                    │ 5. Para cada adjunto: │
                    │    GET archivo via API │──► 360Learning API
                    │ 6. Procesa archivo    │    (con API Key)
                    └───────────────────────┘
```

### JSON que enviará la extensión al webhook:

```json
{
  "validaciones": [
    {
      "usuario": { "nombre": "Juan García", "perfil": "/profile/xxx" },
      "tarea": { "titulo": "📎 Actividad Excel" },
      "respuesta": {
        "adjuntos": [
          {
            "tipo": "archivo",
            "mediaId": "69a6ce63130cc04a5e302543",
            "companyId": "6899f07f4a634f3d94b99cb0",
            "nombreArchivo": "mi-archivo.xlsx",
            "urlDescarga": "https://app.360learning.com/api/medias/proxy/6899f07f4a634f3d94b99cb0/69a6ce63130cc04a5e302543/raw"
          }
        ]
      }
    }
  ]
}
```

---

## 8. Solución de problemas

### "No veo la sección API en Configuración"
→ Verifica que tu rol sea **Admin** u **Owner**. Ve a tu perfil y compruébalo.
→ Si eres Admin y no aparece, tu plan puede no incluir API. Contacta a tu Customer Success Manager de 360Learning.

### "La API Key devuelve 401 Unauthorized"
→ Verifica que no haya espacios extra al copiar la key.
→ Prueba ambos métodos de autenticación:
  - Header: `Authorization: Bearer ak_live_xxx`
  - Query param: `?apiKey=ak_live_xxx`
→ Algunas APIs antiguas usan: `?apiKey=ak_live_xxx&company=xxx`

### "No encuentro el mediaId del archivo xlsx"
→ La extensión necesita extraerlo del árbol Vue en runtime. Usa el script `debug-vue-url.js` en la consola del navegador para inspeccionar los props del componente.
→ También puedes capturarlo desde el **Network tab**: haz clic en "Descargar el documento" y busca el request en la pestaña Network de DevTools.

### "Make recibe el JSON pero el archivo no se descarga"
→ Prueba la URL manualmente en el navegador (con tu sesión activa) para confirmar que funciona.
→ Prueba las diferentes variantes de URL del paso 6.2.
→ Asegúrate de que la API Key tiene permisos suficientes.

### "El endpoint /api/medias/proxy/ devuelve 403"
→ Es posible que la API Key no tenga permisos para el endpoint de proxy de medias.
→ Prueba con el endpoint REST alternativo: `/api/v1/files/{mediaId}?company={companyId}&apiKey={apiKey}`
→ Si ninguno funciona, la única alternativa es la **Opción 1 descartada**: que la extensión descargue y envíe el binario directamente a Make.

---

## Próximos pasos

1. ✅ Genera la API Key siguiendo el Paso 2
2. ✅ Prueba el endpoint de descarga con `curl` o PowerShell (Paso 2.4)
3. ✅ Dime qué URL funciona para que actualice la extensión con el patrón correcto
4. ✅ Configura el escenario en Make (Pasos 5-6)

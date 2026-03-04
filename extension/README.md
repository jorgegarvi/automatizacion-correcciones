# 🕷️ ScrapingDemo - Extensión de Chrome

Extensión privada para extraer datos de cualquier página web y descargarlos en JSON.

## Instalar en Chrome (uso privado)

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa **Modo de desarrollador** (esquina superior derecha)
3. Clic en **Cargar extensión sin empaquetar**
4. Selecciona la carpeta `extension/` de este proyecto
5. Listo — el ícono aparece en la barra de extensiones

## Cómo usar

### ⚡ Modo Auto
Haz clic en el ícono → **Extraer Datos**. Detecta automáticamente:
- Tablas HTML
- Cards / artículos (`.card`, `.item`, `.product`, etc.)
- Listas (`<ul>`, `<ol>`)
- Encabezados con descripción

### 🎯 Modo Selector
Escribe un **selector CSS** para extraer elementos específicos:
- `.product-title` → todos los elementos con esa clase
- `table tbody tr` → todas las filas de una tabla
- `h2 a` → todos los links dentro de h2
- `[data-price]` → elementos con atributo data-price

### 👆 Modo Picker
1. Activa el picker
2. Haz clic en los elementos que quieras en la página (se resaltan en verde)
3. Presiona `Esc` para terminar y obtener los datos

### Opciones
- **Incluir enlaces** → extrae los `href` de links
- **Incluir imágenes** → extrae `src` y `alt` de imágenes
- **Incluir atributos** → extrae todos los atributos HTML del elemento

### Exportar
- **📋 Copiar** → copia el JSON al portapapeles
- **💾 Descargar** → descarga un archivo `.json`

## Estructura

```
extension/
├── manifest.json        ← Configuración de la extensión (Manifest V3)
├── background.js        ← Service worker
├── content.js           ← Script inyectado en páginas (picker)
├── content.css          ← Estilos del picker
├── popup/
│   ├── popup.html       ← UI del popup
│   ├── popup.css        ← Estilos
│   └── popup.js         ← Lógica de extracción
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Notas

- Funciona en cualquier página web (excepto `chrome://` y páginas internas del navegador)
- Los datos se exportan siempre como array de objetos JSON
- El picker no persiste entre recargas de página
- Para actualizar después de cambios: ve a `chrome://extensions/` y haz clic en el botón de recarga (🔄)

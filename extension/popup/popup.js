/**
 * popup.js – Extrae .content-validation y todos sus hijos en JSON.
 * Especializado para páginas de corrección de 360Learning.
 * v1.1 – Descarga archivos adjuntos usando la cookie de sesión del navegador.
 */

let extractedData = null;

// ── Configuración ──────────────────────────────────────────────
// Pon aquí la URL de tu webhook de Make (déjalo vacío para desactivar)
const MAKE_WEBHOOK_URL = '';
const BASE_360 = 'https://app.360learning.com';

const extractBtn   = document.getElementById('extractBtn');
const resultsDiv   = document.getElementById('results');
const resultCount  = document.getElementById('resultCount');
const preview      = document.getElementById('preview');
const copyBtn      = document.getElementById('copyBtn');
const downloadBtn  = document.getElementById('downloadBtn');
const testDlBtn    = document.getElementById('testDownloadBtn');
const statusDiv    = document.getElementById('status');

// ── Extraer ────────────────────────────────────────────────────
extractBtn.addEventListener('click', async () => {
  extractBtn.disabled = true;
  extractBtn.textContent = '⏳ Extrayendo...';
  statusDiv.classList.add('hidden');
  resultsDiv.classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',            // Ejecutar en el contexto JS de la página (acceso a Vue)
      func: extractContentValidation,
    });

    const data = results[0]?.result;

    if (!data || data.length === 0) {
      showStatus('No se encontró .content-validation en esta página.', 'error');
    } else {
      extractedData = data;
      resultCount.textContent = `${data.length} validación(es)`;
      const json = JSON.stringify(data, null, 2);
      preview.textContent = json.length > 8000
        ? json.slice(0, 8000) + '\n\n... (truncado)'
        : json;
      resultsDiv.classList.remove('hidden');
      showStatus(`✅ ${data.length} validación(es) extraída(s)`, 'success');
    }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }

  extractBtn.disabled = false;
  extractBtn.textContent = '🔍 Extraer Datos';
});

// ── Copiar ─────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  if (!extractedData) return;
  await navigator.clipboard.writeText(JSON.stringify(extractedData, null, 2));
  copyBtn.textContent = '✅ Copiado';
  setTimeout(() => (copyBtn.textContent = '📋 Copiar'), 1500);
});

// ── Descargar JSON ─────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!extractedData) return;
  const blob = new Blob([JSON.stringify(extractedData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  chrome.downloads.download({ url, filename: `360learning_${ts}.json`, saveAs: true });
});

// ── Test descarga (cURL simulado con cookies) ─────────────────
if (testDlBtn) {
  testDlBtn.addEventListener('click', async () => {
    if (!extractedData) {
      showStatus('⚠️ Primero extrae datos', 'error');
      return;
    }

    // Recopilar TODOS los adjuntos con URL descargable
    const allAdjuntos = [];
    for (const item of extractedData) {
      if (!item.respuesta?.adjuntos) continue;
      for (const adj of item.respuesta.adjuntos) {
        const candidates = [adj.urlPdf, adj.urlArchivo, adj.src, adj.iframeSrc].filter(Boolean);
        for (const url of candidates) {
          if (url.startsWith('/api/') || url.startsWith('/client/')) {
            let resolvedUrl;
            if (url.includes('file=')) {
              try {
                const params = new URLSearchParams(url.split('?')[1]);
                const f = params.get('file');
                resolvedUrl = f ? decodeURIComponent(f) : url;
              } catch { resolvedUrl = url; }
            } else {
              resolvedUrl = url;
            }
            allAdjuntos.push({ adj, fileUrl: resolvedUrl });
            break; // una URL por adjunto es suficiente
          }
        }
      }
    }

    if (allAdjuntos.length === 0) {
      showStatus('⚠️ No hay adjuntos con URL descargable.\n\nSi hay archivos sin preview (xlsx, etc.), revisa que el JSON extraído contenga mediaId o _vueError/_interceptError para diagnosticar.', 'error');
      return;
    }
    testDlBtn.disabled = true;
    testDlBtn.textContent = '⏳ Descargando...';
    showStatus(`🧪 Descargando ${allAdjuntos.length} archivo(s)...`, 'success');

    try {
      // 1. Obtener cookies (una sola vez para todas las descargas)
      const cookies = await get360Cookies();
      const cookieCount = cookies.split(';').length;
      showStatus(`🍪 ${cookieCount} cookie(s) obtenidas. Descargando ${allAdjuntos.length} archivo(s)...`, 'success');

      const resultados = [];
      const errores = [];

      // 2. Descargar cada adjunto
      for (let i = 0; i < allAdjuntos.length; i++) {
        const { adj, fileUrl } = allAdjuntos[i];
        showStatus(`⏳ Descargando ${i + 1}/${allAdjuntos.length}: ${adj.titulo || adj.tipo || 'archivo'}...`, 'success');

        try {
          const fileData = await downloadFileWithCookies(fileUrl, cookies);

          const sizeKB = (fileData.size / 1024).toFixed(1);
          const sizeMB = (fileData.size / 1048576).toFixed(2);
          const sizeStr = fileData.size > 1048576 ? `${sizeMB} MB` : `${sizeKB} KB`;

          const ext = adj.tipo || 'bin';
          const nombre = (adj.titulo || `archivo_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
          const filename = `${nombre}.${ext}`;

          const dataUrl = `data:${fileData.mimeType};base64,${fileData.base64}`;
          chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false, // no pedir "Guardar como" para cada archivo
          });

          resultados.push(`✅ ${filename} (${sizeStr})`);
          console.log(`🧪 Descarga ${i + 1}/${allAdjuntos.length} OK:`, { url: `${BASE_360}${fileUrl}`, size: fileData.size, mime: fileData.mimeType });
        } catch (err) {
          errores.push(`❌ ${adj.titulo || adj.tipo || `archivo_${i + 1}`}: ${err.message}`);
          console.error(`🧪 Descarga ${i + 1}/${allAdjuntos.length} FALLÓ:`, err);
        }
      }

      // 3. Resumen final
      const msgParts = [];
      if (resultados.length > 0) {
        msgParts.push(`✅ ${resultados.length}/${allAdjuntos.length} archivo(s) descargado(s):`);
        msgParts.push('');
        msgParts.push(...resultados);
      }
      if (errores.length > 0) {
        msgParts.push('');
        msgParts.push(`❌ ${errores.length} error(es):`);
        msgParts.push(...errores);
        msgParts.push('');
        msgParts.push('Posibles causas:');
        msgParts.push('• Sesión expirada (recarga 360Learning)');
        msgParts.push('• Cookie insuficiente');
        msgParts.push('• El endpoint requiere otro formato de URL');
      }
      showStatus(msgParts.join('\n'), errores.length > 0 ? 'error' : 'success');

    } catch (err) {
      showStatus(`❌ Error general: ${err.message}`, 'error');
      console.error('🧪 Error general en descargas:', err);
    }

    testDlBtn.disabled = false;
    testDlBtn.textContent = '🧪 Test descarga';
  });
}

// ── Obtener cookies de 360Learning ─────────────────────────────
async function get360Cookies() {
  const cookies = await chrome.cookies.getAll({ domain: '360learning.com' });
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// ── Descargar archivo usando las cookies de sesión ──────────────
async function downloadFileWithCookies(relativeUrl, cookieString) {
  const fullUrl = `${BASE_360}${relativeUrl}`;

  const resp = await fetch(fullUrl, {
    method: 'GET',
    headers: { 'Cookie': cookieString },
    credentials: 'include',
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} al descargar ${relativeUrl}`);
  }

  const blob = await resp.blob();
  const mimeType = resp.headers.get('content-type') || blob.type || 'application/octet-stream';

  // Convertir a base64 para poder enviarlo en JSON
  const base64 = await blobToBase64(blob);

  return { base64, mimeType, size: blob.size };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Quitar el prefijo "data:...;base64,"
      const result = reader.result;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// Función inyectada en la página (contexto de la pestaña)
// ────────────────────────────────────────────────────────────────
async function extractContentValidation() {
  const nodes = document.querySelectorAll('.content-validation');
  if (!nodes.length) return [];

  // Extraer companyId de cualquier URL /api/medias/ visible en la página
  const companyId = (() => {
    const imgs = document.querySelectorAll('img[src*="/api/medias/"]');
    for (const img of imgs) {
      const m = (img.getAttribute('src') || '').match(/[?&]company=([a-f0-9]{24})/i);
      if (m) return m[1];
    }
    const el = document.querySelector('[src*="/api/medias/proxy/"]');
    if (el) {
      const m = (el.getAttribute('src') || '').match(/\/api\/medias\/proxy\/([a-f0-9]{24})/i);
      if (m) return m[1];
    }
    return null;
  })();

  const results = [];
  for (let idx = 0; idx < nodes.length; idx++) {
    const root = nodes[idx];
    const out = { _index: idx + 1 };

    /* ── Usuario ─────────────────────────────────────── */
    const userLink = root.querySelector('.widget-user-link.user-name');
    if (userLink) {
      out.usuario = {
        nombre: userLink.textContent.trim(),
        perfil: userLink.getAttribute('href') || '',
      };
    }

    const userImg = root.querySelector('.widget-image img');
    if (userImg) {
      out.usuario = out.usuario || {};
      out.usuario.avatar = userImg.getAttribute('src') || '';
    }

    /* ── Acción (ej. "respondió a esta pregunta") ───── */
    const titleDiv = root.querySelector('.content-title .title');
    if (titleDiv) {
      const raw = titleDiv.textContent.trim();
      const name = out.usuario?.nombre || '';
      out.accion = raw.replace(name, '').trim();
    }

    /* ── Contexto: curso y path ──────────────────────── */
    const stepLinks = root.querySelectorAll('.subtitle .step-name');
    if (stepLinks.length) {
      out.contexto = {};
      if (stepLinks[0]) out.contexto.curso = { nombre: stepLinks[0].textContent.trim(), url: stepLinks[0].getAttribute('href') || '' };
      if (stepLinks[1]) out.contexto.path  = { nombre: stepLinks[1].textContent.trim(), url: stepLinks[1].getAttribute('href') || '' };
    }

    /* ── Tarea ───────────────────────────────────────── */
    const qTitle = root.querySelector('.question-title');
    if (qTitle) {
      out.tarea = { titulo: qTitle.textContent.trim() };
    }

    const qContent = root.querySelector('.question-content .richtext');
    if (qContent) {
      out.tarea = out.tarea || {};
      out.tarea.descripcion = qContent.textContent.trim();
      out.tarea.descripcionHTML = qContent.innerHTML.trim();
    }

    /* ── Respuesta del alumno ────────────────────────── */
    const respEl = root.querySelector('[data-test="coaching-submission-text"]');
    const contentResp = root.querySelector('.content-response');
    out.respuesta = {};

    if (respEl) {
      out.respuesta.texto = respEl.textContent.trim();
      out.respuesta.html = respEl.innerHTML.trim();
    }

    // Archivos adjuntos: imágenes, PDFs, vídeos dentro de .media-viewer-wrapper
    if (contentResp) {
      const wrappers = contentResp.querySelectorAll('.media-viewer-wrapper');
      if (wrappers.length > 0) {
        const adjuntosList = [];
        for (const wrapper of wrappers) {
          const adjunto = {};

          // ── PDF (iframe con visor pdfjs) ─────────────────
          const pdfViewer = wrapper.querySelector('[data-test="media-viewer-pdf"]');
          if (pdfViewer) {
            adjunto.tipo = 'pdf';
            const iframe = pdfViewer.querySelector('iframe.pdf-iframe');
            if (iframe) {
              adjunto.titulo = iframe.getAttribute('title') || '';
              const iframeSrc = iframe.getAttribute('src') || '';
              // Extraer la URL real del PDF del parámetro "file="
              try {
                const params = new URLSearchParams(iframeSrc.split('?')[1] || '');
                const fileUrl = params.get('file');
                adjunto.urlPdf = fileUrl ? decodeURIComponent(fileUrl) : iframeSrc;
              } catch {
                adjunto.urlPdf = iframeSrc;
              }
              adjunto.iframeSrc = iframeSrc;
            }
          }

          // ── Imagen ───────────────────────────────────────
          const imgViewer = wrapper.querySelector('.media-viewer-image');
          if (imgViewer) {
            adjunto.tipo = 'imagen';
            const img = imgViewer.querySelector('img');
            if (img) {
              adjunto.src = img.getAttribute('src') || img.src || '';
              adjunto.alt = img.getAttribute('alt') || '';
            }
            // background-image como fallback
            if (!adjunto.src) {
              const bgDiv = imgViewer.querySelector('[style*="background-image"]');
              if (bgDiv) {
                const style = bgDiv.getAttribute('style') || '';
                const match = style.match(/url\(["']?([^"')]+)["']?\)/);
                if (match) adjunto.src = match[1];
              }
            }
            // Cualquier src como último recurso
            if (!adjunto.src) {
              const anySrc = imgViewer.querySelector('[src]');
              if (anySrc) adjunto.src = anySrc.getAttribute('src') || '';
            }
          }

          // ── Vídeo ────────────────────────────────────────
          const videoEl = wrapper.querySelector('video');
          if (videoEl && !adjunto.tipo) {
            adjunto.tipo = 'video';
            const source = videoEl.querySelector('source');
            adjunto.src = (source || videoEl).getAttribute('src') || '';
          }

          // ── Archivo sin preview (xlsx, docx, zip, etc.) ──
          const noPreview = wrapper.querySelector('.no-preview-media-viewer');
          if (noPreview && !adjunto.tipo) {
            adjunto.tipo = 'archivo';
            const dlBtn = noPreview.querySelector('.no-preview-media-viewer-download');
            if (dlBtn) adjunto.textoBoton = dlBtn.textContent.trim();

            // ─── Estrategia 1: Vue component tree walk (MAIN world) ───
            try {
              let el = noPreview;
              while (el && !adjunto.urlArchivo) {
                // Vue 3: __vueParentComponent
                const comp = el.__vueParentComponent;
                if (comp) {
                  let c = comp;
                  for (let d = 0; d < 25 && c; d++) {
                    // Buscar en props, setupState, data, ctx
                    const sources = [
                      c.props,
                      c.setupState,
                      c.data,
                      c.ctx,
                      c.provides,
                    ];
                    for (const obj of sources) {
                      if (!obj || typeof obj !== 'object') continue;
                      // Buscar recursivamente (1 nivel de profundidad)
                      const searchObj = (o, depth) => {
                        if (!o || typeof o !== 'object' || depth > 2) return;
                        for (const [k, v] of Object.entries(o)) {
                          if (typeof v === 'string') {
                            if (v.includes('/api/medias/') && !v.includes('/user/') && !v.includes('/group/') && !v.includes('/logo')) {
                              adjunto.urlArchivo = v;
                            }
                            if (/^[a-f0-9]{24}$/i.test(v)) {
                              // Guardar cualquier ObjectId encontrado con su key
                              if (!adjunto._ids) adjunto._ids = {};
                              adjunto._ids[k] = v;
                              if (k === '_id' || k.toLowerCase().includes('media')) {
                                adjunto.mediaId = v;
                              }
                            }
                          } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                            searchObj(v, depth + 1);
                          }
                        }
                      };
                      try { searchObj(obj, 0); } catch {}
                      if (adjunto.urlArchivo) break;
                    }
                    if (adjunto.urlArchivo) break;
                    c = c.parent;
                  }
                  break; // Found Vue component, stop DOM walk
                }
                // Fallback: buscar __vue_app__ o claves __vue*
                const vueKey = Object.keys(el).find(k => k.startsWith('__vue'));
                if (vueKey && el[vueKey]) {
                  const inst = el[vueKey];
                  const searchFlat = (o) => {
                    if (!o || typeof o !== 'object') return;
                    for (const [k, v] of Object.entries(o)) {
                      if (typeof v === 'string' && v.includes('/api/medias/')) adjunto.urlArchivo = v;
                      if (typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v)) {
                        if (!adjunto._ids) adjunto._ids = {};
                        adjunto._ids[k] = v;
                      }
                    }
                  };
                  try { searchFlat(inst.props || inst); } catch {}
                  if (adjunto.urlArchivo) break;
                }
                el = el.parentElement;
              }
            } catch (e) { adjunto._vueError = e?.message; }

            // ─── Estrategia 2: Interceptar fetch/XHR + click programático ───
            if (!adjunto.urlArchivo && dlBtn) {
              try {
                const captured = await new Promise((resolve) => {
                  const origFetch = window.fetch;
                  const origXhrOpen = XMLHttpRequest.prototype.open;
                  const origWindowOpen = window.open;
                  let done = false;
                  let timer;

                  function cleanup() {
                    if (done) return;
                    done = true;
                    window.fetch = origFetch;
                    XMLHttpRequest.prototype.open = origXhrOpen;
                    window.open = origWindowOpen;
                    clearTimeout(timer);
                  }

                  // Interceptar fetch
                  window.fetch = function(input, init) {
                    const url = typeof input === 'string' ? input : input?.url || '';
                    if (url.includes('/api/medias/') && !url.includes('/user/') && !url.includes('/group/') && !url.includes('/logo')) {
                      cleanup();
                      resolve(url);
                      return Promise.resolve(new Response('', { status: 200 }));
                    }
                    return origFetch.apply(this, arguments);
                  };

                  // Interceptar XHR
                  XMLHttpRequest.prototype.open = function(method, url) {
                    if (typeof url === 'string' && url.includes('/api/medias/') && !url.includes('/user/') && !url.includes('/group/')) {
                      cleanup();
                      resolve(url);
                    }
                    return origXhrOpen.apply(this, arguments);
                  };

                  // Interceptar window.open
                  window.open = function(url) {
                    if (typeof url === 'string' && url.includes('/api/medias/')) {
                      cleanup();
                      resolve(url);
                      return null;
                    }
                    return origWindowOpen.apply(this, arguments);
                  };

                  // Click programático en "Descargar el documento"
                  dlBtn.click();

                  // Timeout: si no se captura nada en 4s, darse por vencido
                  timer = setTimeout(() => { cleanup(); resolve(null); }, 4000);
                });

                if (captured) {
                  adjunto.urlArchivo = captured;
                  adjunto._metodo = 'interceptado';
                }
              } catch (e) { adjunto._interceptError = e?.message; }
            }

            // ─── Estrategia 3: Construir URL desde mediaId + companyId ───
            if (!adjunto.urlArchivo && adjunto.mediaId && companyId) {
              // Intentar el patrón proxy genérico
              adjunto.urlArchivo = `/api/medias/proxy/${companyId}/${adjunto.mediaId}/original`;
              adjunto._metodo = 'construida';
            }

            // Limpiar campos internos de debug
            if (adjunto._ids && !adjunto.mediaId) {
              // Si no encontramos mediaId pero sí _ids, tomar el primer _id
              const ids = adjunto._ids;
              adjunto.mediaId = ids._id || ids.mediaId || Object.values(ids)[0];
            }
            delete adjunto._ids;
          }

          // ── Fallback genérico ────────────────────────────
          if (!adjunto.tipo) {
            const mv = wrapper.querySelector('.media-viewer');
            if (mv) {
              const dataTest = mv.getAttribute('data-test') || '';
              adjunto.tipo = dataTest.replace('media-viewer-', '') || 'desconocido';
              const anySrc = mv.querySelector('[src]');
              if (anySrc) {
                adjunto.src = anySrc.getAttribute('src') || '';
                adjunto.tagName = anySrc.tagName.toLowerCase();
              }
            }
          }

          adjunto.htmlCompleto = wrapper.innerHTML.trim();

          adjuntosList.push(adjunto);
        }
        out.respuesta.adjuntos = adjuntosList;
      }
    }

    // Si respuesta quedó vacía, limpiar
    if (!out.respuesta.texto && !out.respuesta.adjuntos) {
      delete out.respuesta;
    }

    /* ── Estado de evaluación ────────────────────────── */
    const grading = root.querySelector('.correction-grading-container');
    if (grading) {
      const btns = grading.querySelectorAll('.option-button');
      out.evaluacion = {};
      btns.forEach((b) => {
        const checked = b.getAttribute('aria-checked') === 'true';
        const test = b.getAttribute('data-test') || '';
        const label = b.textContent.trim();
        if (test.includes('failure'))  out.evaluacion.rechazar       = checked;
        if (test.includes('toRetry'))  out.evaluacion.nuevoIntento   = checked;
        if (test.includes('success'))  out.evaluacion.confirmar      = checked;
        if (checked) out.evaluacion.estadoActual = label;
      });
    }

    /* ── Comentarios del evaluador ───────────────────── */
    const fb = root.querySelector('.general-feedback [contenteditable]');
    if (fb) {
      const t = fb.textContent.trim();
      if (t) out.comentarios = t;
    }

    results.push(out);
  }
  return results;
}

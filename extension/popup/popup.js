/**
 * popup.js – Extrae .content-validation y todos sus hijos en JSON.
 * Especializado para páginas de corrección de 360Learning.
 */

let extractedData = null;

const extractBtn   = document.getElementById('extractBtn');
const resultsDiv   = document.getElementById('results');
const resultCount  = document.getElementById('resultCount');
const preview      = document.getElementById('preview');
const copyBtn      = document.getElementById('copyBtn');
const downloadBtn  = document.getElementById('downloadBtn');
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

// ── Descargar ──────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!extractedData) return;
  const blob = new Blob([JSON.stringify(extractedData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  chrome.downloads.download({ url, filename: `360learning_${ts}.json`, saveAs: true });
});

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');
}

// ────────────────────────────────────────────────────────────────
// Función inyectada en la página (contexto de la pestaña)
// ────────────────────────────────────────────────────────────────
function extractContentValidation() {
  const nodes = document.querySelectorAll('.content-validation');
  if (!nodes.length) return [];

  return Array.from(nodes).map((root, idx) => {
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
        out.respuesta.adjuntos = Array.from(wrappers).map((wrapper) => {
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

          return adjunto;
        });
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

    return out;
  });
}

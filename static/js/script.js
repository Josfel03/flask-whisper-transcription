// --- SPA TABS MANAGEMENT ---
document.addEventListener('DOMContentLoaded', function () {
  // Tab navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = {
    transcripcion: document.getElementById('tab-transcripcion'),
    sentimientos: document.getElementById('tab-sentimientos'),
    evaluacion: document.getElementById('tab-evaluacion')
  };
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      tabBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      Object.keys(tabContents).forEach(key => tabContents[key].style.display = 'none');
      tabContents[this.dataset.tab].style.display = '';
    });
  });
  // Inicializa mostrando la pestaña de transcripción
  tabBtns[0].click();
});

// --- VARIABLES GLOBALES ---
let currentJobId = null;
let pollInterval = null;
let csvData = null;

// --- ELEMENTOS DEL DOM ---
const elements = {
  // Sistema
  systemHealth: document.getElementById('systemHealth'),
  spacyStatus: document.getElementById('spacyStatus'),
  whisperStatus: document.getElementById('whisperStatus'),
  activeJobs: document.getElementById('activeJobs'),
  // TRANSCRIPCIÓN DE AUDIO
  trans_audioFile: document.getElementById('trans_audioFile'),
  trans_audioFileInfo: document.getElementById('trans_audioFileInfo'),
  trans_btnTranscribir: document.getElementById('trans_btnTranscribir'),
  trans_btnClearTrans: document.getElementById('trans_btnClearTrans'),
  trans_btnListarArchivos: document.getElementById('trans_btnListarArchivos'),
  trans_loaderAUD: document.getElementById('trans_loaderAUD'),
  trans_statusAUD: document.getElementById('trans_statusAUD'),
  trans_errorAUD: document.getElementById('trans_errorAUD'),
  trans_transcriptionStatus: document.getElementById('trans_transcriptionStatus'),
  trans_progressContainer: document.getElementById('trans_progressContainer'),
  trans_progressBar: document.getElementById('trans_progressBar'),
  trans_progressText: document.getElementById('trans_progressText'),
  trans_resultadoTranscripcion: document.getElementById('trans_resultadoTranscripcion'),
  trans_sectionArchivos: document.getElementById('trans_sectionArchivos'),
  trans_fileList: document.getElementById('trans_fileList'),

  // SENTIMIENTOS
  sent_csvFile: document.getElementById('sent_csvFile'),
  sent_csvFileInfo: document.getElementById('sent_csvFileInfo'),
  sent_btnProcesar: document.getElementById('sent_btnProcesar'),
  sent_btnClear: document.getElementById('sent_btnClear'),
  sent_btnExport: document.getElementById('sent_btnExport'),
  sent_loader: document.getElementById('sent_loader'),
  sent_status: document.getElementById('sent_status'),
  sent_resultado: document.getElementById('sent_resultado'),
  sent_charts: document.getElementById('sent_charts'),

  // EVALUACIÓN/MÉTRICAS
  eval_btnCargarMetrics: document.getElementById('eval_btnCargarMetrics'),
  eval_btnExportMetrics: document.getElementById('eval_btnExportMetrics'),
  eval_loaderML: document.getElementById('eval_loaderML'),
  eval_statusML: document.getElementById('eval_statusML'),
  eval_resultadoMetrics: document.getElementById('eval_resultadoMetrics'),
  eval_chartsMetrics: document.getElementById('eval_chartsMetrics'),
};

// --- UTILIDADES ---
function show(element) {
  if (element) element.style.display = 'flex';
}
function hide(element) {
  if (element) element.style.display = 'none';
}
function showBlock(element) {
  if (element) element.style.display = 'block';
}
function formatFileSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
function formatDate(isoString) {
  return new Date(isoString).toLocaleString('es-MX');
}

// --- SISTEMA: CHEQUEO DE ESTADO ---
async function checkSystemHealth() {
  try {
    const response = await fetch('/health');
    const data = await response.json();
    elements.systemHealth.textContent = data.status === 'ok' ? '✅ Operativo' : '❌ Error';
    elements.systemHealth.className = 'status-value ' + (data.status === 'ok' ? 'success' : 'error');
    elements.spacyStatus.textContent = data.spacy_loaded ? '✅ Cargado' : '❌ No disponible';
    elements.spacyStatus.className = 'status-value ' + (data.spacy_loaded ? 'success' : 'error');
    const whisperOk = data.whisper_binary && data.whisper_model;
    elements.whisperStatus.textContent = whisperOk ? '✅ Disponible' : '❌ No configurado';
    elements.whisperStatus.className = 'status-value ' + (whisperOk ? 'success' : 'error');
    elements.activeJobs.textContent = data.active_jobs || 0;
  } catch (error) {
    elements.systemHealth.textContent = '❌ Error de conexión';
    elements.systemHealth.className = 'status-value error';
  }
}

// --- AUDIO: GESTIÓN DE INPUT Y VALIDACIÓN ---
if (elements.trans_audioFile) {
  elements.trans_audioFile.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const label = document.querySelector('label[for="trans_audioFile"]');
    const errorElement = document.getElementById('trans_audioFileError');
    errorElement.textContent = '';
    if (file) {
      const maxSize = 45 * 1024 * 1024;
      if (file.size > maxSize) {
        errorElement.textContent = 'El archivo excede el tamaño máximo permitido de 45 MB';
        e.target.value = '';
        label.textContent = '🎵 Seleccionar archivo de audio';
        label.classList.remove('has-file');
        elements.trans_audioFileInfo.textContent = 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC, OPUS';
        return;
      }
      label.textContent = `🎵 ${file.name}`;
      label.classList.add('has-file');
      elements.trans_audioFileInfo.textContent = `Tamaño: ${formatFileSize(file.size)} | Tipo: ${file.type}`;
    } else {
      label.textContent = '🎵 Seleccionar archivo de audio';
      label.classList.remove('has-file');
      elements.trans_audioFileInfo.textContent = 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC, OPUS';
    }
  });
}

// --- AUDIO: TRANSCRIPCIÓN ---
if (elements.trans_btnTranscribir) {
  elements.trans_btnTranscribir.addEventListener('click', async function () {
    const file = elements.trans_audioFile.files[0];
    if (!file) {
      alert('Por favor selecciona un archivo de audio.');
      return;
    }
    const maxSize = 45 * 1024 * 1024;
    if (file.size > maxSize) {
      document.getElementById('trans_audioFileError').textContent = 'El archivo excede el tamaño máximo permitido de 45 MB';
      return;
    }
    elements.trans_btnTranscribir.disabled = true;
    show(elements.trans_loaderAUD);
    hide(elements.trans_statusAUD);
    hide(elements.trans_errorAUD);
    showBlock(elements.trans_progressContainer);
    elements.trans_progressBar.style.width = '0%';
    elements.trans_progressText.textContent = 'Iniciando transcripción...';
    elements.trans_transcriptionStatus.textContent = 'Subiendo archivo...';
    const formData = new FormData();
    formData.append('audio', file);
    try {
      const response = await fetch('/transcribir', { method: 'POST', body: formData });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      currentJobId = data.job_id;
      startPolling(file.name);
    } catch (error) {
      elements.trans_btnTranscribir.disabled = false;
      hide(elements.trans_loaderAUD);
      show(elements.trans_errorAUD);
      hide(elements.trans_progressContainer);
      elements.trans_resultadoTranscripcion.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ ${error.message}</div>`;
      elements.trans_resultadoTranscripcion.classList.remove('empty');
    }
  });
}

// --- POLLING DE TRANSCRIPCIÓN ---
function startPolling(filename) {
  const startTime = Date.now();
  const maxDuration = 15 * 60 * 1000; // 15 minutos
  pollInterval = setInterval(async () => {
    if (Date.now() - startTime > maxDuration) {
      clearInterval(pollInterval);
      elements.trans_transcriptionStatus.textContent = 'Tiempo de espera agotado';
      elements.trans_btnTranscribir.disabled = false;
      hide(elements.trans_loaderAUD);
      show(elements.trans_errorAUD);
      hide(elements.trans_progressContainer);
      return;
    }
    try {
      const response = await fetch(`/estado/${currentJobId}`);
      const data = await response.json();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      elements.trans_progressText.textContent = `Tiempo transcurrido: ${elapsed}s`;
      if (data.status === 'processing') {
        const progress = Math.min(95, data.progress || 0);
        elements.trans_progressBar.style.width = `${progress}%`;
        elements.trans_transcriptionStatus.textContent = `Procesando ${filename}...`;
      } else if (data.status === 'completed') {
        clearInterval(pollInterval);
        elements.trans_progressBar.style.width = '100%';
        elements.trans_transcriptionStatus.textContent = `Completado: ${data.saved_as}`;
        elements.trans_resultadoTranscripcion.textContent = data.transcripcion;
        elements.trans_resultadoTranscripcion.classList.remove('empty');
        hide(elements.trans_loaderAUD);
        show(elements.trans_statusAUD);
        elements.trans_btnTranscribir.disabled = false;
        setTimeout(() => {
          hide(elements.trans_progressContainer);
          hide(elements.trans_statusAUD);
        }, 5000);
      } else if (data.status === 'failed') {
        clearInterval(pollInterval);
        elements.trans_transcriptionStatus.textContent = 'Error en transcripción';
        elements.trans_resultadoTranscripcion.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ ${data.error || 'Error desconocido'}</div>`;
        elements.trans_resultadoTranscripcion.classList.remove('empty');
        elements.trans_btnTranscribir.disabled = false;
        hide(elements.trans_loaderAUD);
        show(elements.trans_errorAUD);
        hide(elements.trans_progressContainer);
      }
    } catch (error) {
      // Polling error: ignora para no frenar loop, pero puedes mostrar error si quieres
    }
  }, 2000);
}

// --- AUDIO: LIMPIAR TRANSCRIPCIÓN ---
if (elements.trans_btnClearTrans) {
  elements.trans_btnClearTrans.addEventListener('click', function () {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    elements.trans_resultadoTranscripcion.innerHTML = 'Aquí aparecerá la transcripción cuando proceses un archivo de audio...';
    elements.trans_resultadoTranscripcion.classList.add('empty');
    elements.trans_progressText.textContent = '';
    hide(elements.trans_progressContainer);
    hide(elements.trans_statusAUD);
    hide(elements.trans_errorAUD);
    currentJobId = null;
  });
}

// --- AUDIO: LISTAR ARCHIVOS ---
if (elements.trans_btnListarArchivos) {
  elements.trans_btnListarArchivos.addEventListener('click', async function () {
    showBlock(elements.trans_sectionArchivos);
    await loadFileList();
  });
}
async function loadFileList() {
  try {
    elements.trans_fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">Cargando...</div>';
    const response = await fetch('/listar_archivos');
    const data = await response.json();
    if (data.error) {
      elements.trans_fileList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ ${data.error}</div>`;
      return;
    }
    if (!data.archivos.length) {
      elements.trans_fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No hay archivos de transcripción</div>';
      return;
    }
    const html = data.archivos.map(archivo => `
      <div class="file-item">
        <div>
          <div class="file-name">📄 ${archivo.nombre}</div>
          <div class="file-meta">${formatFileSize(archivo.tamaño)} • ${formatDate(archivo.modificado)}</div>
        </div>
        <button class="btn btn-secondary btn-small" onclick="downloadFile('${archivo.nombre}')">💾 Descargar</button>
      </div>
    `).join('');
    elements.trans_fileList.innerHTML = html;
  } catch (error) {
    elements.trans_fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ Error cargando archivos</div>';
  }
}

// --- DESCARGAR ARCHIVO DE TRANSCRIPCIÓN ---
window.downloadFile = function (filename) {
  window.open(`/descargar/${filename}`, '_blank');
};

// --- SENTIMIENTOS: MANEJO DE CSV ---
if (elements.sent_csvFile) {
  elements.sent_csvFile.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const label = document.querySelector('label[for="sent_csvFile"]');
    elements.sent_csvFileInfo.textContent = file
      ? `Tamaño: ${formatFileSize(file.size)} | Nombre: ${file.name}`
      : '';
    if (label) {
      label.textContent = file ? `📁 ${file.name}` : "📁 Seleccionar archivo CSV";
      if (file) label.classList.add('has-file');
      else label.classList.remove('has-file');
    }
  });
}

if (elements.sent_btnProcesar) {
  elements.sent_btnProcesar.addEventListener('click', async function () {
    const file = elements.sent_csvFile.files[0];
    if (!file) {
      alert('Por favor selecciona un archivo CSV.');
      return;
    }
    elements.sent_btnProcesar.disabled = true;
    show(elements.sent_loader);
    hide(elements.sent_status);
    elements.sent_resultado.innerHTML = '';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/procesar', { method: 'POST', body: formData });
      const data = await response.json();
      elements.sent_btnProcesar.disabled = false;
      hide(elements.sent_loader);
     if (data.error) {
      elements.sent_resultado.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ ${data.error}</div>`;
      elements.sent_resultado.classList.remove('empty');
    } else {
      // ANTES: elements.sent_resultado.innerHTML = `<pre>${JSON.stringify(data.metadata || data, null, 2)}</pre>`;
      // AHORA:
      renderTablaSentimientos(data.data, data.metadata);
      show(elements.sent_status);
      elements.sent_btnExport.style.display = 'inline-block';
      setTimeout(() => hide(elements.sent_status), 3000);
    }
    } catch (error) {
      elements.sent_btnProcesar.disabled = false;
      hide(elements.sent_loader);
      elements.sent_resultado.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ Error de conexión con el servidor</div>`;
      elements.sent_resultado.classList.remove('empty');
    }
  });
}

// --- EVALUACIÓN/MÉTRICAS: SECCIÓN DEMO ---
// (puedes implementar lo que desees, aquí ejemplo de mostrar loader)
if (elements.eval_btnCargarMetrics) {
  elements.eval_btnCargarMetrics.addEventListener('click', function () {
    show(elements.eval_loaderML);
    setTimeout(() => {
      hide(elements.eval_loaderML);
      show(elements.eval_statusML);
      setTimeout(() => hide(elements.eval_statusML), 2000);
      elements.eval_resultadoMetrics.innerHTML =
        '<div style="color: #27ae60;">Métricas generadas de ejemplo.</div>';
      elements.eval_resultadoMetrics.classList.remove('empty');
    }, 1500);
  });
}
if (elements.eval_btnExportMetrics) {
  elements.eval_btnExportMetrics.addEventListener('click', function () {
    // Aquí tu lógica de exportación (demo)
    alert('Exportar reporte (demo)');
  });
}
function renderTablaSentimientos(matrix, metadata) {
  if (!matrix || !matrix.length) {
    elements.sent_resultado.innerHTML = 'No hay datos para mostrar.';
    return;
  }
  const cols = Object.keys(matrix[0]);
  let html = `<table><thead><tr><th style="width: 60px;">Op.</th>${
    cols.map(c => `<th>${c}</th>`).join('')
  }</tr></thead><tbody>`;
  html += matrix.map((row, i) =>
    `<tr><td><strong>${i + 1}</strong></td>${
      cols.map(col => `<td>${parseFloat(row[col]).toFixed(3)}</td>`).join('')
    }</tr>`
  ).join('');
  html += '</tbody></table>';

  if (metadata) {
    html += `
      <div class="metadata">
        <strong>📊 Estadísticas:</strong><br>
        • Filas: ${metadata.filas} <br>
        • Columnas: ${metadata.columnas} <br>
        • Textos procesados: ${metadata.textos_procesados} <br>
        • Archivo guardado: ${metadata.archivo_guardado}
      </div>
    `;
  }
  elements.sent_resultado.innerHTML = html;
  elements.sent_resultado.classList.remove('empty');
}

// --- INICIALIZACIÓN DEL SISTEMA ---
document.addEventListener('DOMContentLoaded', function () {
  checkSystemHealth();
  setInterval(checkSystemHealth, 30000);
});
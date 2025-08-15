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
  tabBtns[0].click(); // Inicializa mostrando la pestaña de transcripción
});

// --- VARIABLES GLOBALES ---
let currentJobId = null;
let pollInterval = null;
let lastSentimientoFile = null; // <--- Nuevo: último CSV generado por sentimientos

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
  sent_listadoArchivos: document.getElementById('sent_listadoArchivos'),

  // EVALUACIÓN/MÉTRICAS
  eval_btnCargarMetrics: document.getElementById('eval_btnCargarMetrics'),
  eval_btnExportMetrics: document.getElementById('eval_btnExportMetrics'),
  eval_loaderML: document.getElementById('eval_loaderML'),
  eval_statusML: document.getElementById('eval_statusML'),
  eval_resultadoMetrics: document.getElementById('eval_resultadoMetrics'),
  eval_chartsMetrics: document.getElementById('eval_chartsMetrics'),
};

// --- UTILIDADES ---
function show(element) { if (element) element.style.display = 'flex'; }
function hide(element) { if (element) element.style.display = 'none'; }
function showBlock(element) { if (element) element.style.display = 'block'; }
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

// --- AUDIO: SUBIR Y PROCESAR TRANSCRIPCIÓN ASÍNCRONA ---
if (elements.trans_audioFile) {
  elements.trans_audioFile.addEventListener('change', function (e) {
    const file = e.target.files[0];
    const label = document.querySelector('label[for="trans_audioFile"]');
    elements.trans_audioFileInfo.textContent = file
      ? `Tamaño: ${formatFileSize(file.size)} | Nombre: ${file.name}`
      : 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC, OPUS (MÁX. 45MB)';
    if (label) {
      label.textContent = file ? `🎵 ${file.name}` : "🎵 Seleccionar archivo de audio";
      if (file) label.classList.add('has-file');
      else label.classList.remove('has-file');
    }
    if (elements.trans_audioFileError) elements.trans_audioFileError.textContent = "";
  });
}

if (elements.trans_btnTranscribir) {
  elements.trans_btnTranscribir.addEventListener('click', async function () {
    const file = elements.trans_audioFile.files[0];
    if (!file) {
      if (elements.trans_audioFileError) elements.trans_audioFileError.textContent = 'Selecciona un archivo de audio.';
      return;
    }
    if (elements.trans_audioFileError) elements.trans_audioFileError.textContent = '';
    elements.trans_btnTranscribir.disabled = true;
    show(elements.trans_loaderAUD);
    hide(elements.trans_statusAUD);
    hide(elements.trans_errorAUD);
    elements.trans_resultadoTranscripcion.innerHTML = '';
    elements.trans_resultadoTranscripcion.classList.add('empty');
    elements.trans_progressText.textContent = '';
    elements.trans_progressBar.style.width = "0%";
    // Subir archivo al backend (inicia el trabajo)
    const formData = new FormData();
    formData.append('audio', file);
    try {
      const resp = await fetch('/transcribir', { method: 'POST', body: formData });
      const data = await resp.json();
      if (data.error || !data.job_id) {
        elements.trans_btnTranscribir.disabled = false;
        hide(elements.trans_loaderAUD);
        show(elements.trans_errorAUD);
        elements.trans_errorAUD.textContent = '❌ ' + (data.error || "No se pudo iniciar la transcripción");
        return;
      }
      // Iniciar polling para progreso y resultado
      const jobId = data.job_id;
      pollTranscripcionEstado(jobId);
    } catch (err) {
      elements.trans_btnTranscribir.disabled = false;
      hide(elements.trans_loaderAUD);
      show(elements.trans_errorAUD);
      elements.trans_errorAUD.textContent = '❌ Error de conexión';
    }
  });
}

// --- POLLING DEL ESTADO DE LA TRANSCRIPCIÓN ---
function pollTranscripcionEstado(jobId) {
  let intentos = 0;
  const maxIntentos = 180; // 3 minutos máximo
  function consultar() {
    fetch(`/estado/${jobId}`)
      .then(resp => resp.json())
      .then(data => {
        intentos++;
        // Progreso
        elements.trans_progressContainer.style.display = "block";
        let progreso = data.progress || 0;
        elements.trans_progressBar.style.width = progreso + "%";
        elements.trans_progressText.textContent = `Progreso: ${progreso}%`;
        // Estado
        if (data.status === "processing") {
          elements.trans_transcriptionStatus.textContent = "Procesando audio (" + progreso + "%)...";
          if (intentos < maxIntentos) setTimeout(consultar, 2000);
          else mostrarError("Tiempo de espera excedido.");
        } else if (data.status === "completed") {
          hide(elements.trans_loaderAUD);
          show(elements.trans_statusAUD);
          elements.trans_resultadoTranscripcion.innerHTML = data.transcripcion || "Transcripción vacía";
          elements.trans_resultadoTranscripcion.classList.remove('empty');
          elements.trans_btnTranscribir.disabled = false;
          elements.trans_progressBar.style.width = "100%";
          elements.trans_progressText.textContent = "¡Transcripción completada!";
        } else if (data.status === "failed") {
          mostrarError(data.error || "Error al transcribir");
        } else {
          mostrarError("Estado desconocido");
        }
      })
      .catch(() => {
        mostrarError("Error de conexión con el backend");
      });
  }
  function mostrarError(msg) {
    hide(elements.trans_loaderAUD);
    show(elements.trans_errorAUD);
    elements.trans_errorAUD.textContent = '❌ ' + msg;
    elements.trans_btnTranscribir.disabled = false;
    elements.trans_progressContainer.style.display = "none";
    elements.trans_progressText.textContent = '';
  }
  consultar();
}

// --- LIMPIAR SECCIÓN DE TRANSCRIPCIÓN ---
if (elements.trans_btnClearTrans) {
  elements.trans_btnClearTrans.addEventListener('click', function () {
    if (elements.trans_audioFile) elements.trans_audioFile.value = '';
    const label = document.querySelector('label[for="trans_audioFile"]');
    if (label) {
      label.textContent = "🎵 Seleccionar archivo de audio";
      label.classList.remove('has-file');
    }
    if (elements.trans_audioFileInfo) elements.trans_audioFileInfo.textContent = 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC, OPUS (MÁX. 45MB)';
    if (elements.trans_audioFileError) elements.trans_audioFileError.textContent = '';
    if (elements.trans_loaderAUD) hide(elements.trans_loaderAUD);
    if (elements.trans_statusAUD) hide(elements.trans_statusAUD);
    if (elements.trans_errorAUD) hide(elements.trans_errorAUD);
    if (elements.trans_resultadoTranscripcion) {
      elements.trans_resultadoTranscripcion.innerHTML = 'Aquí aparecerá la transcripción cuando proceses un archivo de audio...';
      elements.trans_resultadoTranscripcion.classList.add('empty');
    }
    elements.trans_progressContainer.style.display = "none";
    elements.trans_progressText.textContent = '';
    elements.trans_progressBar.style.width = "0%";
    elements.trans_btnTranscribir.disabled = false;
  });
}

// --- LISTAR Y DESCARGAR ARCHIVOS (ya lo tienes, se mantiene igual) ---
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
window.downloadFile = function (filename) {
  window.open(`/descargar/${filename}`, '_blank');
};

// --- SENTIMIENTOS: MANEJO DE CSV Y ARCHIVOS ---
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

// --- SENTIMIENTOS: PROCESAR, EXPORTAR, LISTAR ---
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
    lastSentimientoFile = null; // <--- Limpia el estado previo
    elements.sent_btnExport.style.display = 'none'; // Oculta hasta que haya archivo
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/sentimientos', { method: 'POST', body: formData });
      const data = await response.json();
      elements.sent_btnProcesar.disabled = false;
      hide(elements.sent_loader);
      if (data.error) {
        elements.sent_resultado.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ ${data.error}</div>`;
        elements.sent_resultado.classList.remove('empty');
      } else {
        // Mostrar gráfica solo positivo/negativo
        elements.sent_charts.style.display = 'block';
        document.getElementById('sent_barChart').outerHTML = `<img src="data:image/png;base64,${data.grafica_b64}" style="max-width:100%;">`;
        document.getElementById('sent_pieChart').style.display = 'none';
        // Mostrar resultados y enlace de descarga
        lastSentimientoFile = data.archivo_guardado.split('/').pop(); // <--- Guarda el último archivo generado
        elements.sent_resultado.innerHTML = `
          <div>Archivo generado: <b>${lastSentimientoFile}</b></div>
          <div>Positivos: ${data.positivos} | Negativos: ${data.negativos} | Neutros: ${data.neutros}</div>
          <button onclick="window.downloadSentimiento('${lastSentimientoFile}')">💾 Descargar CSV resultado</button>
        `;
        elements.sent_resultado.classList.remove('empty');
        show(elements.sent_status);
        elements.sent_btnExport.style.display = 'inline-block'; // Activa el botón exportar
        setTimeout(() => hide(elements.sent_status), 3000);
        // Mostrar tabla si tienes los datos disponibles
        if (data.data && typeof renderTablaSentimientos === 'function') {
          renderTablaSentimientos(data.data, data.metadata);
        }
      }
    } catch (error) {
      elements.sent_btnProcesar.disabled = false;
      hide(elements.sent_loader);
      elements.sent_resultado.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ Error de conexión con el servidor</div>`;
      elements.sent_resultado.classList.remove('empty');
      lastSentimientoFile = null;
      elements.sent_btnExport.style.display = 'none';
    }
  });
}

// --- SENTIMIENTOS: EXPORTAR ÚLTIMO ARCHIVO ---
if (elements.sent_btnExport) {
  elements.sent_btnExport.addEventListener('click', function () {
    if (!lastSentimientoFile) {
      alert('No hay archivo generado para exportar. Procesa un CSV primero.');
      return;
    }
    window.downloadSentimiento(lastSentimientoFile);
  });
}
window.downloadSentimiento = function (filename) {
  if (!filename) {
    alert('No se encontró el archivo para descargar');
    return;
  }
  window.open(`/descargar_sentimiento/${filename}`, '_blank');
};

// --- SENTIMIENTOS: LISTAR ARCHIVOS CSV MEJORADO ---
async function listarSentimientos() {
  try {
    elements.sent_listadoArchivos.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">Cargando...</div>';
    const response = await fetch('/listar_sentimientos');
    const data = await response.json();
    if (data.error) {
      elements.sent_listadoArchivos.innerHTML = `<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ ${data.error}</div>`;
      return;
    }
    if (!data.archivos.length) {
      elements.sent_listadoArchivos.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No hay archivos de resultados CSV</div>';
      return;
    }
    // Igual diseño que transcripciones
    const html = data.archivos.map(archivo => `
      <div class="file-item">
        <div>
          <div class="file-name">📄 ${archivo.nombre}</div>
          <div class="file-meta">${formatFileSize(archivo.tamaño)} • ${formatDate(archivo.modificado)}</div>
        </div>
        <button class="btn btn-secondary btn-small" onclick="window.downloadSentimiento('${archivo.nombre}')">💾 Descargar</button>
      </div>
    `).join('');
    elements.sent_listadoArchivos.innerHTML = html;
  } catch (error) {
    elements.sent_listadoArchivos.innerHTML = '<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ Error cargando archivos</div>';
  }
}

// --- SENTIMIENTOS: LIMPIAR RESULTADOS ---
if (elements.sent_btnClear) {
  elements.sent_btnClear.addEventListener('click', function () {
    elements.sent_resultado.innerHTML = 'Aquí aparecerán los resultados del análisis de sentimientos...';
    elements.sent_resultado.classList.add('empty');
    elements.sent_charts.style.display = 'none';
    lastSentimientoFile = null;
    elements.sent_btnExport.style.display = 'none';
    if (elements.sent_csvFile) elements.sent_csvFile.value = '';
    const label = document.querySelector('label[for="sent_csvFile"]');
    if (label) {
      label.textContent = "📁 Seleccionar archivo CSV";
      label.classList.remove('has-file');
    }
    elements.sent_csvFileInfo.textContent = '';
  });
}

// --- MÉTRICAS: SUBIDA Y VISUALIZACIÓN ---
const eval_csvFile = document.getElementById('eval_csvFile');
const eval_btnCargarMetrics = document.getElementById('eval_btnCargarMetrics');
const eval_loaderML = document.getElementById('eval_loaderML');
const eval_statusML = document.getElementById('eval_statusML');
const eval_resultadoMetrics = document.getElementById('eval_resultadoMetrics');
const eval_chartsMetrics = document.getElementById('eval_chartsMetrics');
const eval_confusionMatrix = document.getElementById('eval_confusionMatrix');

if (eval_btnCargarMetrics) {
  eval_btnCargarMetrics.addEventListener('click', async function () {
    const file = eval_csvFile.files[0];
    if (!file) {
      alert('Por favor selecciona un archivo CSV de métricas.');
      return;
    }
    eval_btnCargarMetrics.disabled = true;
    show(eval_loaderML);
    hide(eval_statusML);
    eval_resultadoMetrics.innerHTML = '';
    eval_chartsMetrics.style.display = 'none';

    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/evaluar_metricas_entrenando', { method: 'POST', body: formData });
      const data = await response.json();
      eval_btnCargarMetrics.disabled = false;
      hide(eval_loaderML);

      if (data.error) {
        eval_resultadoMetrics.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ ${data.error}</div>`;
        eval_resultadoMetrics.classList.remove('empty');
        return;
      }
      eval_resultadoMetrics.innerHTML = `
        <div><strong>Muestras evaluadas:</strong> ${data.n_muestras}</div>
        <div><strong>Accuracy:</strong> ${data.accuracy}</div>
        <div><strong>Recall:</strong> ${data.recall}</div>
        <div><strong>Precision:</strong> ${data.precision}</div>
        <div><strong>F1-score:</strong> ${data.f1}</div>
      `;
      eval_chartsMetrics.style.display = 'block';
      eval_confusionMatrix.outerHTML = `<img src="data:image/png;base64,${data.grafica_b64}" style="max-width:100%;">`;
      show(eval_statusML);
      setTimeout(() => hide(eval_statusML), 3000);

      // Opcional: mostrar tabla de métricas por clase
      if (data.report) {
        let html = `<table><thead><tr><th>Clase</th><th>Precision</th><th>Recall</th><th>F1</th><th>Soporte</th></tr></thead><tbody>`;
        ['negativo', 'neutro', 'positivo'].forEach(clase => {
          const r = data.report[clase] || {};
          html += `<tr><td>${clase}</td><td>${(r.precision||0).toFixed(3)}</td><td>${(r.recall||0).toFixed(3)}</td><td>${(r['f1-score']||0).toFixed(3)}</td><td>${r.support||0}</td></tr>`;
        });
        html += `</tbody></table>`;
        eval_resultadoMetrics.innerHTML += html;
      }
    } catch (error) {
      eval_btnCargarMetrics.disabled = false;
      hide(eval_loaderML);
      eval_resultadoMetrics.innerHTML = `<div class="status-indicator error" style="display: flex;">❌ Error de conexión con el servidor</div>`;
      eval_resultadoMetrics.classList.remove('empty');
    }
  });
}
// --- INICIALIZACIÓN DEL SISTEMA ---
document.addEventListener('DOMContentLoaded', function () {
  checkSystemHealth();
  setInterval(checkSystemHealth, 30000);
});
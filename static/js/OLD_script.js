    // Variables globales
    let currentJobId = null;
    let pollInterval = null;
    let csvData = null;

    // Elementos del DOM
    const elements = {
      // Sistema
      systemHealth: document.getElementById('systemHealth'),
      spacyStatus: document.getElementById('spacyStatus'),
      whisperStatus: document.getElementById('whisperStatus'),
      activeJobs: document.getElementById('activeJobs'),
      
      // CSV
      csvFile: document.getElementById('csvFile'),
      csvFileInfo: document.getElementById('csvFileInfo'),
      btnProcesar: document.getElementById('btnProcesar'),
      btnClearTabla: document.getElementById('btnClearTabla'),
      btnExportCSV: document.getElementById('btnExportCSV'),
      loaderCSV: document.getElementById('loaderCSV'),
      statusCSV: document.getElementById('statusCSV'),
      resultado: document.getElementById('resultado'),
      
      // Audio
      audioFile: document.getElementById('audioFile'),
      audioFileInfo: document.getElementById('audioFileInfo'),
      btnTranscribir: document.getElementById('btnTranscribir'),
      btnClearTrans: document.getElementById('btnClearTrans'),
      btnListarArchivos: document.getElementById('btnListarArchivos'),
      loaderAUD: document.getElementById('loaderAUD'),
      statusAUD: document.getElementById('statusAUD'),
      errorAUD: document.getElementById('errorAUD'),
      transcriptionStatus: document.getElementById('transcriptionStatus'),
      progressContainer: document.getElementById('progressContainer'),
      progressBar: document.getElementById('progressBar'),
      progressText: document.getElementById('progressText'),
      resultadoTranscripcion: document.getElementById('resultadoTranscripcion'),
      
      // Archivos
      sectionArchivos: document.getElementById('sectionArchivos'),
      fileList: document.getElementById('fileList')
    };

    // Funciones de utilidad
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

    // Verificar estado del sistema
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
        console.error('Error verificando estado del sistema:', error);
        elements.systemHealth.textContent = '❌ Error de conexión';
        elements.systemHealth.className = 'status-value error';
      }
    }

    // Manejo de archivos CSV
   elements.audioFile.addEventListener('change', function(e) {
      const file = e.target.files[0];
      const label = document.querySelector('label[for="audioFile"]');
      const errorElement = document.getElementById('audioFileError');
      
      // Limpiar mensajes anteriores
      errorElement.textContent = '';
      
      if (file) {
        // Validar tamaño máximo: 45 MB
        const maxSize = 45 * 1024 * 1024; // 45 MB en bytes
        if (file.size > maxSize) {
          errorElement.textContent = 'El archivo excede el tamaño máximo permitido de 45 MB';
          e.target.value = ''; // Limpiar el input
          label.textContent = '🎵 Seleccionar archivo de audio';
          label.classList.remove('has-file');
          elements.audioFileInfo.textContent = 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC';
          return;
        }
        
        label.textContent = `🎵 ${file.name}`;
        label.classList.add('has-file');
        elements.audioFileInfo.textContent = `Tamaño: ${formatFileSize(file.size)} | Tipo: ${file.type}`;
      } else {
        label.textContent = '🎵 Seleccionar archivo de audio';
        label.classList.remove('has-file');
        elements.audioFileInfo.textContent = 'Formatos soportados: MP3, WAV, M4A, OGG, FLAC, AAC';
      }
    });
    // Procesamiento de CSV
    elements.btnProcesar.addEventListener('click', async function() {
      const file = elements.csvFile.files[0];
      if (!file) {
        alert('Por favor selecciona un archivo CSV.');
        return;
      }

      elements.btnProcesar.disabled = true;
      show(elements.loaderCSV);
      hide(elements.statusCSV);
      hide(elements.errorAUD);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/procesar', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        elements.btnProcesar.disabled = false;
        hide(elements.loaderCSV);

        if (data.error) {
          elements.resultado.innerHTML = `
            <div class="status-indicator error" style="display: flex;">
              ❌ ${data.error}
            </div>
          `;
          elements.resultado.classList.remove('empty');
        } else {
          csvData = data.data;
          renderTabla(data.data, data.metadata);
          show(elements.statusAUD);
          elements.btnExportCSV.style.display = 'inline-block';
          
          setTimeout(() => hide(elements.statusCSV), 3000);
        }
      } catch (error) {
        elements.btnProcesar.disabled = false;
        hide(elements.loaderCSV);
        console.error('Error:', error);
        elements.resultado.innerHTML = `
          <div class="status-indicator error" style="display: flex;">
            ❌ Error de conexión con el servidor
          </div>
        `;
        elements.resultado.classList.remove('empty');
      }
    });

    // Renderizar tabla TF-IDF
    function renderTabla(data, metadata) {
      if (!data.length) {
        elements.resultado.innerHTML = '<div style="text-align: center; color: #7f8c8d;">No hay datos para mostrar</div>';
        return;
      }

      const cols = Object.keys(data[0]);
      let html = `
        <table>
          <thead>
            <tr>
              <th style="width: 60px;">Opinión</th>
              ${cols.map(c => `<th>${c}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map((row, i) => `
              <tr>
                <td><strong>Op.${i + 1}</strong></td>
                ${cols.map(col => `<td>${parseFloat(row[col]).toFixed(3)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      if (metadata) {
        html += `
          <div class="metadata">
            <strong>📊 Estadísticas del Procesamiento:</strong><br>
            • Filas procesadas: ${metadata.filas}<br>
            • Características TF-IDF: ${metadata.columnas}<br>
            • Textos válidos: ${metadata.textos_procesados}<br>
            • Archivo guardado: ${metadata.archivo_guardado}
          </div>
        `;
      }

      elements.resultado.innerHTML = html;
      elements.resultado.classList.remove('empty');
    }

    // Limpiar resultados CSV
    elements.btnClearTabla.addEventListener('click', function() {
      elements.resultado.innerHTML = 'Aquí aparecerá la matriz TF-IDF cuando proceses un archivo CSV...';
      elements.resultado.classList.add('empty');
      elements.btnExportCSV.style.display = 'none';
      csvData = null;
    });

    // Exportar CSV
    elements.btnExportCSV.addEventListener('click', function() {
      if (!csvData) return;

      const csv = convertToCSV(csvData);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tfidf_results_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    });

    function convertToCSV(data) {
      if (!data.length) return '';
      
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => row[header]).join(','))
      ].join('\n');
      
      return csvContent;
    }

    // Transcripción de audio
    elements.btnTranscribir.addEventListener('click', async function() {
       const file = elements.audioFile.files[0];
        if (!file) {
          alert('Por favor selecciona un archivo de audio.');
          return;
        }

        // Validar tamaño máximo nuevamente (por si el usuario modificó el DOM)
        const maxSize = 45 * 1024 * 1024;
        if (file.size > maxSize) {
          document.getElementById('audioFileError').textContent = 'El archivo excede el tamaño máximo permitido de 45 MB';
          return;
        }

      elements.btnTranscribir.disabled = true;
      show(elements.loaderAUD);
      hide(elements.statusAUD);
      hide(elements.errorAUD);
      showBlock(elements.progressContainer);
      elements.progressBar.style.width = '0%';
      elements.progressText.textContent = 'Iniciando transcripción...';
      elements.transcriptionStatus.textContent = 'Subiendo archivo...';

      const formData = new FormData();
      formData.append('audio', file);

      try {
        const response = await fetch('/transcribir', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        currentJobId = data.job_id;
        startPolling(file.name);

      } catch (error) {
        elements.btnTranscribir.disabled = false;
        hide(elements.loaderAUD);
        show(elements.errorAUD);
        hide(elements.progressContainer);
        elements.resultadoTranscripcion.innerHTML = `
          <div class="status-indicator error" style="display: flex;">
            ❌ ${error.message}
          </div>
        `;
        elements.resultadoTranscripcion.classList.remove('empty');
      }
    });

    // Polling para verificar estado de transcripción
    function startPolling(filename) {
      const startTime = Date.now();
      const maxDuration = 15 * 60 * 1000; // 15 minutos

      pollInterval = setInterval(async () => {
        if (Date.now() - startTime > maxDuration) {
          clearInterval(pollInterval);
          elements.transcriptionStatus.textContent = 'Tiempo de espera agotado';
          elements.btnTranscribir.disabled = false;
          hide(elements.loaderAUD);
          show(elements.errorAUD);
          hide(elements.progressContainer);
          return;
        }

        try {
          const response = await fetch(`/estado/${currentJobId}`);
          const data = await response.json();

          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          elements.progressText.textContent = `Tiempo transcurrido: ${elapsed}s`;

          if (data.status === 'processing') {
            const progress = Math.min(95, data.progress || 0);
            elements.progressBar.style.width = `${progress}%`;
            elements.transcriptionStatus.textContent = `Procesando ${filename}...`;
          } 
          else if (data.status === 'completed') {
            clearInterval(pollInterval);
            elements.progressBar.style.width = '100%';
            elements.transcriptionStatus.textContent = `Completado: ${data.saved_as}`;
            elements.resultadoTranscripcion.textContent = data.transcripcion;
            elements.resultadoTranscripcion.classList.remove('empty');
            
            hide(elements.loaderAUD);
            show(elements.statusAUD);
            elements.btnTranscribir.disabled = false;
            
            setTimeout(() => {
              hide(elements.progressContainer);
              hide(elements.statusAUD);
            }, 5000);
          } 
          else if (data.status === 'failed') {
            clearInterval(pollInterval);
            elements.transcriptionStatus.textContent = 'Error en transcripción';
            elements.resultadoTranscripcion.innerHTML = `
              <div class="status-indicator error" style="display: flex;">
                ❌ ${data.error || 'Error desconocido'}
              </div>
            `;
            elements.resultadoTranscripcion.classList.remove('empty');
            elements.btnTranscribir.disabled = false;
            hide(elements.loaderAUD);
            show(elements.errorAUD);
            hide(elements.progressContainer);
          }
        } catch (error) {
          console.error('Error en polling:', error);
        }
      }, 2000);
    }

    // Limpiar transcripción
    elements.btnClearTrans.addEventListener('click', function() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      elements.resultadoTranscripcion.innerHTML = 'Aquí aparecerá la transcripción cuando proceses un archivo de audio...';
      elements.resultadoTranscripcion.classList.add('empty');
      elements.progressText.textContent = '';
      hide(elements.progressContainer);
      hide(elements.statusAUD);
      hide(elements.errorAUD);
      currentJobId = null;
    });

    // Listar archivos
    elements.btnListarArchivos.addEventListener('click', async function() {
      showBlock(elements.sectionArchivos);
      await loadFileList();
    });

    async function loadFileList() {
      try {
        elements.fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">Cargando...</div>';
        
        const response = await fetch('/listar_archivos');
        const data = await response.json();

        if (data.error) {
          elements.fileList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ ${data.error}</div>`;
          return;
        }

        if (!data.archivos.length) {
          elements.fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #7f8c8d;">No hay archivos de transcripción</div>';
          return;
        }

        const html = data.archivos.map(archivo => `
          <div class="file-item">
            <div>
              <div class="file-name">📄 ${archivo.nombre}</div>
              <div class="file-meta">
                ${formatFileSize(archivo.tamaño)} • ${formatDate(archivo.modificado)}
              </div>
            </div>
            <button class="btn btn-secondary btn-small" onclick="downloadFile('${archivo.nombre}')">
              💾 Descargar
            </button>
          </div>
        `).join('');

        elements.fileList.innerHTML = html;
      } catch (error) {
        console.error('Error cargando archivos:', error);
        elements.fileList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #e74c3c;">❌ Error cargando archivos</div>';
      }
    }

    // Descargar archivo
    function downloadFile(filename) {
      window.open(`/descargar/${filename}`, '_blank');
    }

    // Inicialización
    document.addEventListener('DOMContentLoaded', function() {
      checkSystemHealth();
      
      // Verificar estado cada 30 segundos
      setInterval(checkSystemHealth, 30000);
    });

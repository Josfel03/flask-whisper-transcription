#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Análisis Automatizado CREA - Chilpancingo
Backend Flask optimizado para procesamiento de CSV y transcripción de audios
"""

import threading
import uuid
import time
import os
import subprocess
import re
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file
import pandas as pd
import nltk
import spacy
import string
from sklearn.feature_extraction.text import TfidfVectorizer
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
import json
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Descargar recursos NLTK si no están
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)

# Cargar modelo de spaCy
try:
    nlp = spacy.load("es_core_news_sm")
    logger.info("✅ Modelo spaCy cargado correctamente")
except OSError:
    logger.error("❌ Error: Instala el modelo spaCy con: python -m spacy download es_core_news_sm")
    nlp = None

app = Flask(__name__, static_folder=".", static_url_path="")
app.config['MAX_CONTENT_LENGTH'] = 45 * 1024 * 1024  # 45MB

# Configuración de directorios
BASE_DIR = '/home/josfel/Documents/Python/analisisAutomatizado'
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
TRANSCRIPTS_FOLDER = os.path.join(BASE_DIR, 'Transcripts_txt')
RESULTS_FOLDER = os.path.join(BASE_DIR, 'results')
TEXTOS_FOLDER = os.path.join(BASE_DIR, 'textos')
JOBS_FOLDER = '/tmp/jobs'

# Rutas de Whisper
WHISPER_BINARY = '/home/josfel/whisper.cpp/build/bin/whisper-cli'
WHISPER_MODEL = '/home/josfel/whisper.cpp/models/ggml-small.bin'

# Crear directorios necesarios
for folder in [UPLOAD_FOLDER, TRANSCRIPTS_FOLDER, RESULTS_FOLDER, TEXTOS_FOLDER, JOBS_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# Almacenamiento para los trabajos
jobs = {}

def clean_old_jobs():
    """Limpia trabajos antiguos (más de 1 hora)"""
    current_time = time.time()
    expired_jobs = []
    
    for job_id, job_data in jobs.items():
        if current_time - job_data.get('start_time', 0) > 3600:  # 1 hora
            expired_jobs.append(job_id)
            # Limpiar directorio del job
            job_dir = os.path.join(JOBS_FOLDER, job_id)
            if os.path.exists(job_dir):
                shutil.rmtree(job_dir, ignore_errors=True)
    
    for job_id in expired_jobs:
        del jobs[job_id]
    
    logger.info(f"Limpiados {len(expired_jobs)} trabajos expirados")

def get_next_opinion_number():
    """Obtiene el siguiente número para Opinion###.txt"""
    if not os.path.exists(TEXTOS_FOLDER):
        return 1
    
    existentes = [f for f in os.listdir(TEXTOS_FOLDER) if re.match(r"Opinion\d{3}\.txt$", f)]
    if not existentes:
        return 1
    
    numeros = [int(re.search(r"\d{3}", f).group()) for f in existentes]
    return max(numeros) + 1

def convert_audio_to_wav(input_path, output_path):
    """Convierte audio a WAV 16kHz mono usando ffmpeg"""
    try:
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1",
            "-acodec", "pcm_s16le",
            output_path
        ]
        
        result = subprocess.run(
            cmd, 
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True
        )
        return True, None
    except subprocess.CalledProcessError as e:
        return False, f"Error en conversión: {e.stderr}"
    except Exception as e:
        return False, f"Error inesperado: {str(e)}"

def check_wav_format(wav_path):
    """Verifica si el WAV ya está en el formato correcto (16kHz mono)"""
    try:
        info = subprocess.check_output([
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=sample_rate,channels",
            "-of", "default=noprint_wrappers=1:nokey=1", wav_path
        ]).decode().strip().splitlines()

        if len(info) >= 2:
            sample_rate = int(info[0])
            channels = int(info[1])
            return sample_rate == 16000 and channels == 1
        return False
    except:
        return False

def process_audio_background(job_id, file_path, original_filename):
    """Procesa el audio en segundo plano"""
    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 10
        
        job_dir = os.path.join(JOBS_FOLDER, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        # Mover archivo al directorio del job
        original_path = os.path.join(job_dir, original_filename)
        shutil.move(file_path, original_path)
        
        jobs[job_id]["progress"] = 20
        
        # Determinar si necesita conversión
        if original_path.lower().endswith(".wav") and check_wav_format(original_path):
            wav_path = original_path
            logger.info(f"Archivo WAV ya en formato correcto: {original_filename}")
        else:
            # Convertir a WAV 16kHz mono
            wav_path = os.path.join(job_dir, "audio_converted.wav")
            logger.info(f"Convirtiendo {original_filename} a WAV...")
            
            success, error = convert_audio_to_wav(original_path, wav_path)
            if not success:
                raise Exception(f"Error en conversión: {error}")
        
        jobs[job_id]["progress"] = 50
        
        # Verificar que existe el binario de Whisper
        if not os.path.exists(WHISPER_BINARY):
            raise Exception(f"No se encontró whisper-cli en: {WHISPER_BINARY}")
        
        if not os.path.exists(WHISPER_MODEL):
            raise Exception(f"No se encontró el modelo en: {WHISPER_MODEL}")
        
        # Ejecutar whisper.cpp
        output_path = os.path.join(job_dir, "transcripcion")
        cmd = [
            WHISPER_BINARY,
            "-m", WHISPER_MODEL,
            "-f", wav_path,
            "-l", "es",
            "-otxt",
            "-of", output_path
        ]
        
        logger.info(f"Ejecutando Whisper: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd, 
            check=True,
            capture_output=True,
            text=True
        )
        
        jobs[job_id]["progress"] = 80
        
        # Leer el resultado
        texto_path = output_path + ".txt"
        if not os.path.exists(texto_path):
            raise Exception(f"No se generó el archivo de transcripción: {texto_path}")
        
        with open(texto_path, "r", encoding="utf-8") as f:
            texto = f.read().strip()
        
        if not texto:
            raise Exception("La transcripción está vacía")
        
        # Guardar con nombre Opinion###.txt
        siguiente_num = get_next_opinion_number()
        nombre_archivo = f"Opinion{siguiente_num:03d}.txt"
        destino_path = os.path.join(TEXTOS_FOLDER, nombre_archivo)
        
        with open(destino_path, "w", encoding="utf-8") as f:
            f.write(texto)
        
        # También guardar en Transcripts_txt para compatibilidad
        transcript_path = os.path.join(TRANSCRIPTS_FOLDER, nombre_archivo)
        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(texto)
        
        jobs[job_id]["progress"] = 100
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = texto
        jobs[job_id]["filename"] = nombre_archivo
        jobs[job_id]["file_path"] = destino_path
        
        logger.info(f"Transcripción completada: {nombre_archivo}")
        
    except Exception as e:
        logger.error(f"Error en procesamiento de audio: {str(e)}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["progress"] = 0

def limpiar_texto(texto):
    """Limpia el texto para análisis TF-IDF"""
    if pd.isna(texto) or not isinstance(texto, str):
        return ""
    
    texto = texto.lower()
    texto = ''.join(ch for ch in texto if ch not in string.punctuation)
    texto = ''.join(ch for ch in texto if not ch.isdigit())
    texto = ' '.join(texto.split())  # Normalizar espacios
    return texto

def lematizar(tokens):
    """Lematiza tokens usando spaCy"""
    if not nlp:
        return tokens
    
    try:
        doc = nlp(" ".join(tokens))
        return [token.lemma_ for token in doc if not token.is_space]
    except:
        return tokens

# ================================
# RUTAS DE LA API
# ================================

@app.route("/")
def index():
    """Página principal"""
    return send_from_directory(".", "index.html")

@app.route("/health")
def health_check():
    """Verificación de estado del sistema"""
    return jsonify({
        "status": "ok",
        "spacy_loaded": nlp is not None,
        "whisper_binary": os.path.exists(WHISPER_BINARY),
        "whisper_model": os.path.exists(WHISPER_MODEL),
        "active_jobs": len(jobs),
        "timestamp": datetime.now().isoformat()
    })

@app.route("/procesar", methods=["POST"])
def procesar_csv():
    """Procesa archivo CSV para análisis TF-IDF"""
    try:
        archivo = request.files.get("file")
        if not archivo:
            return jsonify({"error": "No se subió ningún archivo"}), 400

        # Leer CSV
        try:
            df = pd.read_csv(archivo, encoding='utf-8')
        except UnicodeDecodeError:
            try:
                df = pd.read_csv(archivo, encoding='latin-1')
            except:
                return jsonify({"error": "No se pudo leer el archivo CSV. Verifica la codificación."}), 400

        # Validar estructura
        if df.shape[1] < 2:
            return jsonify({"error": "El CSV debe tener al menos dos columnas"}), 400

        if df.empty:
            return jsonify({"error": "El archivo CSV está vacío"}), 400

        # Renombrar segunda columna a 'RESPUESTA'
        segunda_columna = df.columns[1]
        if segunda_columna != "RESPUESTA":
            df.rename(columns={segunda_columna: "RESPUESTA"}, inplace=True)

        # Verificar que tenemos datos para procesar
        if "RESPUESTA" not in df.columns:
            return jsonify({"error": "No se encontró una columna válida de 'RESPUESTA'"}), 400

        # Eliminar filas vacías en la columna RESPUESTA
        df = df.dropna(subset=['RESPUESTA'])
        df = df[df['RESPUESTA'].str.strip() != '']

        if df.empty:
            return jsonify({"error": "No hay respuestas válidas para procesar"}), 400

        # Procesamiento de texto
        df['texto_original'] = df['RESPUESTA'].astype(str)
        df['texto_limpio'] = df['texto_original'].apply(limpiar_texto)

        # Filtrar textos muy cortos
        df = df[df['texto_limpio'].str.len() > 2]
        
        if df.empty:
            return jsonify({"error": "No hay textos válidos después de la limpieza"}), 400

        # Tokenización
        df['tokens'] = df['texto_limpio'].apply(word_tokenize)

        # Lematización
        df['lemmas'] = df['tokens'].apply(lematizar)

        # Remover stopwords
        try:
            stop_words = set(stopwords.words('spanish'))
        except:
            stop_words = set()

        df['lemmas_sin_stopwords'] = df['lemmas'].apply(
            lambda x: [word for word in x if word not in stop_words and len(word) > 2]
        )

        # Preparar textos para TF-IDF
        textos_procesados = df['lemmas_sin_stopwords'].apply(lambda x: ' '.join(x))
        
        # Filtrar textos vacíos después del procesamiento
        textos_procesados = textos_procesados[textos_procesados.str.len() > 0]
        
        if textos_procesados.empty:
            return jsonify({"error": "No hay textos válidos después del procesamiento"}), 400

        # Vectorización TF-IDF
        vectorizador = TfidfVectorizer(
            max_features=1000,  # Limitar características
            min_df=1,
            max_df=0.95,
            ngram_range=(1, 2)  # Incluir bigramas
        )

        try:
            X_tfidf = vectorizador.fit_transform(textos_procesados)
        except ValueError as e:
            return jsonify({"error": f"Error en vectorización TF-IDF: {str(e)}"}), 400

        # Crear DataFrame con resultados
        feature_names = vectorizador.get_feature_names_out()
        tfidf_df = pd.DataFrame(X_tfidf.toarray(), columns=feature_names)

        # Guardar resultados
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        resultado_path = os.path.join(RESULTS_FOLDER, f"tfidf_results_{timestamp}.csv")
        tfidf_df.to_csv(resultado_path, index=False)

        logger.info(f"Procesamiento CSV completado: {tfidf_df.shape}")

        return jsonify({
            "data": tfidf_df.to_dict(orient='records'),
            "metadata": {
                "filas": tfidf_df.shape[0],
                "columnas": tfidf_df.shape[1],
                "archivo_guardado": resultado_path,
                "textos_procesados": len(textos_procesados)
            }
        })

    except Exception as e:
        logger.error(f"Error en procesamiento CSV: {str(e)}")
        return jsonify({"error": f"Error interno: {str(e)}"}), 500

@app.route("/transcribir", methods=["POST"])
def transcribir_audio():
    """Inicia transcripción de audio (asíncrono)"""
    try:
        archivo = request.files.get("audio")
        if not archivo:
            return jsonify({"error": "No se subió ningún archivo"}), 400

        # Validar tamaño máximo (45 MB)
        max_size = 45 * 1024 * 1024  # 45 MB
        archivo.seek(0, os.SEEK_END)
        file_size = archivo.tell()
        archivo.seek(0)  # Volver al inicio

        if file_size > max_size:
            return jsonify({"error": "El archivo excede el tamaño máximo de 45 MB"}), 400
        # Verificar extensión
        filename = archivo.filename.lower()
        allowed_extensions = {'.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'}
        if not any(filename.endswith(ext) for ext in allowed_extensions):
            return jsonify({"error": "Formato de audio no soportado"}), 400

        # Limpiar trabajos antiguos
        clean_old_jobs()

        # Generar ID único
        job_id = str(uuid.uuid4())

        # Guardar archivo temporalmente
        temp_path = f"/tmp/{job_id}_{archivo.filename}"
        archivo.save(temp_path)

        # Verificar que el archivo se guardó correctamente
        if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            return jsonify({"error": "Error al guardar el archivo"}), 400

        # Inicializar trabajo
        jobs[job_id] = {
            "status": "processing",
            "filename": archivo.filename,
            "start_time": time.time(),
            "progress": 0,
            "result": None,
            "error": None
        }

        # Iniciar procesamiento en hilo separado
        thread = threading.Thread(
            target=process_audio_background,
            args=(job_id, temp_path, archivo.filename)
        )
        thread.daemon = True
        thread.start()

        logger.info(f"Iniciada transcripción: {archivo.filename} (Job: {job_id})")

        return jsonify({"job_id": job_id})

    except Exception as e:
        logger.error(f"Error al iniciar transcripción: {str(e)}")
        return jsonify({"error": f"Error interno: {str(e)}"}), 500

@app.route("/estado/<job_id>", methods=["GET"])
def verificar_estado(job_id):
    """Verifica el estado de un trabajo de transcripción"""
    job = jobs.get(job_id)

    if not job:
        return jsonify({"error": "Trabajo no encontrado"}), 404

    response = {
        "status": job["status"],
        "filename": job["filename"],
        "progress": job.get("progress", 0),
        "elapsed_time": int(time.time() - job["start_time"])
    }

    if job["status"] == "completed":
        response.update({
            "transcripcion": job["result"],
            "saved_as": job.get("filename", ""),
            "file_path": job.get("file_path", "")
        })
    elif job["status"] == "failed":
        response["error"] = job.get("error", "Error desconocido")

    return jsonify(response)

@app.route("/descargar/<filename>")
def descargar_archivo(filename):
    """Descarga archivos de transcripción"""
    try:
        file_path = os.path.join(TEXTOS_FOLDER, filename)
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({"error": "Archivo no encontrado"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/listar_archivos")
def listar_archivos():
    """Lista archivos de transcripción disponibles"""
    try:
        archivos = []
        if os.path.exists(TEXTOS_FOLDER):
            for filename in sorted(os.listdir(TEXTOS_FOLDER)):
                if filename.endswith('.txt'):
                    file_path = os.path.join(TEXTOS_FOLDER, filename)
                    stat = os.stat(file_path)
                    archivos.append({
                        "nombre": filename,
                        "tamaño": stat.st_size,
                        "modificado": datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        
        return jsonify({"archivos": archivos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    logger.info("Iniciando servidor Flask...")
    logger.info(f"Directorio base: {BASE_DIR}")
    logger.info(f"Whisper binary: {WHISPER_BINARY}")
    logger.info(f"Whisper model: {WHISPER_MODEL}")
    
    # Verificar dependencias críticas
    if not os.path.exists(WHISPER_BINARY):
        logger.warning(f"⚠️ No se encontró whisper-cli en: {WHISPER_BINARY}")
    if not os.path.exists(WHISPER_MODEL):
        logger.warning(f"⚠️ No se encontró el modelo en: {WHISPER_MODEL}")
    
    app.run(debug=True, host="0.0.0.0", port=5000, threaded=True)
import threading
import uuid
import time
import os
import subprocess
import re
from flask import Flask, request, jsonify, send_from_directory
import pandas as pd
import nltk
import spacy
import string
from sklearn.feature_extraction.text import TfidfVectorizer
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

# Descarga recursos si no están
nltk.download('punkt')
nltk.download('stopwords')

# Cargar modelo de spaCy
nlp = spacy.load("es_core_news_sm")

app = Flask(__name__, static_folder=".", static_url_path="")

# Almacenamiento para los trabajos
jobs = {}

# Función para procesar el audio en segundo plano
def process_audio_background(job_id, file_path, original_filename):
    try:
        job_dir = f"/tmp/jobs/{job_id}"
        os.makedirs(job_dir, exist_ok=True)
        
        # Guardar el archivo original en el directorio del job
        original_path = os.path.join(job_dir, original_filename)
        os.rename(file_path, original_path)
        
        # Verificar si es un archivo .wav con 16kHz y mono
        if original_path.endswith(".wav"):
            # Obtener información del archivo WAV
            info = subprocess.check_output(
                ["ffprobe", "-v", "error", "-select_streams", "a:0", 
                 "-show_entries", "stream=sample_rate,channels", 
                 "-of", "default=noprint_wrappers=1:nokey=1", original_path]
            ).decode().splitlines()

            sample_rate = int(info[0])
            channels = int(info[1])

            if sample_rate == 16000 and channels == 1:
                wav_path = original_path  # Ya está listo
            else:
                # Convertir a 16kHz mono
                wav_path = os.path.join(job_dir, "audio_converted.wav")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", original_path, "-ar", "16000", "-ac", "1", wav_path],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
        else:
            # Convertir cualquier otro formato a WAV 16kHz mono
            wav_path = os.path.join(job_dir, "audio_converted.wav")
            subprocess.run(
                ["ffmpeg", "-y", "-i", original_path, "-ar", "16000", "-ac", "1", wav_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

        # Ejecutar whisper.cpp
        output_path = os.path.join(job_dir, "transcripcion")
        cmd = [
            "/home/josfel/whisper.cpp/build/bin/whisper-cli",
            "-m", "/home/josfel/whisper.cpp/models/ggml-small.bin",
            "-f", wav_path,
            "-l", "es",
            "-otxt",
            "-of", output_path
        ]
        subprocess.run(cmd, check=True)

        # Leer el resultado
        texto_path = output_path + ".txt"
        with open(texto_path, "r", encoding="utf-8") as f:
            texto = f.read()

        # Guardar con nombre tipo Opinion001.txt, Opinion002.txt, ...
        destino_dir = "/home/josfel/Documents/Python/analisisAutomatizado/textos"
        os.makedirs(destino_dir, exist_ok=True)
        existentes = [f for f in os.listdir(destino_dir) if re.match(r"Opinion\d{3}\.txt$", f)]
        numeros = [int(re.search(r"\d{3}", f).group()) for f in existentes] if existentes else []
        siguiente_num = max(numeros) + 1 if numeros else 1
        nombre_archivo = f"Opinion{siguiente_num:03d}.txt"
        destino_path = os.path.join(destino_dir, nombre_archivo)

        with open(destino_path, "w", encoding="utf-8") as f_destino:
            f_destino.write(texto)

        # Actualizar estado del trabajo
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = texto
        jobs[job_id]["filename"] = nombre_archivo

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

# Ruta para mostrar index.html
@app.route("/")
def index():
    return send_from_directory(".", "index.html")

# Ruta POST para procesar el archivo CSV (MANTENIDO SIN CAMBIOS)
@app.route("/procesar", methods=["POST"])
def procesar_csv():
    archivo = request.files.get("file")
    if not archivo:
        return jsonify({"error": "No se subió ningún archivo"}), 400

    try:
        df = pd.read_csv(archivo)

        # Validar que al menos haya dos columnas
        if df.shape[1] < 2:
            return jsonify({"error": "El CSV debe tener al menos dos columnas"}), 400

        # Renombrar la segunda columna a 'RESPUESTA' si no tiene ese nombre
        segunda_columna = df.columns[1]
        if segunda_columna != "RESPUESTA":
            df.rename(columns={segunda_columna: "RESPUESTA"}, inplace=True)

        # Asegurarse de que exista la columna renombrada
        if "RESPUESTA" not in df.columns:
            return jsonify({"error": "No se encontró una columna válida de 'RESPUESTA'"}), 400

        # Continuar con el procesamiento
        df['texto_original'] = df['RESPUESTA']


        #limpiar_texto
        def limpiar_texto(texto):
            texto = texto.lower()  # a minúsculas
            texto = ''.join(ch for ch in texto if ch not in string.punctuation)  # quitar puntuación
            texto = ''.join(ch for ch in texto if not ch.isdigit())  # quitar números
            return texto

        df['texto_limpio'] = df['texto_original'].apply(limpiar_texto)

        # Tokenización
        df['tokens'] = df['texto_limpio'].apply(word_tokenize)
        # Lematización
        def lematizar(tokens):
            doc = nlp(" ".join(tokens))
            return [token.lemma_ for token in doc]
        df['lemmas'] = df['tokens'].apply(lematizar)
        # Quitar stopwords
        stop_words = set(stopwords.words('spanish'))
        df['lemmas_sin_stopwords'] = df['lemmas'].apply(lambda x: [word for word in x if word not in stop_words])
        #Vectorización TF-IDF
        textos_procesados = df['lemmas_sin_stopwords'].apply(lambda x: ' '.join(x))
        vectorizador = TfidfVectorizer()
        X_tfidf = vectorizador.fit_transform(textos_procesados)

        # Crear DataFrame con los resultados    
        tfidf_df = pd.DataFrame(X_tfidf.toarray(), columns=vectorizador.get_feature_names_out())

        return jsonify(tfidf_df.to_dict(orient='records'))
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Ruta para iniciar la transcripción (MODIFICADA para versión asíncrona)
@app.route("/transcribir", methods=["POST"])
def transcribir_audio():
    archivo = request.files.get("audio")
    if not archivo:
        return jsonify({"error": "No se subió ningún archivo"}), 400

    # Generar un ID único para este trabajo
    job_id = str(uuid.uuid4())
    
    # Guardar el archivo temporalmente
    temp_path = f"/tmp/{job_id}_{archivo.filename}"
    archivo.save(temp_path)
    
    # Inicializar el estado del trabajo
    jobs[job_id] = {
        "status": "processing",
        "filename": archivo.filename,
        "start_time": time.time(),
        "result": None,
        "error": None
    }
    
    # Iniciar el procesamiento en un hilo separado
    thread = threading.Thread(
        target=process_audio_background, 
        args=(job_id, temp_path, archivo.filename)
    )
    thread.start()
    
    # Responder inmediatamente con el job_id
    return jsonify({"job_id": job_id})

# Ruta para verificar el estado de un trabajo (NUEVA)
@app.route("/estado/<job_id>", methods=["GET"])
def verificar_estado(job_id):
    job = jobs.get(job_id)
    
    if not job:
        return jsonify({"error": "Trabajo no encontrado"}), 404
    
    response = {
        "status": job["status"],
        "filename": job["filename"]
    }
    
    if job["status"] == "completed":
        response["transcripcion"] = job["result"]
        response["saved_as"] = job.get("filename", "")
    elif job["status"] == "failed":
        response["error"] = job.get("error", "Error desconocido")
    
    return jsonify(response)

if __name__ == "__main__":
    # Crear directorio temporal para trabajos si no existe
    os.makedirs("/tmp/jobs", exist_ok=True)
    app.run(debug=True, host="0.0.0.0", port=5000)
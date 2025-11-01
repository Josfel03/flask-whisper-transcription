# 🤖 AI Audio Analysis Dashboard

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=yellow)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.x-black?logo=flask)](https://flask.palletsprojects.com/)
[![Whisper.cpp](https://img.shields.io/badge/Whisper.cpp-Ready-grey?logo=openai)](https://github.com/ggerganov/whisper.cpp)

An end-to-end web application that transcribes audio files and performs sentiment analysis using Whisper.cpp, Python, and Flask.

This tool allows users to upload audio files, receive a high-accuracy transcription, and instantly get an analysis of the text's sentiment (positive, negative, neutral), all within a simple web interface.

## 📸 Project Demo
![Project Screenshot](./img/demo1.png)


## 🚀 Key Features

* **Audio File Upload:** Securely upload audio files (e.g., `.wav`, `.mp3`) directly through the browser.
* **High-Accuracy Transcription:** Leverages the power of **Whisper.cpp** for fast, server-side speech-to-text processing.
* **On-Screen Display:** View the full transcription immediately in the web interface.
* **Sentiment Analysis:** Automatically analyzes the transcribed text to quantify positive, negative, and neutral opinions.
* **CSV Data Export:** Download the transcription and sentiment analysis data as a `.csv` file with a single click.

---

## 🛠️ Tech Stack

* **Backend:** [Flask](https://flask.palletsprojects.com/) (Python)
* **AI / Transcription:** [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) (Optimized for C/C++)
* **NLP:** Custom Sentiment Analysis logic (or libraries like `spaCy`/`VADER`)
* **Frontend:** HTML, CSS, JavaScript
* **Environment:** Deployed and tested on Linux (Ubuntu/Arch)

---

## ⚙️ Installation & Usage

Follow these steps to get the project running on your local machine.

### Prerequisites

* [Python 3.9+](https://www.python.org/downloads/)
* [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) installed and compiled on your system.
    * *(You should add a note here on how you compiled it or link to its instructions)*
* A pre-trained Whisper model (e.g., `ggml-base.en.bin`)

### 1. Clone the Repository

```bash
git clone [https://github.com/Josfel03/flask-whisper-transcription](https://github.com/Josfel03/flask-whisper-transcription.git)
cd flask-whisper-transcription
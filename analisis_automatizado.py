import pandas as pd
import nltk
import spacy
import string
from sklearn.feature_extraction.text import TfidfVectorizer
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

# Cargar spaCy y NLTK
nlp = spacy.load("es_core_news_sm")
nltk.download("punkt")
nltk.download("stopwords")

# Leer archivo CSV
df = pd.read_csv("/home/josfel/Documents/Python/Audios_Entrevistas/respuestas.csv")

# Unir las respuestas en un solo texto por persona
df['texto_original'] = df[['P1','P2','P3','P4','P5','P6','P7','P8']].astype(str).agg(' '.join, axis=1)
print(df)

# Función para limpiar texto
def limpiar_texto(texto):
    texto = texto.lower()
    texto = ''.join(ch for ch in texto if ch not in string.punctuation)
    texto = ''.join(ch for ch in texto if not ch.isdigit())
    return texto

# Aplicar limpieza
df['texto_limpio'] = df['texto_original'].apply(limpiar_texto)

# Tokenizar y lematizar
df['tokens'] = df['texto_limpio'].apply(word_tokenize)

def lematizar(tokens):
    doc = nlp(" ".join(tokens))
    return [token.lemma_ for token in doc]

df['lemmas'] = df['tokens'].apply(lematizar)

# Eliminar stopwords
stop_words = set(stopwords.words('spanish'))
df['lemmas_sin_stopwords'] = df['lemmas'].apply(lambda x: [w for w in x if w not in stop_words])

# Unir el resultado para vectorizar
textos_procesados = df['lemmas_sin_stopwords'].apply(lambda x: ' '.join(x))

# Vectorizar con TF-IDF
vectorizador = TfidfVectorizer()
X_tfidf = vectorizador.fit_transform(textos_procesados)
tfidf_df = pd.DataFrame(X_tfidf.toarray(), columns=vectorizador.get_feature_names_out())

# Mostrar resultado
print("🔹 Matriz TF-IDF:")
print(tfidf_df)


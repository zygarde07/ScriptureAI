import os

import streamlit as st
import chromadb
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from google import genai

# Load GEMINI_API_KEY from a local .env file (if present) or the environment
load_dotenv()

# =========================
# CONFIG
# =========================
DB_PATH = "db"
COLLECTION_NAME = "scripture"
API_KEY = os.getenv("GEMINI_API_KEY")
PLACEHOLDER_KEY = "your_gemini_api_key_here"

if not API_KEY or API_KEY.strip() in ("", PLACEHOLDER_KEY):
    st.set_page_config(page_title="Scripture AI", layout="wide")
    st.error(
        "GEMINI_API_KEY is not set. Put your real Gemini API key in your "
        "local `.env` file (copy `.env.example` to `.env` and replace the "
        "placeholder), then restart the app."
    )
    st.stop()

# =========================
# LOAD RESOURCES
# =========================
@st.cache_resource
def load_embedding_model():
    return SentenceTransformer("all-MiniLM-L6-v2")


@st.cache_resource
def load_chroma():
    client = chromadb.PersistentClient(path=DB_PATH)
    return client.get_or_create_collection(COLLECTION_NAME)


@st.cache_resource
def load_llm():
    return genai.Client(api_key=API_KEY)


embedding_model = load_embedding_model()
collection = load_chroma()
client = load_llm()

# =========================
# UI
# =========================
st.set_page_config(page_title="Scripture AI", layout="wide")

st.title("🧠 Scripture AI")
st.caption("Retrieval-Augmented Generation System for Classical Scripture Research")

if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

user_input = st.chat_input("Ask a question about the scriptures...")

if user_input:

    st.session_state.chat_history.append(("user", user_input))

    with st.spinner("Searching scriptures..."):

        # Step 1 — Embed query
        query_embedding = embedding_model.encode(user_input).tolist()

        # Step 2 — Retrieve context
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=5
        )

        documents = results["documents"]

        if documents and documents[0]:

            context = "\n\n".join(documents[0])

            prompt = f"""
You are an academic scripture research assistant.

Answer ONLY using the provided context.
If the answer is not present, clearly say so.

Context:
{context}

Question:
{user_input}
"""

            # Step 3 — Generate answer
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )

            answer = response.text

        else:
            answer = "No relevant information found in the database."

        st.session_state.chat_history.append(("assistant", answer))

# =========================
# DISPLAY CHAT
# =========================
for role, message in st.session_state.chat_history:
    with st.chat_message(role):
        st.write(message)
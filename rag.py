"""The retrieval-and-answer logic, shared by the Streamlit app (app.py)
and the web API (api.py), so both behave exactly the same way.

How a question is answered:
  1. The question is turned into a vector with the same model that
     ingest.py used for the documents.
  2. ChromaDB returns the closest passages from the ingested PDFs.
  3. Those passages and the question go to Gemini, which is told to
     answer only from them.
"""

import os
from functools import lru_cache

import chromadb
from dotenv import load_dotenv
from google import genai
from sentence_transformers import SentenceTransformer

# Reads GEMINI_API_KEY from the .env file next to this script (if there is one)
load_dotenv()

# =========================
# CONFIG (same values as before)
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "db")
COLLECTION_NAME = "scripture"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
LLM_MODEL = "gemini-2.5-flash"
TOP_K = 5  # how many passages are retrieved for each question
PLACEHOLDER_KEY = "your_gemini_api_key_here"


class ConfigurationError(Exception):
    """Raised when the Gemini API key is missing."""


def api_key_configured():
    """True if a real (non-placeholder) key is available."""
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    return key not in ("", PLACEHOLDER_KEY)


# =========================
# LOAD RESOURCES (once; lru_cache remembers the result)
# =========================
@lru_cache(maxsize=1)
def get_embedding_model():
    return SentenceTransformer(EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def get_collection():
    client = chromadb.PersistentClient(path=DB_PATH)
    return client.get_or_create_collection(COLLECTION_NAME)


@lru_cache(maxsize=1)
def get_llm_client():
    if not api_key_configured():
        raise ConfigurationError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY").strip())


def warm_up():
    """Load the slow parts now, so the first question is not slow."""
    get_embedding_model()
    get_collection()


# =========================
# THE PIPELINE
# =========================
def retrieve(question, n_results=TOP_K):
    """Step 1 + 2: find the closest passages.

    Returns a list of {"source": file name, "text": passage text}.
    """
    query_embedding = get_embedding_model().encode(question).tolist()
    results = get_collection().query(
        query_embeddings=[query_embedding],
        n_results=n_results,
    )

    documents = results["documents"][0] if results["documents"] else []
    metadatas = results["metadatas"][0] if results.get("metadatas") else []

    passages = []
    for index, text in enumerate(documents):
        metadata = metadatas[index] if index < len(metadatas) else None
        source = (metadata or {}).get("source") or "Unknown document"
        passages.append({"source": source, "text": text})
    return passages


def build_prompt(passages, question):
    """The instruction sent to Gemini (unchanged from the original app)."""
    context = "\n\n".join(p["text"] for p in passages)
    return f"""
You are an academic scripture research assistant.

Answer ONLY using the provided context.
If the answer is not present, clearly say so.

Context:
{context}

Question:
{question}
"""


def answer_question(question):
    """Step 3: answer a question.

    Returns {"answer": text, "sources": [{"source": ..., "text": ...}, ...]}
    where `sources` are the passages that were actually given to Gemini.
    """
    passages = retrieve(question)

    if not passages:
        return {
            "answer": "No relevant information found in the database.",
            "sources": [],
        }

    response = get_llm_client().models.generate_content(
        model=LLM_MODEL,
        contents=build_prompt(passages, question),
    )
    return {"answer": response.text or "", "sources": passages}

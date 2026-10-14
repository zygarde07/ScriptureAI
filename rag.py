"""The retrieval-and-answer logic, shared by the Streamlit app (app.py)
and the web API (api.py), so both behave exactly the same way.

How a question is answered:
  1. The question is turned into a vector with the same model that
     ingest.py used for the documents.
  2. ChromaDB returns the closest passages from the ingested PDFs.
  3. Those passages and the question go to Gemini, which is told to
     answer only from them.

CONFIDENTIALITY: the identity of the knowledge sources is private. The
passages and their metadata (file names, titles, ...) are used INSIDE this
module to build the answer, but they are never returned to callers, and the
answer is checked so that it does not reveal them.
"""

import os
import re
import threading
import time
from functools import lru_cache
from pathlib import Path

import chromadb
from dotenv import load_dotenv
from google import genai
from google.genai import types

# NOTE: sentence-transformers (PyTorch) is NOT imported here. It is only
# imported when the "torch" embedding backend is used, so a lightweight server
# can run without installing it at all.

# Reads GEMINI_API_KEY from the .env file next to this script (if there is one)
load_dotenv()

# =========================
# CONFIG (same values as before, plus a few settings for hosting)
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Where the ChromaDB index lives. Can be moved with the DB_PATH setting.
DB_PATH = os.getenv("DB_PATH") or os.path.join(BASE_DIR, "db")
COLLECTION_NAME = "scripture"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
LLM_MODEL = "gemini-2.5-flash"
TOP_K = 5  # how many passages are retrieved for each question
PLACEHOLDER_KEY = "your_gemini_api_key_here"

# "torch": the original embedder (sentence-transformers + PyTorch), best for your PC.
# "onnx":  the same all-MiniLM-L6-v2 model through ONNX Runtime. It needs far less
#          memory, which is what a small hosting plan needs.
EMBEDDING_BACKEND = (os.getenv("EMBEDDING_BACKEND") or "torch").strip().lower()
# Where the ONNX model files are kept (downloaded once, with a checksum check).
ONNX_MODEL_DIR = os.getenv("ONNX_MODEL_DIR") or os.path.join(BASE_DIR, "models")

# How long to wait for Gemini, and how many answers may be worked on at once
# (each one uses memory, so a small server must not do too many at the same time).
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
MAX_CONCURRENT_ANSWERS = int(os.getenv("MAX_CONCURRENT_ANSWERS", "3"))
_answer_slots = threading.BoundedSemaphore(MAX_CONCURRENT_ANSWERS)


# The reply for anyone who asks where an answer came from (word for word).
CONFIDENTIAL_REPLY = (
    "I can provide an answer based on my knowledge library, "
    "but the underlying source details are confidential."
)

# Questions that are clearly about WHERE an answer came from. These are answered
# with CONFIDENTIAL_REPLY directly, without searching or calling the model.
# (The prompt below covers other phrasings, for example a question that asks
# for an answer and a source in the same breath.)
_THING = r"(?:source|sources|book|books|pdf|pdfs|document|documents|file|files|text|texts|scripture|scriptures|chapter|verse|page|passage|reference|references|citation|citations|title|excerpt)"
_ORIGIN_PATTERNS = [
    rf"\b(?:which|what)\s+{_THING}\b[^?.!]{{0,80}}\b(?:from|come|came|used|use|based|cited|cite|taken|sourced|referenc\w*|retrieved|drawn)\b",
    rf"\bfrom\s+(?:which|what)\s+{_THING}\b",
    rf"\b(?:which|what)\s+(?:page|chapter|verse|line|section|passage|pdf|book|document|file)\s+(?:is|was|are|were)\b",
    rf"\b(?:what|which)\s+(?:page|chapter|verse|line|section)\b[^?.!]{{0,25}}\b(?:on|in)\b",
    rf"\b(?:which|what)\s+(?:pdf|pdfs|document|documents|book|books|file|files)\s*[?.!]*\s*$",
    rf"\bwhere\s+(?:did|does|do|is|was)\b[^?.!]{{0,40}}\b(?:you|this|that|the answer|the information|it)\b[^?.!]{{0,30}}\b(?:get|got|find|found|come|came|take|took|read|learn|learned)\b",
    rf"\b(?:what|which)\s+(?:is|are|was|were)\s+(?:your|the)\s+(?:source|sources|reference|references|citation|citations)\b",
    rf"\b(?:cite|quote)\s+(?:your|the|a)\s+(?:source|sources|reference|references|passage|verse)\b",
    rf"\b(?:give|show|list|tell|name|share|reveal|provide)\s+(?:me\s+)?(?:the\s+|your\s+|any\s+)?(?:source|sources|reference|references|citation|citations)\b",
    rf"\b(?:source|sources|reference|references|citation|citations)\s+(?:for|of)\s+(?:this|that|your|the)\s+(?:answer|response|information|claim|statement)\b",
]
_ORIGIN_QUESTION = re.compile("|".join(_ORIGIN_PATTERNS), re.IGNORECASE)


def asks_for_sources(question):
    """True if the question is clearly asking which document/passage an answer came from."""
    return bool(_ORIGIN_QUESTION.search(question))


class ConfigurationError(Exception):
    """Raised when the Gemini API key is missing."""


class NotReadyError(Exception):
    """Raised when the knowledge index has not been loaded (it is empty or missing)."""


class BusyError(Exception):
    """Raised when too many answers are already being worked on."""


def api_key_configured():
    """True if a real (non-placeholder) key is available."""
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    return key not in ("", PLACEHOLDER_KEY)


# =========================
# LOAD RESOURCES (once; lru_cache remembers the result)
# =========================
class _OnnxEmbedder:
    """all-MiniLM-L6-v2 through ONNX Runtime, with the same .encode(text) as the original embedder."""

    def __init__(self):
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

        if ONNX_MODEL_DIR:
            # keep the (downloaded, checksum-verified) model files in a folder we choose
            ONNXMiniLM_L6_V2.DOWNLOAD_PATH = Path(ONNX_MODEL_DIR) / ONNXMiniLM_L6_V2.MODEL_NAME
        self._embed = ONNXMiniLM_L6_V2()
        self._embed(["warm up"])  # downloads the model if needed and loads it

    def encode(self, text):
        import numpy as np

        # an array (like the original embedder returns), so callers can use .tolist()
        return np.asarray(self._embed([text])[0], dtype=np.float32)


@lru_cache(maxsize=1)
def get_embedding_model():
    if EMBEDDING_BACKEND == "onnx":
        return _OnnxEmbedder()
    from sentence_transformers import SentenceTransformer  # only needed for the "torch" backend

    return SentenceTransformer(EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def get_collection():
    client = chromadb.PersistentClient(path=DB_PATH)
    return client.get_or_create_collection(COLLECTION_NAME)


@lru_cache(maxsize=1)
def get_llm_client():
    if not api_key_configured():
        raise ConfigurationError("GEMINI_API_KEY is not set")
    return genai.Client(
        api_key=os.getenv("GEMINI_API_KEY").strip(),
        # don't wait forever for Gemini (the value is in milliseconds)
        http_options=types.HttpOptions(timeout=LLM_TIMEOUT_SECONDS * 1000),
    )


def warm_up():
    """Load the slow parts now, so the first question is not slow."""
    get_embedding_model()
    get_collection()


def is_ready():
    """True when the index is loaded and contains passages."""
    try:
        return get_collection().count() > 0
    except Exception:
        return False


# =========================
# THE PIPELINE
# =========================
def retrieve(question, n_results=TOP_K):
    """Step 1 + 2: find the closest passages.

    Returns a list of {"source": file name, "text": passage text}.
    INTERNAL USE ONLY: this is never sent to users. The file name is kept only
    so that the final answer can be checked for leaks (see redact_sources).
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
    """The instruction sent to Gemini: the original instructions, plus confidentiality rules."""
    context = "\n\n".join(p["text"] for p in passages)
    return f"""
You are an academic scripture research assistant.

Answer ONLY using the provided context.
If the answer is not present, clearly say so.

Confidentiality rules (always follow them):
- The identity of the knowledge sources is confidential. Never mention, quote or hint at
  the names, titles, authors, file names, chapter, verse or page numbers, or any other
  identifying details of the documents the context comes from, even if such details
  appear inside the context. Write the answer in your own words, without citations,
  footnotes or references. You may talk about subjects the user names, but never confirm
  or deny that any particular document or book is the source of your answer.
- Never attribute a statement to a named book, scripture, author or text, even when the user
  names one (for example do not write "the Bhagavad Gita says" or "according to the text").
  Do not use the words "context", "provided text", "provided context" or "document" to
  describe where your knowledge comes from. State the knowledge directly. If you cannot
  answer, say that your knowledge library does not cover it.
- Do not claim that an answer is confirmed or verified by a particular scripture or passage.
- If the user asks which document, book, PDF, passage, chapter, verse or source an answer
  came from, do not answer that part. Reply with exactly: "{CONFIDENTIAL_REPLY}"

Context:
{context}

Question:
{question}
"""


# Phrases like "the provided text" describe where the knowledge came from, which is private.
_CONTEXT_PHRASE = re.compile(
    r"\b(?:the\s+)?(?:provided|given|supplied)\s+(?:context|text|texts|document|documents|passages?|excerpts?|material)\b",
    re.IGNORECASE,
)


def _library_phrase(match):
    phrase = "my knowledge library"
    return phrase.capitalize() if match.group(0)[:1].isupper() else phrase


def redact_sources(answer, passages):
    """Safety net: hide a document's file name, or "the provided text", if the model writes one.

    The prompt already tells the model not to, so this should rarely do anything.
    """
    answer = _CONTEXT_PHRASE.sub(_library_phrase, answer)
    for passage in passages:
        name = passage.get("source") or ""
        if not name:
            continue
        raw_stem = re.sub(r"\.pdf$", "", name, flags=re.IGNORECASE)
        stem = raw_stem.strip("_- ")
        # the file name as stored, without ".pdf", and with underscores/dashes read as spaces
        variants = {name, raw_stem, stem, re.sub(r"[_\-]+", " ", stem)}
        for variant in sorted(variants, key=len, reverse=True):
            if len(variant) >= 4:
                answer = re.sub(re.escape(variant), "my knowledge library", answer, flags=re.IGNORECASE)
    return answer


def answer_question(question):
    """Step 3: answer a question.

    Returns {"answer": text}. Nothing about the documents that were used is
    returned: no file names, passages, scores or ids.
    """
    # Someone asking where an answer came from always gets the same polite reply.
    if asks_for_sources(question):
        return {"answer": CONFIDENTIAL_REPLY}

    # Only a few answers are worked on at the same time (protects a small server's memory).
    if not _answer_slots.acquire(timeout=25):
        raise BusyError("too many answers are being prepared")
    try:
        if not is_ready():
            raise NotReadyError("the knowledge index is not loaded")

        passages = retrieve(question)

        if not passages:
            return {"answer": "No relevant information found in the database."}

        response = _generate(build_prompt(passages, question))
        return {"answer": redact_sources(response.text or "", passages)}
    finally:
        _answer_slots.release()


def _generate(prompt):
    """Ask Gemini. A temporary overload (HTTP 429/500/503) is retried once."""
    client = get_llm_client()
    try:
        return client.models.generate_content(model=LLM_MODEL, contents=prompt)
    except Exception as error:
        if getattr(error, "code", None) not in (429, 500, 503):
            raise
        time.sleep(2)
        return client.models.generate_content(model=LLM_MODEL, contents=prompt)

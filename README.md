# Scripture AI

A Retrieval-Augmented Generation (RAG) chat application that answers questions about a collection of scripture/text PDFs, using only passages retrieved from those documents.

## The problem it solves

Large PDF collections are hard to search by meaning. Keyword search misses relevant passages that use different words, and asking a general-purpose LLM directly can produce answers that are not grounded in your texts. Scripture AI retrieves the passages most similar to your question and asks Gemini to answer **only from that retrieved context**.

## How it works

1. **PDF ingestion** (`ingest.py`): every `.pdf` in `pdfs/` is read page by page with `pypdf` and the text is concatenated.
2. **Chunking**: text is split with LangChain's `RecursiveCharacterTextSplitter` into chunks of 500 characters with a 50-character overlap.
3. **Embeddings**: each chunk is converted into a vector with the Sentence Transformers model `all-MiniLM-L6-v2` (runs locally).
4. **Vector storage**: chunks and vectors are stored in a persistent [ChromaDB](https://www.trychroma.com/) collection named `scripture` in the `db/` folder.
5. **Retrieval** (`rag.py`): the user's question is embedded with the same model, and the 5 nearest chunks are fetched from ChromaDB.
6. **Generation** (`rag.py`): the chunks are placed in a prompt that instructs Gemini (`gemini-2.5-flash`) to answer only from the provided context and to say so if the answer is not there.

The retrieval and generation logic lives in one module, `rag.py`, and is shared by two front ends: a React web interface (through the small FastAPI server in `api.py`) and the original Streamlit app (`app.py`), which is kept as a fallback.

## Architecture

```
            INDEXING (run once: python ingest.py)
  pdfs/*.pdf --> pypdf text extraction --> 500-char chunks (50 overlap)
                                                  |
                                   SentenceTransformer (all-MiniLM-L6-v2)
                                                  |
                                      ChromaDB  (db/, collection "scripture")

            QUERYING (rag.py)
  Question --> embed (same model) --> ChromaDB top-5 similar chunks
                                                  |
                              prompt = instructions + chunks + question
                                                  |
                                     Gemini (gemini-2.5-flash)
                                                  |
                              answer + the retrieved passages (sources)

  React web UI  --/api/ask-->  api.py (FastAPI)  --\
                                                     >-- rag.py
  Streamlit UI (app.py, fallback) ------------------/
```

## Tech stack

- Python 3.11
- [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn: the small API behind the web interface
- React + Vite, [GSAP](https://gsap.com/) (interface motion) and [Three.js](https://threejs.org/) (the animated orb): the web interface in `web/`
- [Streamlit](https://streamlit.io/): the original fallback UI
- [ChromaDB](https://www.trychroma.com/): vector database
- [Sentence Transformers](https://www.sbert.net/): `all-MiniLM-L6-v2` embeddings
- [pypdf](https://pypdf.readthedocs.io/): PDF text extraction
- [LangChain Text Splitters](https://python.langchain.com/): chunking
- [Google Gemini API](https://ai.google.dev/) via the `google-genai` SDK
- python-dotenv: loads the API key from `.env`

## Project structure

```
ScriptureAI/
├── rag.py             # Shared retrieval + Gemini answer logic
├── api.py             # FastAPI server for the web interface
├── app.py             # Streamlit chat app (fallback UI, uses rag.py)
├── ingest.py          # Builds the ChromaDB vector store from PDFs
├── web/               # React web interface (Vite)
├── requirements.txt   # Pinned Python dependencies
├── .env.example       # Template for your Gemini API key
├── .gitignore
├── pdfs/              # Put your source PDFs here (not tracked by Git)
└── db/                # Generated vector database (not tracked by Git)
```

## Installation

```bash
git clone <your-repo-url>
cd ScriptureAI
python -m venv venv
```

Activate the environment (Windows PowerShell: `venv\Scripts\Activate.ps1`; macOS/Linux: `source venv/bin/activate`), then:

```bash
pip install -r requirements.txt
```

The first run downloads the `all-MiniLM-L6-v2` model from Hugging Face.

## Environment variable setup

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/), then copy the template and add your key:

```bash
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env`:

```
GEMINI_API_KEY=your_real_key_here
```

`.env` is ignored by Git. Never commit your key. You can also set `GEMINI_API_KEY` as a normal environment variable instead.

## Add your documents

**This repository does not include any source texts.** You must supply your own documents that you have the legal right to use. Place your `.pdf` files in the `pdfs/` folder. Text-based PDFs work; scanned image-only PDFs have no extractable text and are skipped with a warning.

## Ingest documents

```bash
python ingest.py
```

This creates the `db/` folder. Each run **rebuilds** the `scripture` collection from the PDFs currently in `pdfs/`: it deletes the existing collection and re-ingests everything. It is therefore safe to re-run (no duplicates or ID conflicts), but it **replaces the existing generated database**. PDFs you have removed from `pdfs/` also disappear from the database. Chunk IDs are stable (`<filename>_<chunk index>`).

## Run the web interface

You need Node.js 18 or newer. **Option 1: one server (simplest)**. Build the site once, then start the API, which also serves the built site:

```bash
cd web
npm install
npm run build
cd ..
uvicorn api:app --port 8000
```

Open http://127.0.0.1:8000.

**Option 2: development.** Run the API and the Vite dev server side by side (two terminals):

```bash
uvicorn api:app --port 8000      # terminal 1, from the project root
cd web && npm run dev            # terminal 2
```

Open http://localhost:5173. Requests to `/api` are forwarded to port 8000. The Gemini key is only ever read by the Python server; the browser never sees it. Conversation history is stored in the browser (localStorage) only.

## Run the Streamlit fallback

```bash
streamlit run app.py
```

Run the Python commands from the project root, since paths (`db`, `pdfs`) are relative.

## Limitations

- In the Streamlit fallback, answers do not show their sources. The web interface shows the retrieved passages and file names under each answer ("Sources"). Page numbers are not stored, only the file name.
- The Stop button cancels the browser's request; the server may still finish that answer in the background (answers are not streamed).
- Retrieval always returns the 5 nearest chunks with no relevance threshold, so unrelated questions still get context sent to the model. Grounding relies on the prompt instruction.
- Each question is answered independently; earlier chat turns are not sent to the model.
- Ingestion re-embeds every PDF on each run (no incremental updates), so large collections take a while.
- Text quality depends on PDF extraction; non-English or poorly encoded PDFs may extract badly. `all-MiniLM-L6-v2` is an English-focused model.
- The web interface reports API failures and quota problems with a general message and a retry button. The Streamlit fallback has no such handling, and neither handles a missing or empty database specially.
- No automated tests.
- Requires your own Gemini API key; usage may be subject to Google's quotas and pricing.

## License

No license has been chosen yet. Add one before making the repository public if you want others to reuse the code.

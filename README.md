# Scripture AI

A Retrieval-Augmented Generation (RAG) chat application that answers questions about a collection of scripture/text PDFs, using only passages retrieved from those documents.

## The problem it solves

Large PDF collections are hard to search by meaning. Keyword search misses relevant passages that use different words, and asking a general-purpose LLM directly can produce answers that are not grounded in your texts. Scripture AI retrieves the passages most similar to your question and asks Gemini to answer **only from that retrieved context**.

## How it works

1. **PDF ingestion** (`ingest.py`): every `.pdf` in `pdfs/` is read page by page with `pypdf` and the text is concatenated.
2. **Chunking**: text is split with LangChain's `RecursiveCharacterTextSplitter` into chunks of 500 characters with a 50-character overlap.
3. **Embeddings**: each chunk is converted into a vector with the Sentence Transformers model `all-MiniLM-L6-v2` (runs locally).
4. **Vector storage**: chunks and vectors are stored in a persistent [ChromaDB](https://www.trychroma.com/) collection named `scripture` in the `db/` folder.
5. **Retrieval** (`app.py`): the user's question is embedded with the same model, and the 5 nearest chunks are fetched from ChromaDB.
6. **Generation**: the chunks are placed in a prompt that instructs Gemini (`gemini-2.5-flash`) to answer only from the provided context and to say so if the answer is not there. The answer is shown in a Streamlit chat UI.

## Architecture

```
            INDEXING (run once: python ingest.py)
  pdfs/*.pdf --> pypdf text extraction --> 500-char chunks (50 overlap)
                                                  |
                                   SentenceTransformer (all-MiniLM-L6-v2)
                                                  |
                                      ChromaDB  (db/, collection "scripture")

            QUERYING (streamlit run app.py)
  User question --> embed (same model) --> ChromaDB top-5 similar chunks
                                                  |
                              prompt = instructions + chunks + question
                                                  |
                                     Gemini (gemini-2.5-flash)
                                                  |
                                       Answer in Streamlit chat
```

## Tech stack

- Python 3.11
- [Streamlit](https://streamlit.io/): web UI
- [ChromaDB](https://www.trychroma.com/): vector database
- [Sentence Transformers](https://www.sbert.net/): `all-MiniLM-L6-v2` embeddings
- [pypdf](https://pypdf.readthedocs.io/): PDF text extraction
- [LangChain Text Splitters](https://python.langchain.com/): chunking
- [Google Gemini API](https://ai.google.dev/) via the `google-genai` SDK
- python-dotenv: loads the API key from `.env`

## Project structure

```
ScriptureAI/
├── app.py             # Streamlit chat app (retrieval + Gemini generation)
├── ingest.py          # Builds the ChromaDB vector store from PDFs
├── requirements.txt   # Pinned dependencies
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

## Run the app

```bash
streamlit run app.py
```

Run both commands from the project root, since paths (`db`, `pdfs`) are relative.

## Limitations

- Answers do **not** show sources (file name or page); retrieved chunks are not displayed to the user.
- Each chunk is stored with its source file name as metadata (`source`), but the page number is not stored, and `app.py` does not use this metadata yet.
- Retrieval always returns the 5 nearest chunks with no relevance threshold, so unrelated questions still get context sent to the model. Grounding relies on the prompt instruction.
- Each question is answered independently; earlier chat turns are not sent to the model.
- Ingestion re-embeds every PDF on each run (no incremental updates), so large collections take a while.
- Text quality depends on PDF extraction; non-English or poorly encoded PDFs may extract badly. `all-MiniLM-L6-v2` is an English-focused model.
- No error handling for API failures, quota limits, or a missing/empty database.
- No automated tests.
- Requires your own Gemini API key; usage may be subject to Google's quotas and pricing.

## License

No license has been chosen yet. Add one before making the repository public if you want others to reuse the code.

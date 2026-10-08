import os
import chromadb
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

DB_PATH = "db"
COLLECTION_NAME = "scripture"
BATCH_SIZE = 256

# 🔹 Use PersistentClient (IMPORTANT)
chroma_client = chromadb.PersistentClient(path=DB_PATH)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")


def reset_collection():
    """Drop the old collection (if any) and create an empty one.

    Rebuilding from scratch makes ingestion idempotent: re-running it never
    creates duplicates or ID conflicts, and PDFs removed from pdfs/ also
    disappear from the database.
    """
    try:
        chroma_client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass  # collection did not exist yet
    return chroma_client.get_or_create_collection(COLLECTION_NAME)


def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        content = page.extract_text()
        if content:
            text += content + "\n"
    return text


def ingest_pdfs():
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )

    folder = "pdfs"

    collection = reset_collection()

    for file in sorted(os.listdir(folder)):
        if file.lower().endswith(".pdf"):
            print(f"Processing {file}...")

            full_path = os.path.join(folder, file)
            text = extract_text_from_pdf(full_path)

            if not text.strip():
                print(f"⚠️ No extractable text in {file}")
                continue

            chunks = splitter.split_text(text)

            for start in range(0, len(chunks), BATCH_SIZE):
                batch = chunks[start:start + BATCH_SIZE]
                embeddings = embedding_model.encode(batch).tolist()

                # Stable IDs (filename + chunk index); upsert is a safety net
                collection.upsert(
                    documents=batch,
                    embeddings=embeddings,
                    ids=[f"{file}_{start + j}" for j in range(len(batch))],
                    metadatas=[{"source": file} for _ in batch],
                )

    print("✅ Done ingesting PDFs!")


if __name__ == "__main__":
    ingest_pdfs()
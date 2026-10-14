"""Move the search index between computers WITHOUT copying ChromaDB's own files.

ChromaDB's folder (db/) is made of binary files that were written on one operating system.
Instead of trusting that they load on another one (for example Linux on Render), this script
saves the index as plain portable files and rebuilds a fresh index from them on the new machine.

    python index_data.py export  data_out     # on your PC: db/  ->  data_out/
    python index_data.py build   data_out     # on the server: data_out/  ->  db/ (fresh index)
    python index_data.py check   data_out     # verify the files are complete and untampered

What is exported (the folder is PRIVATE: it contains the text of your books, so it must go only
into a private repository, never into the public code repository):
    chunks.jsonl.gz     one line per passage: id, text, metadata
    embeddings.npy      the passage vectors (so nothing needs to be re-embedded)
    manifest.json       counts, vector size, model name and a SHA-256 checksum of each file above
No keys, tokens or settings are ever written.
"""

import gzip
import hashlib
import json
import os
import sys

import numpy as np

COLLECTION_NAME = "scripture"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
BATCH = 500
FILES = ("chunks.jsonl.gz", "embeddings.npy")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_verified(folder):
    """Read the exported files, refusing to continue if anything is missing or does not match the manifest."""
    manifest_path = os.path.join(folder, "manifest.json")
    if not os.path.isfile(manifest_path):
        sys.exit(f"No manifest.json in {folder}")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    for name in FILES:
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            sys.exit(f"Missing {name}")
        if sha256(path) != manifest["files"][name]:
            sys.exit(f"{name} does not match its checksum: the data is damaged or was changed")

    ids, documents, metadatas = [], [], []
    with gzip.open(os.path.join(folder, "chunks.jsonl.gz"), "rt", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            ids.append(row["id"])
            documents.append(row["text"])
            metadatas.append(row["metadata"])
    embeddings = np.load(os.path.join(folder, "embeddings.npy"), allow_pickle=False)  # plain numbers only

    if not (len(ids) == len(documents) == len(embeddings) == manifest["count"]):
        sys.exit("The number of passages and vectors does not match the manifest")
    if embeddings.ndim != 2 or embeddings.shape[1] != manifest["dimension"]:
        sys.exit("The vectors have an unexpected size")
    if len(set(ids)) != len(ids):
        sys.exit("Duplicate passage ids")
    return manifest, ids, documents, metadatas, embeddings


def export(folder):
    import chromadb

    db_path = os.getenv("DB_PATH") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "db")
    collection = chromadb.PersistentClient(path=db_path).get_collection(COLLECTION_NAME)
    data = collection.get(include=["documents", "metadatas", "embeddings"])
    ids, documents, metadatas = data["ids"], data["documents"], data["metadatas"]
    embeddings = np.asarray(data["embeddings"], dtype=np.float32)
    if not ids:
        sys.exit("The index is empty: nothing to export")

    # a stable order, so exporting twice gives identical files
    order = sorted(range(len(ids)), key=lambda i: ids[i])
    os.makedirs(folder, exist_ok=True)
    with gzip.GzipFile(os.path.join(folder, "chunks.jsonl.gz"), "wb", mtime=0) as raw:  # mtime=0: reproducible bytes
        for i in order:
            line = json.dumps({"id": ids[i], "text": documents[i], "metadata": metadatas[i]}, ensure_ascii=False)
            raw.write(line.encode("utf-8") + b"\n")
    np.save(os.path.join(folder, "embeddings.npy"), embeddings[order], allow_pickle=False)

    manifest = {
        "format": 1,
        "collection": COLLECTION_NAME,
        "embedding_model": EMBEDDING_MODEL,
        "count": len(ids),
        "dimension": int(embeddings.shape[1]),
        "files": {name: sha256(os.path.join(folder, name)) for name in FILES},
    }
    with open(os.path.join(folder, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Exported {len(ids)} passages ({manifest['dimension']} numbers each) to {folder}")


def build(folder):
    import chromadb

    manifest, ids, documents, metadatas, embeddings = load_verified(folder)
    db_path = os.getenv("DB_PATH") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "db")
    client = chromadb.PersistentClient(path=db_path)
    try:
        client.delete_collection(COLLECTION_NAME)  # always start from a clean index
    except Exception:
        pass
    collection = client.get_or_create_collection(COLLECTION_NAME)
    for start in range(0, len(ids), BATCH):
        end = start + BATCH
        collection.add(
            ids=ids[start:end],
            documents=documents[start:end],
            metadatas=metadatas[start:end],
            embeddings=embeddings[start:end].tolist(),
        )
    if collection.count() != manifest["count"]:
        sys.exit("The rebuilt index has the wrong number of passages")
    print(f"Built a fresh index with {collection.count()} passages at {db_path}")


def check(folder):
    manifest, ids, *_ = load_verified(folder)
    print(f"OK: {len(ids)} passages, checksums match")


if __name__ == "__main__":
    commands = {"export": export, "build": build, "check": check}
    if len(sys.argv) != 3 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]](sys.argv[2])

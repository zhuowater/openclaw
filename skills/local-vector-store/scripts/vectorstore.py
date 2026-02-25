#!/usr/bin/env python3
"""
Local vector store using sentence-transformers for semantic search.
"""
import sys
import json
import os
from pathlib import Path
import pickle
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

WORKSPACE = Path("/root/openclaw")
INDEX_DIR = WORKSPACE / ".vector-index"
INDEX_FILE = INDEX_DIR / "vectors.pkl"
MODEL_NAME = "all-MiniLM-L6-v2"


def load_model():
    """Load sentence transformer model."""
    return SentenceTransformer(MODEL_NAME)


def extract_memory_content():
    """Extract all memory files content."""
    documents = []
    
    # MEMORY.md
    memory_md = WORKSPACE / "MEMORY.md"
    if memory_md.exists():
        content = memory_md.read_text(encoding='utf-8', errors='ignore')
        # Split into chunks (by header or paragraphs)
        chunks = [c.strip() for c in content.split('\n\n') if c.strip()]
        for chunk in chunks:
            documents.append({
                "path": "MEMORY.md",
                "content": chunk
            })
    
    # memory/*.md
    memory_dir = WORKSPACE / "memory"
    if memory_dir.exists():
        for md_file in memory_dir.glob("*.md"):
            content = md_file.read_text(encoding='utf-8', errors='ignore')
            chunks = [c.strip() for c in content.split('\n\n') if c.strip()]
            for chunk in chunks:
                documents.append({
                    "path": f"memory/{md_file.name}",
                    "content": chunk
                })
    
    return documents


def build_index():
    """Build and save vector index."""
    model = load_model()
    documents = extract_memory_content()
    
    if not documents:
        print(json.dumps({"error": "No documents found"}))
        return
    
    texts = [doc["content"] for doc in documents]
    embeddings = model.encode(texts, show_progress_bar=False)
    
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    
    with open(INDEX_FILE, 'wb') as f:
        pickle.dump({
            "documents": documents,
            "embeddings": embeddings
        }, f)
    
    print(json.dumps({
        "status": "success",
        "indexed": len(documents),
        "model": MODEL_NAME
    }))


def search(query, top_k=5):
    """Search vector index."""
    if not INDEX_FILE.exists():
        print(json.dumps({"error": "Index not found. Run 'index' command first."}))
        return
    
    model = load_model()
    query_embedding = model.encode([query], show_progress_bar=False)
    
    with open(INDEX_FILE, 'rb') as f:
        data = pickle.load(f)
    
    documents = data["documents"]
    embeddings = data["embeddings"]
    
    similarities = cosine_similarity(query_embedding, embeddings)[0]
    
    # Get top-K
    top_indices = np.argsort(similarities)[::-1][:top_k]
    
    results = []
    for idx in top_indices:
        results.append({
            "path": documents[idx]["path"],
            "content": documents[idx]["content"][:300],  # Truncate
            "score": float(similarities[idx])
        })
    
    print(json.dumps({
        "status": "success",
        "query": query,
        "results": results
    }))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: vectorstore.py <index|search> [query]"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "index":
        build_index()
    elif command == "search":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Query required for search"}))
            sys.exit(1)
        query = " ".join(sys.argv[2:])
        search(query)
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)

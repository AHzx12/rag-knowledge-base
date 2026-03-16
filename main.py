from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from dotenv import load_dotenv
import time
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ========================
# 初始化
# ========================
app = FastAPI(
    title="RAG 知识库 API",
    version="0.2.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 允许前端访问
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 数据库连接
conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()

# ========================
# 数据模型
# ========================
class AskRequest(BaseModel):
    question: str
    top_k: Optional[int] = 3

class AskResponse(BaseModel):
    question: str
    answer: str
    sources: list[str]
    chunks_found: int
    time_taken: float

class DocumentIn(BaseModel):
    content: str
    filename: str

# ========================
# RAG 核心函数
# ========================
def get_embedding(text: str) -> list:
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

def retrieve(question: str, top_k: int = 3) -> list[dict]:
    q_embedding = get_embedding(question)
    cur.execute("""
        SELECT content, filename,
               1 - (embedding <=> %s::vector) AS similarity
        FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (q_embedding, q_embedding, top_k))
    return [
        {"content": r[0], "filename": r[1], "similarity": r[2]}
        for r in cur.fetchall()
    ]

def generate(question: str, chunks: list[dict]) -> str:
    context = "\n\n".join([
        f"[来源: {c['filename']}]\n{c['content']}"
        for c in chunks
    ])
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"""你是知识库助手。只根据以下文档内容回答问题，不要编造信息。
如果文档中没有相关信息，请明确说明。

文档内容：
{context}

问题：{question}"""}],
        temperature=0.1
    )
    return response.choices[0].message.content

# ========================
# API 路由
# ========================
@app.get("/")
def root():
    return {"status": "running", "version": "0.2.0"}

@app.get("/health")
def health():
    cur.execute("SELECT COUNT(*) FROM documents")
    doc_count = cur.fetchone()[0]
    return {
        "status": "healthy",
        "documents_in_db": doc_count
    }

@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest):
    """核心问答接口：输入问题，返回基于知识库的答案"""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    if len(request.question) > 500:
        raise HTTPException(status_code=400, detail="问题不能超过500字")

    start = time.time()

    # 检索
    chunks = retrieve(request.question, request.top_k)
    relevant = [c for c in chunks if c["similarity"] > 0.3]

    # 没找到相关文档
    if not relevant:
        return AskResponse(
            question=request.question,
            answer="抱歉，知识库中没有找到相关信息。",
            sources=[],
            chunks_found=0,
            time_taken=round(time.time() - start, 3)
        )

    # 生成答案
    answer = generate(request.question, relevant)
    sources = list(set([c["filename"] for c in relevant]))

    return AskResponse(
        question=request.question,
        answer=answer,
        sources=sources,
        chunks_found=len(relevant),
        time_taken=round(time.time() - start, 3)
    )

@app.post("/upload")
def upload(doc: DocumentIn):
    """上传新文档到知识库"""
    if not doc.content.strip():
        raise HTTPException(status_code=400, detail="文档内容不能为空")

    embedding = get_embedding(doc.content)
    cur.execute(
        "INSERT INTO documents (content, embedding, filename) VALUES (%s, %s, %s)",
        (doc.content, embedding, doc.filename)
    )
    conn.commit()

    return {
        "status": "success",
        "message": f"已将 {doc.filename} 存入知识库",
        "char_count": len(doc.content)
    }
    
@app.get("/documents")
def list_documents():
    cur.execute("""
        SELECT filename, COUNT(*) as chunks, MAX(created_at) as uploaded_at
        FROM documents
        GROUP BY filename
        ORDER BY MAX(created_at) DESC
    """)
    rows = cur.fetchall()
    return {
        "documents": [
            {
                "filename": row[0],
                "chunks": row[1],
                "uploaded_at": row[2].strftime("%Y-%m-%d %H:%M") if row[2] else None
            }
            for row in rows
        ],
        "total_files": len(rows)
    }
    
@app.get("/documents/{filename}")
def get_document(filename: str):
    """返回某个文档的所有文本块"""
    cur.execute("""
        SELECT id, content, created_at
        FROM documents
        WHERE filename = %s
        ORDER BY id ASC
    """, (filename,))
    rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {
        "filename": filename,
        "chunks": [
            {"id": r[0], "content": r[1], "created_at": r[2].strftime("%Y-%m-%d %H:%M")}
            for r in rows
        ],
        "total_chunks": len(rows)
    }
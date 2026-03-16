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
import json
import shutil
from pathlib import Path
from fastapi import File, UploadFile
from fastapi.responses import FileResponse


# 创建文件存储目录
UPLOAD_DIR = Path("uploaded_files")
UPLOAD_DIR.mkdir(exist_ok=True)

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
# RAG 核心函数（GraphRAG 版）
# ========================

def get_embedding(text: str) -> list:
    response = client.embeddings.create(
        input=text, model="text-embedding-3-small"
    )
    return response.data[0].embedding


def retrieve(question: str, top_k: int = 3) -> list[dict]:
    """向量检索"""
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


def extract_entities_from_question(question: str) -> list[str]:
    """从用户问题里提取关键实体，用于图谱查询"""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"""从以下问题中提取 1-3 个最重要的实体名词。
只返回 JSON 数组，例如：["Python", "函数"]
不要其他文字。

问题：{question}"""}],
        temperature=0
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except Exception:
        return []


def query_graph(entity_name: str, depth: int = 2) -> list[dict]:
    """图谱遍历：从实体出发，找关联的所有关系"""
    cur.execute("""
        WITH RECURSIVE graph_traverse AS (
            SELECT source_entity, relation, target_entity, 1 AS depth
            FROM relationships
            WHERE source_entity ILIKE %s OR target_entity ILIKE %s
            UNION
            SELECT r.source_entity, r.relation, r.target_entity, gt.depth + 1
            FROM relationships r
            JOIN graph_traverse gt
              ON r.source_entity = gt.target_entity
             AND gt.depth < %s
        )
        SELECT DISTINCT source_entity, relation, target_entity
        FROM graph_traverse
        LIMIT 20
    """, (f"%{entity_name}%", f"%{entity_name}%", depth))
    return [
        {"source": row[0], "relation": row[1], "target": row[2]}
        for row in cur.fetchall()
    ]


def generate(question: str, chunks: list[dict], graph_context: str = "") -> str:
    """LLM 生成答案，同时接受向量检索结果和图谱上下文"""
    vector_context = "\n\n".join([
        f"[来源: {c['filename']}]\n{c['content']}"
        for c in chunks
    ])

    graph_section = ""
    if graph_context:
        graph_section = f"\n\n知识图谱关联信息：\n{graph_context}"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"""你是知识库助手。根据以下信息回答问题。
只使用提供的内容回答，不要编造信息。
用与用户提问相同的语言回答。

文档内容：
{vector_context}{graph_section}

问题：{question}"""}],
        temperature=0.1
    )
    return response.choices[0].message.content


def ask_with_graph(question: str, top_k: int = 3) -> dict:
    """完整 GraphRAG 流程"""

    # 第一步：向量检索
    chunks = retrieve(question, top_k)
    relevant = [c for c in chunks if c["similarity"] > 0.3]

    # 第二步：图谱查询
    entities = extract_entities_from_question(question)
    graph_triples = []
    for entity in entities:
        triples = query_graph(entity)
        graph_triples.extend(triples)

    # 去重
    seen = set()
    unique_triples = []
    for t in graph_triples:
        key = f"{t['source']}-{t['relation']}-{t['target']}"
        if key not in seen:
            seen.add(key)
            unique_triples.append(t)

    # 把图谱三元组转成文字
    graph_context = ""
    if unique_triples:
        graph_context = "\n".join([
            f"{t['source']} --{t['relation']}--> {t['target']}"
            for t in unique_triples
        ])

    # 没有任何相关内容
    if not relevant and not unique_triples:
        return {
            "question": question,
            "answer": "抱歉，知识库中没有找到相关信息。",
            "sources": [],
            "chunks_found": 0,
            "graph_triples": [],
            "entities_found": entities
        }

    # 第三步：生成答案
    answer = generate(question, relevant, graph_context)
    sources = list(set([c["filename"] for c in relevant]))

    return {
        "question": question,
        "answer": answer,
        "sources": sources,
        "chunks_found": len(relevant),
        "graph_triples": unique_triples,
        "entities_found": entities
    }

def extract_entities_and_relations(text: str, filename: str) -> dict:
    """用 LLM 提取实体和关系，限制输入长度加快速度"""
    # 限制输入长度，避免大块文本消耗太多时间
    text = text[:800]

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"""从文本提取实体和关系，最多5个实体、5条关系。
只返回JSON，格式：
{{"entities":[{{"name":"","type":"","description":""}}],
  "relationships":[{{"source":"","relation":"","target":""}}]}}

文本：{text}"""}],
        temperature=0,
        max_tokens=400,        # 限制输出长度
        timeout=8              # 8秒超时，超时跳过这块
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"): raw = raw[4:]
    return json.loads(raw.strip())


def store_graph_data(data: dict, filename: str) -> tuple[int, int]:
    """把实体和关系存入数据库，返回存入数量"""
    e_count = 0
    for e in data.get("entities", []):
        try:
            cur.execute("""
                INSERT INTO entities (name, type, description, source_filename)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name, source_filename) DO UPDATE
                SET description = EXCLUDED.description
            """, (e["name"], e.get("type",""), e.get("description",""), filename))
            e_count += 1
        except Exception:
            pass

    r_count = 0
    for r in data.get("relationships", []):
        try:
            cur.execute("""
                INSERT INTO relationships (source_entity, relation, target_entity, source_filename)
                VALUES (%s, %s, %s, %s)
            """, (r["source"], r["relation"], r["target"], filename))
            r_count += 1
        except Exception:
            pass

    conn.commit()
    return e_count, r_count
    
@app.delete("/documents/{filename}")
def delete_document(filename: str):
    """删除某个文档的所有数据：文本块 + 实体 + 关系"""
    cur.execute("SELECT COUNT(*) FROM documents WHERE filename = %s", (filename,))
    count = cur.fetchone()[0]
    if count == 0:
        raise HTTPException(status_code=404, detail="文档不存在")

    cur.execute("DELETE FROM documents WHERE filename = %s", (filename,))
    cur.execute("DELETE FROM entities WHERE source_filename = %s", (filename,))
    cur.execute("DELETE FROM relationships WHERE source_filename = %s", (filename,))
    conn.commit()

    return {
        "status": "success",
        "message": f"已删除 {filename}",
        "deleted_chunks": count
    }
    
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
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    if len(request.question) > 500:
        raise HTTPException(status_code=400, detail="问题不能超过500字")

    start = time.time()
    result = ask_with_graph(request.question, request.top_k)

    return AskResponse(
        question=result["question"],
        answer=result["answer"],
        sources=result["sources"],
        chunks_found=result["chunks_found"],
        time_taken=round(time.time() - start, 3)
    )

@app.post("/upload")
def upload(doc: DocumentIn):
    if not doc.content.strip():
        raise HTTPException(status_code=400, detail="文档内容不能为空")

    # 第一步：切块 + 向量化存入数据库
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
        separators=["\n\n", "\n", "。", "！", "？", " ", ""]
    )
    chunks = splitter.split_text(doc.content)
    chunks = [c for c in chunks if c.strip()]

    for chunk in chunks:
        embedding = get_embedding(chunk)
        cur.execute(
            "INSERT INTO documents (content, embedding, filename) VALUES (%s, %s, %s)",
            (chunk, embedding, doc.filename)
        )
    conn.commit()

    # 第二步：自动提取实体和关系，构建图谱
    graph_entities = 0
    graph_relations = 0
    for chunk in chunks:
        try:
            data = extract_entities_and_relations(chunk, doc.filename)
            e, r = store_graph_data(data, doc.filename)
            graph_entities += e
            graph_relations += r
        except Exception as ex:
            print(f"图谱提取失败（跳过）：{ex}")

    return {
        "status": "success",
        "message": f"已将 {doc.filename} 存入知识库",
        "chunks_stored": len(chunks),
        "graph_entities": graph_entities,
        "graph_relations": graph_relations
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
    
@app.get("/graph/{entity}")
def get_graph(entity: str):
    """返回某个实体的图谱关系，供前端可视化"""
    triples = query_graph(entity, depth=2)
    
    # 整理成节点+边的格式
    nodes = set()
    for t in triples:
        nodes.add(t["source"])
        nodes.add(t["target"])

    return {
        "entity": entity,
        "nodes": [{"id": n, "label": n} for n in nodes],
        "edges": triples,
        "total": len(triples)
    }
    
@app.post("/upload-file")
async def upload_file(file: UploadFile = File(...)):
    """接收真实文件（PDF/TXT），保存原文并处理"""
    filename = file.filename or "unknown"
    content = await file.read()
    
    # 保存原始文件
    file_path = UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(content)

    # 提取文字
    if filename.endswith(".pdf"):
        from pypdf import PdfReader
        import io
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text += f"\n[第{i+1}页]\n{page_text}"
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        raise HTTPException(status_code=400, detail="无法提取文字内容")

    # 切块 + 向量化 + 图谱（复用现有逻辑）
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500, chunk_overlap=100,
        separators=["\n\n", "\n", "。", "！", "？", " ", ""]
    )
    chunks = [c for c in splitter.split_text(text) if c.strip()]

    for chunk in chunks:
        embedding = get_embedding(chunk)
        cur.execute(
            "INSERT INTO documents (content, embedding, filename) VALUES (%s, %s, %s)",
            (chunk, embedding, filename)
        )
    conn.commit()

    e_total, r_total = 0, 0
    # 只对前 5 块提取图谱，避免大文档等待太长
    graph_chunks = chunks[:5]
    for chunk in graph_chunks:
        try:
            data = extract_entities_and_relations(chunk, filename)
            e, r = store_graph_data(data, filename)
            e_total += e
            r_total += r
        except Exception as ex:
            print(f"图谱提取跳过：{ex}")

    return {
        "status": "success",
        "filename": filename,
        "chunks_stored": len(chunks),
        "graph_entities": e_total,
        "graph_relations": r_total,
        "has_original": True
    }    

@app.get("/files/{filename}")
def get_file(filename: str):
    """返回原始文件供前端预览"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="原始文件不存在")
    
    media_type = "application/pdf" if filename.endswith(".pdf") else "text/plain"
    return FileResponse(path=str(file_path), media_type=media_type)
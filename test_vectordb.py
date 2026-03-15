import os
import numpy as py
from dotenv import load_dotenv
from openai import OpenAI
import psycopg2
from pgvector.psycopg2 import register_vector

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Connect to PostgreSQL and register vector type
conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()

def get_embedding(text: str) -> list[float]:
    """获取文本的向量表示"""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

# ============================
# 存入文档片段
# ============================
print("正在存入文档片段...")

documents = [
    ("养猫指南第一章：猫咪每天需要喂食两次，早晚各一次。", "cat_guide.pdf"),
    ("养猫指南第二章：猫咪需要定期打疫苗，每年至少一次。", "cat_guide.pdf"),
    ("Python教程：Python是一种简单易学的编程语言。", "python_tutorial.pdf"),
    ("部署指南：使用Docker可以将应用打包成容器部署。", "deploy_guide.pdf"),
]

for content, filename in documents:
    embedding = get_embedding(content)
    cur.execute(
        "INSERT INTO documents (filename, content, embedding) VALUES (%s, %s, %s)",
        (filename, content, embedding)
    )
    print(f"  ✅ 存入文档: {filename} - '{content[:30]}...'")   

conn.commit()
print(f"已存入 {len(documents)} 个文档片段。")

# ============================
# 用问题检索相关文档
# ============================

questions = [
    "猫咪需要多久喂食一次？",
    "如何部署应用？"
]

for question in questions:
    q_embedding = get_embedding(question)
    
    # 用向量距离找最相似的 2 条文档
    # <=> 是 pgvector 的余弦距离运算符
    cur.execute("""
        SELECT content, filename,
               1 - (embedding <=> %s::vector) AS similarity
        FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT 2
    """, (q_embedding, q_embedding))

    results = cur.fetchall()

    print(f"\n问题：{question}")
    print("最相关的文档：")
    for content, filename, similarity in results:
        print(f"  [{similarity:.4f}] {filename}: {content[:40]}...")

cur.close()
conn.close()        
    
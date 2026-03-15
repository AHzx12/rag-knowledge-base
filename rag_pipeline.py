import os
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ========================
# 数据库连接
# ========================
conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()

# ========================
# 三个核心函数
# ========================

def get_embedding(text: str) -> list:
    """第一步：把文字变成向量"""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding


def retrieve(question: str, top_k: int = 3) -> list[dict]:
    """第二步：用向量检索最相关的文档片段"""
    q_embedding = get_embedding(question)

    cur.execute("""
        SELECT content, filename,
               1 - (embedding <=> %s::vector) AS similarity
        FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (q_embedding, q_embedding, top_k))

    results = cur.fetchall()
    return [
        {"content": row[0], "filename": row[1], "similarity": row[2]}
        for row in results
    ]


def generate(question: str, context_chunks: list[dict]) -> str:
    """第三步：把问题 + 检索到的文档片段发给 LLM，生成最终答案"""

    # 把检索到的片段拼成一段上下文
    context = "\n\n".join([
        f"[来源: {chunk['filename']}]\n{chunk['content']}"
        for chunk in context_chunks
    ])

    # 构造发给 LLM 的 prompt
    prompt = f"""你是一个知识库助手。请根据以下文档内容回答用户的问题。
只使用提供的文档内容来回答，不要编造信息。
如果文档中没有相关信息，请明确说明。

文档内容：
{context}

用户问题：{question}

请用中文回答："""

    response = client.chat.completions.create(
        model="gpt-4o-mini",   # 便宜但够用
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.1        # 接近0 = 更严谨，不乱发挥
    )

    return response.choices[0].message.content


def ask(question: str) -> dict:
    """完整的 RAG 流程：输入问题，输出答案"""

    print(f"\n{'='*50}")
    print(f"问题：{question}")
    print('='*50)

    # 第一步：检索
    print("\n🔍 检索相关文档...")
    chunks = retrieve(question, top_k=3)
    for chunk in chunks:
        print(f"  [{chunk['similarity']:.4f}] {chunk['filename']}: {chunk['content'][:40]}...")

    # 相似度过滤：低于 0.3 的结果不可信，丢掉
    relevant_chunks = [c for c in chunks if c['similarity'] > 0.3]

    if not relevant_chunks:
        return {
            "question": question,
            "answer": "抱歉，知识库中没有找到相关信息。",
            "sources": []
        }

    # 第二步：生成答案
    print("\n🤖 生成答案...")
    answer = generate(question, relevant_chunks)

    sources = list(set([c['filename'] for c in relevant_chunks]))

    return {
        "question": question,
        "answer": answer,
        "sources": sources
    }


# ========================
# 测试
# ========================
if __name__ == "__main__":
    test_questions = [
        "猫咪应该多久喂食一次？",
        "如何用Docker部署应用？",
        "猫咪需要打什么疫苗？",
        "今天天气怎么样？",    # 知识库里没有这个信息
    ]

    for question in test_questions:
        result = ask(question)
        print(f"\n💬 答案：{result['answer']}")
        print(f"📚 来源：{result['sources']}")
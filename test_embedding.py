from openai import OpenAI
import numpy as np
from dotenv import load_dotenv
import os   

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def get_embedding(text: str) -> list[float]:
    """获取文本的向量表示"""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding

def cosine_similarity(vec1: list, vec2: list) -> float:
    """计算两个向量的余弦相似度, 结果在0-1之间"""
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)
    if np.linalg.norm(vec1) == 0 or np.linalg.norm(vec2) == 0:
        return 0.0
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))      

# 准备几段文字
texts = {
    "猫":   "猫是一种常见的宠物动物",
    "cat":  "A cat is a common pet animal",
    "狗":   "狗是人类最忠实的动物朋友",
    "电脑": "电脑是一种用于计算和处理数据的机器",
    "RAG":  "RAG是一种结合检索和生成的AI技术"
}

# 生成所有向量
print("正在生成 Embedding...")
embeddings = {}
for name, text in texts.items():
    embeddings[name] = get_embedding(text)
    print(f"  ✅ {name}: 向量维度 = {len(embeddings[name])}")

# 计算相似度
print("\n=== 相似度对比 ===")
pairs = [
    ("猫", "cat"),    # 应该很高：同一个意思
    ("猫", "狗"),     # 应该中等：都是动物
    ("猫", "电脑"),   # 应该很低：完全不同
    ("猫", "RAG"),    # 应该很低：完全不同
]

for a, b in pairs:
    score = cosine_similarity(embeddings[a], embeddings[b])
    bar = "█" * int(score * 20)
    print(f"  {a} ↔ {b}: {score:.4f}  {bar}") 
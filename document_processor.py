import os
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()

# ========================
# 核心函数
# ========================

def extract_text_from_pdf(pdf_path: str) -> str:
    """从 PDF 提取纯文字"""
    reader = PdfReader(pdf_path)
    text = ""
    for i, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            text += f"\n[第{i+1}页]\n{page_text}"
    return text


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    """
    把长文本切成小块
    chunk_size: 每块大约多少字
    overlap: 相邻块重叠多少字（保留上下文）
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", "。", "！", "？", " ", ""]
        # 优先从段落分割，实在不行才从句子、单词分割
    )
    return splitter.split_text(text)


def get_embedding(text: str) -> list:
    """文字 → 向量"""
    response = client.embeddings.create(
        input=text,
        model="text-embedding-3-small"
    )
    return response.data[0].embedding


def process_and_store(filepath: str) -> dict:
    """
    完整流程：读取文件 → 切块 → 生成向量 → 存入数据库
    支持 PDF 和 TXT 文件
    """
    filename = os.path.basename(filepath)
    print(f"\n处理文件：{filename}")

    # 第一步：提取文字
    if filepath.endswith(".pdf"):
        print("  📄 提取 PDF 文字...")
        text = extract_text_from_pdf(filepath)
    elif filepath.endswith(".txt"):
        print("  📄 读取 TXT 文件...")
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        return {"error": f"不支持的文件格式：{filepath}"}

    print(f"  ✅ 提取完成，共 {len(text)} 字")

    # 第二步：切块
    print("  ✂️  切割文档...")
    chunks = chunk_text(text)
    print(f"  ✅ 切成 {len(chunks)} 块，每块约500字")

    # 第三步：生成向量并存入数据库
    print("  🔢 生成向量并存入数据库...")
    stored = 0
    for i, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        embedding = get_embedding(chunk)
        cur.execute(
            "INSERT INTO documents (content, embedding, filename) VALUES (%s, %s, %s)",
            (chunk, embedding, filename)
        )
        stored += 1
        # 每10块打印一次进度
        if (i + 1) % 10 == 0:
            print(f"    进度：{i+1}/{len(chunks)}")

    conn.commit()
    print(f"  ✅ 成功存入 {stored} 个文档块")

    return {
        "filename": filename,
        "total_chars": len(text),
        "chunks_stored": stored
    }


# ========================
# 测试：先用 TXT 文件测试
# ========================
if __name__ == "__main__":
    # 创建一个测试用的 TXT 文件
    test_content = """
# Python 编程指南

## 第一章：变量与数据类型

Python 是一种动态类型语言，不需要提前声明变量类型。
常见的数据类型包括：整数（int）、浮点数（float）、字符串（str）、列表（list）、字典（dict）。

变量赋值非常简单：
x = 10
name = "张三"
scores = [90, 85, 92]

## 第二章：函数

函数是组织代码的基本单位。使用 def 关键字定义函数。
函数可以接受参数，也可以返回值。
良好的函数应该只做一件事，并且有清晰的名字。

def add(a, b):
    return a + b

result = add(3, 5)  # result = 8

## 第三章：面向对象编程

Python 支持面向对象编程。类是对象的模板。
使用 class 关键字定义类，__init__ 是构造函数。
继承允许子类复用父类的代码。

class Dog:
    def __init__(self, name):
        self.name = name
    
    def bark(self):
        return f"{self.name} 说：汪汪！"

## 第四章：错误处理

使用 try/except 捕获和处理异常。
良好的错误处理让程序更健壮。
不要用空的 except 吞掉所有错误。

try:
    result = 10 / 0
except ZeroDivisionError:
    print("不能除以零！")
"""

    # 保存为测试文件
    with open("test_document.txt", "w", encoding="utf-8") as f:
        f.write(test_content)
    print("✅ 测试文件已创建：test_document.txt")

    # 处理这个文件
    result = process_and_store("test_document.txt")
    print(f"\n处理结果：{result}")

    # 验证：查询一下
    print("\n=== 验证查询 ===")
    questions = ["如何定义函数？", "什么是面向对象？", "怎么处理错误？"]

    for q in questions:
        embedding = get_embedding(q)
        cur.execute("""
            SELECT content, 1 - (embedding <=> %s::vector) AS sim
            FROM documents
            WHERE filename = 'test_document.txt'
            ORDER BY embedding <=> %s::vector
            LIMIT 1
        """, (embedding, embedding))
        row = cur.fetchone()
        if row:
            print(f"\n问：{q}")
            print(f"最相关块 [{row[1]:.4f}]：{row[0][:80]}...")

cur.close()
conn.close()
import os
import json
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()


def extract_entities_and_relations(text: str, filename: str) -> dict:
    """
    用 LLM 从文本中提取实体和关系
    返回结构化的 JSON
    """
    prompt = f"""从以下文本中提取实体和它们之间的关系。

要求：
1. 实体类型包括：人物、地点、概念、技术、组织
2. 只提取文本中明确提到的实体，不要推断
3. 关系用简短动词表示，如：是、属于、影响、使用、来自

文本：
{text}

请以 JSON 格式返回，格式如下：
{{
  "entities": [
    {{"name": "实体名", "type": "类型", "description": "一句话描述"}}
  ],
  "relationships": [
    {{"source": "实体A", "relation": "关系", "target": "实体B"}}
  ]
}}

只返回 JSON，不要其他文字。"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )

    raw = response.choices[0].message.content.strip()

    # 清理可能的 markdown 代码块
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    return json.loads(raw.strip())


def store_graph(data: dict, filename: str):
    """把提取的实体和关系存入数据库"""

    entities_stored = 0
    for e in data.get("entities", []):
        try:
            cur.execute("""
                INSERT INTO entities (name, type, description, source_filename)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name, source_filename) DO UPDATE
                SET description = EXCLUDED.description
            """, (e["name"], e.get("type", ""), e.get("description", ""), filename))
            entities_stored += 1
        except Exception as ex:
            print(f"    ⚠️  实体存储失败 {e['name']}: {ex}")

    rels_stored = 0
    for r in data.get("relationships", []):
        try:
            cur.execute("""
                INSERT INTO relationships (source_entity, relation, target_entity, source_filename)
                VALUES (%s, %s, %s, %s)
            """, (r["source"], r["relation"], r["target"], filename))
            rels_stored += 1
        except Exception as ex:
            print(f"    ⚠️  关系存储失败: {ex}")

    conn.commit()
    return entities_stored, rels_stored


def build_graph_from_file(filename: str):
    """从数据库里取出某个文件的所有块，提取图谱"""

    # 取出该文件的所有文本块
    cur.execute("SELECT content FROM documents WHERE filename = %s", (filename,))
    chunks = [row[0] for row in cur.fetchall()]

    if not chunks:
        print(f"  ⚠️  找不到文件：{filename}")
        return

    print(f"\n为 {filename} 构建知识图谱...")
    print(f"  共 {len(chunks)} 个文本块")

    total_entities = 0
    total_rels = 0

    for i, chunk in enumerate(chunks):
        print(f"  处理第 {i+1}/{len(chunks)} 块...")
        try:
            data = extract_entities_and_relations(chunk, filename)
            e_count, r_count = store_graph(data, filename)
            total_entities += e_count
            total_rels += r_count
        except Exception as ex:
            print(f"    ⚠️  处理失败：{ex}")

    print(f"  ✅ 完成：{total_entities} 个实体，{total_rels} 条关系")


def query_graph(entity_name: str, depth: int = 2) -> list[dict]:
    """
    从某个实体出发，遍历图谱，返回相关联的所有实体和关系
    depth：遍历深度（默认 2 跳）
    """
    cur.execute("""
        WITH RECURSIVE graph_traverse AS (
            -- 起点：直接相关的关系
            SELECT source_entity, relation, target_entity, 1 AS depth
            FROM relationships
            WHERE source_entity ILIKE %s OR target_entity ILIKE %s

            UNION

            -- 递归：继续往外扩展
            SELECT r.source_entity, r.relation, r.target_entity, gt.depth + 1
            FROM relationships r
            JOIN graph_traverse gt
              ON r.source_entity = gt.target_entity
             AND gt.depth < %s
        )
        SELECT DISTINCT source_entity, relation, target_entity
        FROM graph_traverse
        LIMIT 30
    """, (f"%{entity_name}%", f"%{entity_name}%", depth))

    return [
        {"source": row[0], "relation": row[1], "target": row[2]}
        for row in cur.fetchall()
    ]


# ========================
# 测试
# ========================
if __name__ == "__main__":
    # 用已有的 test_document.txt 构建图谱
    build_graph_from_file("test_document.txt")

    # 查看提取到的实体
    print("\n=== 提取到的实体 ===")
    cur.execute("SELECT name, type, description FROM entities WHERE source_filename = 'test_document.txt'")
    for row in cur.fetchall():
        print(f"  [{row[1]}] {row[0]}: {row[2]}")

    # 查看提取到的关系
    print("\n=== 提取到的关系 ===")
    cur.execute("SELECT source_entity, relation, target_entity FROM relationships WHERE source_filename = 'test_document.txt'")
    for row in cur.fetchall():
        print(f"  {row[0]} --{row[1]}--> {row[2]}")

    # 测试图谱查询
    print("\n=== 图谱查询：Python ===")
    results = query_graph("Python")
    for r in results:
        print(f"  {r['source']} --{r['relation']}--> {r['target']}")

cur.close()
conn.close()
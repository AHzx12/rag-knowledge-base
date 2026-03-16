import os
import json
import psycopg2
from pgvector.psycopg2 import register_vector
from openai import OpenAI
from dotenv import load_dotenv
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    Faithfulness,
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
)

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
conn = psycopg2.connect("postgresql://localhost/rag_db")
register_vector(conn)
cur = conn.cursor()


def get_embedding(text: str) -> list:
    response = client.embeddings.create(
        input=text, model="text-embedding-3-small"
    )
    return response.data[0].embedding


def retrieve_chunks(question: str, top_k: int = 3) -> list[str]:
    q_embedding = get_embedding(question)
    cur.execute("""
        SELECT content FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (q_embedding, top_k))
    return [row[0] for row in cur.fetchall()]


def generate_answer(question: str, contexts: list[str]) -> str:
    context = "\n\n".join(contexts)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": f"""根据以下文档回答问题，不要编造：
{context}
问题：{question}"""}],
        temperature=0.1
    )
    return response.choices[0].message.content


def build_eval_dataset(test_questions: list[dict]) -> Dataset:
    questions, answers, contexts_list, ground_truths = [], [], [], []
    print(f"构建评估数据集，共 {len(test_questions)} 个问题...\n")
    for i, item in enumerate(test_questions):
        q = item["question"]
        print(f"  [{i+1}/{len(test_questions)}] {q[:50]}...")
        contexts = retrieve_chunks(q, top_k=3)
        answer = generate_answer(q, contexts)
        questions.append(q)
        answers.append(answer)
        contexts_list.append(contexts)
        ground_truths.append(item.get("ground_truth", ""))
    return Dataset.from_dict({
        "question": questions,
        "answer": answers,
        "contexts": contexts_list,
        "ground_truth": ground_truths,
    })


def run_evaluation(dataset: Dataset) -> dict:
    print("\n运行 RAGAS 评估...")
    result = evaluate(
        dataset=dataset,
        metrics=[
            Faithfulness(),
            AnswerRelevancy(),
            ContextPrecision(),
            ContextRecall(),
        ],
    )
    return result


def get_score(result, key: str) -> float:
    import math
    val = result[key]
    if isinstance(val, list):
        valid = [v for v in val if v is not None and not (isinstance(v, float) and math.isnan(v))]
        return round(sum(valid) / len(valid), 3) if valid else 0.0
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return 0.0
    return round(float(val), 3)

def print_report(result):
    import math
    print("\n原始分数（debug）：")
    for key in ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]:
        val = result[key]
        if isinstance(val, list):
            print(f"  {key}: {[round(v,3) if v and not math.isnan(v) else 'NaN' for v in val]}")
        else:
            print(f"  {key}: {val}")
    
    print("\n" + "="*52)
    print("  RAG 评估报告")
    print("="*52)

    scores = {
        "答案忠实度   Faithfulness":      get_score(result, "faithfulness"),
        "答案相关性   Answer Relevancy":   get_score(result, "answer_relevancy"),
        "检索精确率   Context Precision":  get_score(result, "context_precision"),
        "检索召回率   Context Recall":     get_score(result, "context_recall"),
    }

    for metric, score in scores.items():
        filled = int(score * 20)
        bar = "█" * filled + "░" * (20 - filled)
        emoji = "✅" if score >= 0.7 else "⚠️ " if score >= 0.5 else "❌"
        print(f"\n{emoji} {metric}")
        print(f"   [{bar}] {score:.3f}")

    avg = round(sum(scores.values()) / len(scores), 3)
    print(f"\n{'─'*52}")
    print(f"  综合评分：{avg:.3f}")
    print("="*52)

    print("\n诊断建议：")
    vals = list(scores.values())
    if vals[0] < 0.7:
        print("  • 忠实度低 → LLM 在幻觉，加强 prompt 限制")
    if vals[1] < 0.7:
        print("  • 相关性低 → 回答跑题，优化 prompt 结构")
    if vals[2] < 0.7:
        print("  • 精确率低 → 检索噪音多，提高相似度阈值")
    if vals[3] < 0.7:
        print("  • 召回率低 → 遗漏相关内容，增大 top_k 或改善切块")
    if all(v >= 0.7 for v in vals):
        print("  • 所有指标良好！")

    return scores


if __name__ == "__main__":
    test_questions = [
        {
            "question": "什么是 accumulation point？",
            "ground_truth": "如果点 z 的任何 ε-邻域都包含集合 E 中与 z 不同的点，则称 z 为积累点。"
        },
        {
            "question": "什么是 open set？",
            "ground_truth": "如果集合 E 中的每个点都是内点，则称 E 为开集。"
        },
        {
            "question": "exponential function 的定义是什么？",
            "ground_truth": "指数函数定义为 e^z = e^x cos y + i e^x sin y，其中 z = x + iy。"
        },
        {
            "question": "什么是 connected set？",
            "ground_truth": "如果域 D 中任意两点可以通过折线连接，则称 D 为连通集。"
        },
        {
            "question": "今天天气怎么样？",
            "ground_truth": "这个问题超出了知识库范围。"
        },
    ]

    dataset = build_eval_dataset(test_questions)
    result = run_evaluation(dataset)
    scores = print_report(result)

    with open("eval_results.json", "w", encoding="utf-8") as f:
        json.dump({
            "scores": scores,
            "questions_tested": len(test_questions),
        }, f, ensure_ascii=False, indent=2)
    print("\n✅ 结果已保存到 eval_results.json")

cur.close()
conn.close()
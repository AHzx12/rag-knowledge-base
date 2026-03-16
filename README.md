# RAG Knowledge Base

基于检索增强生成（RAG）+ 知识图谱的私有知识库问答系统。

## 功能特性

- 上传 PDF / TXT 文档，自动向量化存入数据库
- 自然语言提问，基于文档内容回答
- GraphRAG：自动提取实体和关系，构建知识图谱
- 知识图谱可视化（D3.js 力导向图）
- 文档预览（查看切块内容）
- 中英双语界面

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python · FastAPI · LangChain |
| AI | OpenAI Embeddings · GPT-4o-mini |
| 数据库 | PostgreSQL · pgvector |
| 前端 | Next.js · TypeScript · Tailwind CSS · D3.js |

## 本地运行

### 1. 环境要求
- Python 3.11+
- Node.js 18+
- PostgreSQL 17 + pgvector

### 2. 配置环境变量
```bash
cp .env.example .env
# 填入你的 OpenAI API Key
```

### 3. 安装依赖
```bash
# 后端
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 前端
cd frontend && npm install
```

### 4. 初始化数据库
```bash
createdb rag_db
psql rag_db < schema.sql
```

### 5. 一键启动
```bash
./start.sh
```

访问 http://localhost:3000

## 项目结构
```
rag-knowledge-base/
├── main.py                 # FastAPI 主应用
├── document_processor.py   # PDF/TXT 处理 + Chunking
├── graph_extractor.py      # 实体提取 + 知识图谱构建
├── rag_pipeline.py         # RAG 核心逻辑
├── frontend/               # Next.js 前端
│   └── app/
│       ├── page.tsx        # 主界面
│       └── GraphView.tsx   # 图谱可视化组件
└── start.sh                # 一键启动脚本
```

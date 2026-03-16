#!/bin/bash

echo "🚀 启动 RAG Knowledge Base..."

# 检查 PostgreSQL
if ! pg_isready -q; then
    echo "📦 启动 PostgreSQL..."
    brew services start postgresql@17
    sleep 2
fi
echo "✅ PostgreSQL 运行中"

# 启动后端
echo "⚙️  启动后端 (FastAPI)..."
cd "$(dirname "$0")"
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "✅ 后端运行中 (PID: $BACKEND_PID)"

# 启动前端
echo "🎨 启动前端 (Next.js)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
echo "✅ 前端运行中 (PID: $FRONTEND_PID)"

echo ""
echo "================================"
echo "✨ RAG Knowledge Base 已启动！"
echo "   前端：http://localhost:3000"
echo "   后端：http://localhost:8000"
echo "   API文档：http://localhost:8000/docs"
echo "================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获 Ctrl+C，同时关闭前后端
trap "echo '⏹  停止所有服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; brew services stop postgresql@17; exit 0" SIGINT

wait

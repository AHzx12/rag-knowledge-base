"use client";

import { useState, useRef, useEffect } from "react";
import axios from "axios";

// 消息类型定义
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  time_taken?: number;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好！我是 RAG 知识库助手。你可以上传文档，然后向我提问。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 每次消息更新，自动滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送问题
  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:8000/ask", {
        question: input,
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: res.data.answer,
        sources: res.data.sources,
        time_taken: res.data.time_taken,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "抱歉，请求失败了。请确认后端服务是否在运行。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // 上传文档
  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus(`正在处理 ${file.name}...`);

    const text = await file.text();

    try {
      await axios.post("http://localhost:8000/upload", {
        content: text,
        filename: file.name,
      });
      setUploadStatus(`✅ ${file.name} 已成功加入知识库`);
    } catch {
      setUploadStatus(`❌ 上传失败，请重试`);
    }
  }

  // 按 Enter 发送
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部标题栏 */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">
            RAG 知识库助手
          </h1>
          <p className="text-sm text-gray-500">
            上传文档，然后用自然语言提问
          </p>
        </div>

        {/* 上传按钮 */}
        <div className="flex items-center gap-3">
          {uploadStatus && (
            <span className="text-sm text-gray-600">{uploadStatus}</span>
          )}
          <label className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition">
            上传文档
            <input
              type="file"
              accept=".txt,.pdf"
              onChange={uploadFile}
              className="hidden"
            />
          </label>
        </div>
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white border text-gray-800 shadow-sm"
              }`}
            >
              {/* 消息内容 */}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>

              {/* 来源和耗时（只有 assistant 消息才显示）*/}
              {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    来源：{msg.sources.join(", ")}
                    {msg.time_taken && ` · ${msg.time_taken}s`}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 加载动画 */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 底部输入框 */}
      <div className="bg-white border-t px-4 py-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题，按 Enter 发送..."
            rows={1}
            className="flex-1 resize-none border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            发送
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}
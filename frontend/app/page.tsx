"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  time_taken?: number;
};

type DocMeta = {
  filename: string;
  chunks: number;
  uploaded_at: string | null;
};

type Chunk = {
  id: number;
  content: string;
  created_at: string;
};

type PreviewDoc = {
  filename: string;
  chunks: Chunk[];
  total_chunks: number;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [uploadStatus, setUploadStatus] = useState<{ text: string; type: "success" | "error" | "loading" | "" }>({ text: "", type: "" });
  const [docCount, setDocCount] = useState<number | null>(null);
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const r = await axios.get("http://localhost:8000/documents");
      setDocuments(r.data.documents);
      setDocCount(r.data.documents.reduce((sum: number, d: DocMeta) => sum + d.chunks, 0));
    } catch {}
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
  }, [input]);

  async function openPreview(filename: string) {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const r = await axios.get(`http://localhost:8000/documents/${encodeURIComponent(filename)}`);
      setPreview(r.data);
    } catch {}
    setPreviewLoading(false);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: input }]);
    setInput("");
    setLoading(true);
    try {
      const res = await axios.post("http://localhost:8000/ask", { question: input });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.answer, sources: res.data.sources, time_taken: res.data.time_taken }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: lang === "zh" ? "连接失败，请确认后端服务正在运行。" : "Connection failed. Please ensure the backend is running." }]);
    } finally { setLoading(false); }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus({ text: lang === "zh" ? `正在处理 ${file.name}...` : `Processing ${file.name}...`, type: "loading" });
    try {
      const text = await file.text();
      await axios.post("http://localhost:8000/upload", { content: text, filename: file.name });
      setUploadStatus({ text: lang === "zh" ? `${file.name} 已加入知识库` : `${file.name} added`, type: "success" });
      await fetchDocuments();
      setTimeout(() => setUploadStatus({ text: "", type: "" }), 3000);
    } catch {
      setUploadStatus({ text: lang === "zh" ? "上传失败，请重试" : "Upload failed", type: "error" });
    }
    e.target.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const suggestedQuestions = {
    zh: ["猫咪应该多久喂食一次？", "如何用 Docker 部署应用？", "Python 怎么处理错误？", "RAG 技术是什么？"],
    en: ["How often should I feed my cat?", "How to deploy with Docker?", "How does Python handle errors?", "What is RAG technology?"],
  };

  const t = {
    zh: {
      appName: "RAG Knowledge Base", status: "后端运行中", dbStatus: "知识库状态",
      connected: "已连接", docChunks: (n: number) => `${n} 个文档块`,
      upload: "上传文档", uploadHint: "点击上传 .txt / .pdf",
      sidebarNote: "上传文档后，系统会自动将其向量化并存入知识库，之后可以用自然语言提问。",
      chatTitle: "知识库问答", chatSubtitle: "基于你上传的文档回答问题",
      emptyTitle: "开始提问", emptyDesc: "先在左侧上传文档，然后用自然语言提问。",
      placeholder: "输入问题...", footer: "Enter 发送 · Shift+Enter 换行", you: "你",
      viewDocs: "已上传文档", noDocsYet: "还没有上传任何文档", chunks: "块", hidePanel: "收起",
      preview: "预览", closePreview: "关闭预览", chunk: "块", loadingPreview: "加载中...",
      chunkLabel: (i: number, total: number) => `第 ${i} 块 / 共 ${total} 块`,
    },
    en: {
      appName: "RAG Knowledge Base", status: "Backend running", dbStatus: "Knowledge Base",
      connected: "Connected", docChunks: (n: number) => `${n} chunks`,
      upload: "Upload Doc", uploadHint: "Click to upload .txt / .pdf",
      sidebarNote: "After uploading, documents are automatically vectorized and stored.",
      chatTitle: "Knowledge Base Q&A", chatSubtitle: "Answers based on your uploaded documents",
      emptyTitle: "Start asking", emptyDesc: "Upload documents on the left, then ask questions in natural language.",
      placeholder: "Ask a question...", footer: "Enter to send · Shift+Enter for new line", you: "You",
      viewDocs: "Uploaded Documents", noDocsYet: "No documents uploaded yet", chunks: "chunks", hidePanel: "Hide",
      preview: "Preview", closePreview: "Close", chunk: "chunk", loadingPreview: "Loading...",
      chunkLabel: (i: number, total: number) => `Chunk ${i} of ${total}`,
    },
  }[lang];

  return (
    <div className="flex h-screen bg-[#f5f5f0] font-sans">

      {/* ── 左侧边栏 ── */}
      <aside className="w-64 bg-[#1c1c1e] flex flex-col py-6 px-4 shrink-0 overflow-y-auto">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <span className="text-white font-semibold text-sm">{t.appName}</span>
          </div>
          <p className="text-gray-500 text-xs ml-8">v0.3.0</p>
        </div>

        {/* 知识库状态 */}
        <div className="bg-[#2c2c2e] rounded-xl p-4 mb-4">
          <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">{t.dbStatus}</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full"/>
              <span className="text-white text-sm">{t.connected}</span>
            </div>
            <button
              onClick={() => setShowDocs(v => !v)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${showDocs ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-[#3c3c3e]"}`}
            >
              {showDocs ? t.hidePanel : t.viewDocs}
            </button>
          </div>
          {docCount !== null && <p className="text-gray-500 text-xs mt-2">{t.docChunks(docCount)}</p>}
        </div>

        {/* 文档列表 */}
        {showDocs && (
          <div className="bg-[#2c2c2e] rounded-xl p-4 mb-4">
            <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">{t.viewDocs}</p>
            {documents.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-2">{t.noDocsYet}</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.filename} className="bg-[#1c1c1e] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" className="shrink-0">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className="text-white text-xs truncate flex-1">{doc.filename}</span>
                    </div>
                    <div className="flex items-center justify-between ml-5">
                      <span className="text-gray-600 text-xs">{doc.chunks} {t.chunks}</span>
                      {/* 预览按钮 */}
                      <button
                        onClick={() => { openPreview(doc.filename); }}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        {t.preview}
                      </button>
                    </div>
                    {doc.uploaded_at && <p className="text-gray-700 text-xs ml-5 mt-0.5">{doc.uploaded_at}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 上传 */}
        <div className="bg-[#2c2c2e] rounded-xl p-4 mb-4">
          <p className="text-gray-400 text-xs mb-3 uppercase tracking-wide">{t.upload}</p>
          <label className="flex flex-col items-center gap-2 cursor-pointer border border-dashed border-gray-600 rounded-lg p-3 hover:border-blue-500 transition-colors group">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500 group-hover:text-blue-400 transition-colors">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-gray-400 text-xs group-hover:text-blue-400 transition-colors">{t.uploadHint}</span>
            <input type="file" accept=".txt,.pdf" onChange={uploadFile} className="hidden"/>
          </label>
          {uploadStatus.text && (
            <div className={`mt-2 text-xs rounded-lg px-3 py-2 ${uploadStatus.type === "success" ? "bg-green-900/40 text-green-400" : uploadStatus.type === "error" ? "bg-red-900/40 text-red-400" : "bg-blue-900/40 text-blue-400"}`}>
              {uploadStatus.type === "loading" && <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-1"/>}
              {uploadStatus.text}
            </div>
          )}
        </div>

        <div className="mt-auto">
          <p className="text-gray-600 text-xs leading-relaxed">{t.sidebarNote}</p>
        </div>
      </aside>

      {/* ── 主区域 ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-gray-900 font-semibold">{t.chatTitle}</h1>
            <p className="text-gray-400 text-xs mt-0.5">{t.chatSubtitle}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setLang("zh")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "zh" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>中文</button>
              <button onClick={() => setLang("en")} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang === "en" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>EN</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
              <span className="text-gray-400 text-xs">{t.status}</span>
            </div>
          </div>
        </header>

        {/* 内容区：聊天 + 预览并排 */}
        <div className="flex-1 flex overflow-hidden">

          {/* 聊天区 */}
          <div className={`flex flex-col overflow-hidden transition-all duration-300 ${preview || previewLoading ? "w-1/2" : "w-full"}`}>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                  </div>
                  <h2 className="text-gray-700 font-medium mb-2">{t.emptyTitle}</h2>
                  <p className="text-gray-400 text-sm max-w-sm">{t.emptyDesc}</p>
                  <div className="grid grid-cols-2 gap-2 mt-6">
                    {suggestedQuestions[lang].map(q => (
                      <button key={q} onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                        className="text-left text-xs text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-400 hover:text-blue-600 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-w-2xl mx-auto space-y-6">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-800 text-white"}`}>
                      {msg.role === "user" ? t.you : "AI"}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-xl ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-sm"}`}>
                        {msg.content}
                      </div>
                      {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {msg.sources.map(s => (
                            <button key={s}
                              onClick={() => openPreview(s)}
                              className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 hover:bg-blue-100 hover:text-blue-600 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              {s}
                            </button>
                          ))}
                          {msg.time_taken && <span className="text-xs text-gray-400">{msg.time_taken}s</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-semibold text-white">AI</div>
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                      <div className="flex gap-1 items-center h-5">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"/>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]"/>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]"/>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
            </div>

            {/* 输入框 */}
            <div className="bg-white border-t border-gray-200 px-6 py-4 shrink-0">
              <div className="flex gap-3 items-end">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder={t.placeholder} rows={1} style={{ maxHeight: "120px" }}
                    className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none"/>
                </div>
                <button onClick={sendMessage} disabled={loading || !input.trim()}
                  className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              </div>
              <p className="text-center text-xs text-gray-400 mt-2">{t.footer}</p>
            </div>
          </div>

          {/* ── 预览面板 ── */}
          {(preview || previewLoading) && (
            <div className="w-1/2 border-l border-gray-200 bg-white flex flex-col">
              {/* 预览顶栏 */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" className="shrink-0">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span className="text-gray-700 text-sm font-medium truncate">
                    {previewLoading ? t.loadingPreview : preview?.filename}
                  </span>
                  {preview && (
                    <span className="text-gray-400 text-xs shrink-0">
                      · {preview.total_chunks} {t.chunks}
                    </span>
                  )}
                </div>
                <button onClick={() => { setPreview(null); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors ml-3 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* 预览内容 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"/>
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.15s]"/>
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.3s]"/>
                    </div>
                  </div>
                ) : preview?.chunks.map((chunk, i) => (
                  <div key={chunk.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                    {/* 块序号 */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-400 bg-gray-50 rounded-md px-2 py-0.5">
                        {t.chunkLabel(i + 1, preview.total_chunks)}
                      </span>
                      <span className="text-xs text-gray-300"># {chunk.id}</span>
                    </div>
                    {/* 文本内容 */}
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

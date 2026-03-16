"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import GraphView from "./GraphView";
import FilePreview from "./FilePreview";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  time_taken?: number;
};
type DocMeta = { filename: string; chunks: number; uploaded_at: string | null };
type PreviewDoc = { filename: string; chunks: { id: number; content: string; created_at: string }[]; total_chunks: number };
type Tab = "chat" | "graph";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [tab, setTab] = useState<Tab>("chat");
  const [uploadStatus, setUploadStatus] = useState<{ text: string; type: "success" | "error" | "loading" | "" }>({ text: "", type: "" });
  const [docCount, setDocCount] = useState<number>(0);
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [showDocs, setShowDocs] = useState(true);
  const [preview, setPreview] = useState<PreviewDoc | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 客户端挂载后才读取 localStorage，避免 hydration 不一致
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rag-chat-history");
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  // hydrated 之后才保存，避免空数组覆盖历史
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("rag-chat-history", JSON.stringify(messages));
  }, [messages, hydrated]);

  const fetchDocuments = useCallback(async () => {
    try {
      const r = await axios.get("http://localhost:8000/documents");
      setDocuments(r.data.documents);
      setDocCount(r.data.documents.reduce((s: number, d: DocMeta) => s + d.chunks, 0));
    } catch {}
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }
  }, [input]);

  async function openPreview(filename: string) {
    setPreviewFilename(filename);
    setPreviewLoading(true);
    setPreview(null);
    try {
      await axios.head(`http://localhost:8000/files/${encodeURIComponent(filename)}`);
      setPreviewLoading(false);
    } catch {
      try {
        const r = await axios.get(`http://localhost:8000/documents/${encodeURIComponent(filename)}`);
        setPreview(r.data);
        setPreviewFilename(null);
      } catch {}
      setPreviewLoading(false);
    }
  }

  async function deleteDocument(filename: string) {
    setDeletingFile(filename);
    setConfirmDelete(null);
    try {
      await axios.delete(`http://localhost:8000/documents/${encodeURIComponent(filename)}`);
      await fetchDocuments();
      if (preview?.filename === filename || previewFilename === filename) {
        setPreview(null);
        setPreviewFilename(null);
      }
    } catch {}
    setDeletingFile(null);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    setMessages(prev => [...prev, { role: "user", content: input }]);
    setInput(""); setLoading(true);
    try {
      const res = await axios.post("http://localhost:8000/ask", { question: input });
      setMessages(prev => [...prev, {
        role: "assistant",
        content: res.data.answer,
        sources: res.data.sources,
        time_taken: res.data.time_taken,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: lang === "zh" ? "连接失败，请确认后端服务正在运行。" : "Connection failed.",
      }]);
    } finally { setLoading(false); }
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus({ text: lang === "zh" ? "处理中..." : "Processing...", type: "loading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("http://localhost:8000/upload-file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { chunks_stored, graph_entities, graph_relations } = res.data;
      setUploadStatus({
        text: lang === "zh"
          ? `✓ ${file.name}：${chunks_stored} 块，${graph_entities} 实体，${graph_relations} 关系`
          : `✓ ${file.name}: ${chunks_stored} chunks, ${graph_entities} entities`,
        type: "success",
      });
      await fetchDocuments();
      setTimeout(() => setUploadStatus({ text: "", type: "" }), 4000);
    } catch {
      setUploadStatus({ text: lang === "zh" ? "上传失败" : "Upload failed", type: "error" });
    }
    e.target.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function clearHistory() {
    setMessages([]);
    if (typeof window !== "undefined") localStorage.removeItem("rag-chat-history");
  }

  const suggested = {
    zh: ["猫咪多久喂食一次？", "Python 函数怎么定义？", "如何用 Docker 部署？", "RAG 是什么？"],
    en: ["How often to feed a cat?", "How to define a Python function?", "How to deploy with Docker?", "What is RAG?"],
  };

  const t = {
    zh: {
      appName: "RAG KB", version: "v0.6.0",
      status: "在线", dbStatus: "知识库",
      docChunks: (n: number) => `${n} 个文档块`,
      uploadHint: "拖放或点击上传 .txt / .pdf",
      sidebarNote: "文档上传后自动向量化并构建知识图谱。",
      emptyTitle: "有什么想问的？",
      emptyDesc: "从左侧上传文档，然后用自然语言提问。",
      placeholder: "输入问题...", footer: "Enter 发送 · Shift+Enter 换行", you: "你",
      viewDocs: "文档列表", noDocsYet: "暂无文档", chunks: "块", hidePanel: "收起",
      preview: "预览", chunkLabel: (i: number, t: number) => `块 ${i}/${t}`,
      tabChat: "对话", tabGraph: "图谱",
      deleteConfirm: "删除？", deleteYes: "确认", deleteNo: "取消",
      deleting: "删除中...", clearHistory: "清除对话历史",
    },
    en: {
      appName: "RAG KB", version: "v0.6.0",
      status: "Online", dbStatus: "Knowledge Base",
      docChunks: (n: number) => `${n} chunks`,
      uploadHint: "Drop or click to upload .txt / .pdf",
      sidebarNote: "Documents are auto-vectorized and graph-indexed on upload.",
      emptyTitle: "What would you like to know?",
      emptyDesc: "Upload documents on the left, then ask questions.",
      placeholder: "Ask a question...", footer: "Enter to send · Shift+Enter for new line", you: "You",
      viewDocs: "Documents", noDocsYet: "No documents", chunks: "chunks", hidePanel: "Hide",
      preview: "Preview", chunkLabel: (i: number, tot: number) => `Chunk ${i}/${tot}`,
      tabChat: "Chat", tabGraph: "Graph",
      deleteConfirm: "Delete?", deleteYes: "Yes", deleteNo: "No",
      deleting: "Deleting...", clearHistory: "Clear history",
    },
  }[lang];

  const showPreviewPanel = previewFilename || preview || previewLoading;

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900">

      {/* ── 左侧边栏 ── */}
      <aside className="w-60 bg-[#18181b] flex flex-col shrink-0 border-r border-[#27272a]">
        <div className="px-4 py-5 border-b border-[#27272a]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">{t.appName}</p>
              <p className="text-[#52525b] text-xs mt-0.5">{t.version}</p>
            </div>
          </div>
        </div>

        {/* 状态 */}
        <div className="px-3 py-3 border-b border-[#27272a]">
          <div className="bg-[#27272a] rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#a1a1aa] text-xs">{t.dbStatus}</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"/>
                <span className="text-emerald-400 text-xs">{t.status}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white text-xs">{t.docChunks(docCount)}</span>
              <button onClick={() => setShowDocs(v => !v)}
                className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                  showDocs ? "bg-blue-600 text-white" : "text-[#71717a] hover:text-white hover:bg-[#3f3f46]"
                }`}>
                {showDocs ? t.hidePanel : t.viewDocs}
              </button>
            </div>
          </div>
        </div>

        {/* 文档列表 */}
        {showDocs && (
          <div className="px-3 py-3 border-b border-[#27272a] overflow-y-auto" style={{ maxHeight: "260px" }}>
            {documents.length === 0 ? (
              <p className="text-[#52525b] text-xs text-center py-4">{t.noDocsYet}</p>
            ) : (
              <div className="space-y-1.5">
                {documents.map(doc => (
                  <div key={doc.filename}
                    className="group bg-[#27272a] hover:bg-[#3f3f46] rounded-lg px-3 py-2.5 transition-colors">
                    <div className="flex items-start gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke={doc.filename.endsWith(".pdf") ? "#f87171" : "#71717a"}
                        strokeWidth="2" className="shrink-0 mt-0.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs truncate">{doc.filename}</p>
                        <p className="text-[#71717a] text-xs mt-0.5">{doc.chunks} {t.chunks}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openPreview(doc.filename)}
                        className="flex-1 text-xs text-blue-400 hover:text-blue-300 bg-[#1c1c1e] rounded-md py-1 transition-colors text-center">
                        {t.preview}
                      </button>
                      {confirmDelete === doc.filename ? (
                        <div className="flex gap-1 flex-1">
                          <button onClick={() => deleteDocument(doc.filename)}
                            disabled={deletingFile === doc.filename}
                            className="flex-1 text-xs text-red-400 bg-red-950 rounded-md py-1 transition-colors text-center disabled:opacity-50">
                            {deletingFile === doc.filename ? t.deleting : t.deleteYes}
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="flex-1 text-xs text-[#71717a] hover:text-white bg-[#1c1c1e] rounded-md py-1 transition-colors text-center">
                            {t.deleteNo}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(doc.filename)}
                          className="flex-1 text-xs text-[#71717a] hover:text-red-400 bg-[#1c1c1e] rounded-md py-1 transition-colors text-center">
                          {t.deleteConfirm}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 上传 */}
        <div className="px-3 py-3 border-b border-[#27272a]">
          <label className="flex flex-col items-center gap-2 cursor-pointer border border-dashed border-[#3f3f46] hover:border-blue-500 rounded-xl p-4 transition-colors group">
            <div className="w-8 h-8 bg-[#27272a] group-hover:bg-blue-950 rounded-lg flex items-center justify-center transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className="text-[#71717a] group-hover:text-blue-400 transition-colors">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <span className="text-[#71717a] text-xs group-hover:text-blue-400 transition-colors text-center leading-relaxed">
              {t.uploadHint}
            </span>
            <input type="file" accept=".txt,.pdf" onChange={uploadFile} className="hidden"/>
          </label>
          {uploadStatus.text && (
            <div className={`mt-2 text-xs rounded-lg px-3 py-2 leading-relaxed ${
              uploadStatus.type === "success" ? "bg-emerald-950 text-emerald-400 border border-emerald-900" :
              uploadStatus.type === "error"   ? "bg-red-950 text-red-400 border border-red-900" :
              "bg-blue-950 text-blue-400 border border-blue-900"
            }`}>
              {uploadStatus.type === "loading" && (
                <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse mr-1.5"/>
              )}
              {uploadStatus.text}
            </div>
          )}
        </div>

        <div className="px-4 py-4 mt-auto">
          <p className="text-[#52525b] text-xs leading-relaxed">{t.sidebarNote}</p>
        </div>
      </aside>

      {/* ── 主区域 ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-200 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["chat", "graph"] as Tab[]).map(tabId => (
              <button key={tabId} onClick={() => setTab(tabId)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  tab === tabId ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {tabId === "chat"
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/>
                      <line x1="7" y1="12" x2="17" y2="6"/><line x1="7" y1="12" x2="17" y2="18"/>
                    </svg>
                }
                {tabId === "chat" ? t.tabChat : t.tabGraph}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {tab === "chat" && messages.length > 0 && (
              <button onClick={clearHistory} title={t.clearHistory}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {(["zh", "en"] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    lang === l ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  }`}>
                  {l === "zh" ? "中文" : "EN"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"/>
              {t.status}
            </div>
          </div>
        </header>

        {tab === "graph" && (
          <div className="flex-1 overflow-hidden"><GraphView lang={lang}/></div>
        )}

        {tab === "chat" && (
          <div className="flex-1 flex overflow-hidden">
            <div className={`flex flex-col overflow-hidden transition-all duration-300 ${showPreviewPanel ? "w-1/2" : "w-full"}`}>
              <div className="flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>
                    <h2 className="text-gray-800 font-semibold text-lg mb-2">{t.emptyTitle}</h2>
                    <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-8">{t.emptyDesc}</p>
                    <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                      {suggested[lang].map(q => (
                        <button key={q} onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                          className="text-left text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all leading-snug shadow-sm">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                          msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-900 text-white"
                        }`}>
                          {msg.role === "user" ? t.you.charAt(0) : "AI"}
                        </div>
                        <div className={`flex flex-col gap-2 max-w-xl ${msg.role === "user" ? "items-end" : "items-start"}`}>
                          <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-blue-600 text-white rounded-tr-sm"
                              : "bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-sm"
                          }`}>
                            {msg.content}
                          </div>
                          {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {msg.sources.map(s => (
                                <button key={s} onClick={() => openPreview(s)}
                                  className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2.5 py-1 hover:bg-blue-100 hover:text-blue-600 transition-colors">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  {s}
                                </button>
                              ))}
                              {msg.time_taken && <span className="text-xs text-gray-300">{msg.time_taken}s</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loading && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-900 shrink-0 flex items-center justify-center text-xs font-bold text-white">AI</div>
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
                )}
              </div>

              <div className="bg-white border-t border-gray-100 px-6 py-4 shrink-0">
                <div className="max-w-2xl mx-auto flex gap-3 items-end">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 transition-all">
                    <textarea ref={textareaRef} value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t.placeholder} rows={1}
                      className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none"/>
                  </div>
                  <button onClick={sendMessage} disabled={loading || !input.trim()}
                    className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                    </svg>
                  </button>
                </div>
                <p className="text-center text-xs text-gray-300 mt-2">{t.footer}</p>
              </div>
            </div>

            {/* 预览面板 */}
            {showPreviewPanel && (
              <div className="w-1/2 border-l border-gray-200 bg-white flex flex-col">
                {previewLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"/>
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.15s]"/>
                      <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.3s]"/>
                    </div>
                  </div>
                ) : previewFilename ? (
                  <FilePreview filename={previewFilename} lang={lang} onClose={() => setPreviewFilename(null)}/>
                ) : preview ? (
                  <>
                    <div className="h-14 px-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="shrink-0">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span className="text-gray-700 text-sm font-medium truncate">{preview.filename}</span>
                        <span className="text-gray-400 text-xs shrink-0">· {preview.total_chunks} {t.chunks}</span>
                      </div>
                      <button onClick={() => setPreview(null)}
                        className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors ml-3 shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                      {preview.chunks.map((chunk, i) => (
                        <div key={chunk.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all">
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-xs font-medium text-gray-400 bg-gray-50 rounded-md px-2 py-0.5 border border-gray-100">
                              {t.chunkLabel(i + 1, preview.total_chunks)}
                            </span>
                            <span className="text-xs text-gray-200">#{chunk.id}</span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
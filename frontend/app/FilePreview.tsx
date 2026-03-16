"use client";

interface Props {
  filename: string;
  lang: "zh" | "en";
  onClose: () => void;
}

export default function FilePreview({ filename, lang, onClose }: Props) {
  const fileUrl = `http://localhost:8000/files/${encodeURIComponent(filename)}`;
  const isPdf = filename.endsWith(".pdf");

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="h-14 px-5 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={isPdf ? "#ef4444" : "#9ca3af"} strokeWidth="2" className="shrink-0">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="text-gray-700 text-sm font-medium truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors px-2 py-1 rounded-md hover:bg-gray-100">
            {lang === "zh" ? "新标签打开" : "Open in tab"}
          </a>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* iframe 渲染 PDF 或 TXT */}
      <iframe
        src={fileUrl}
        className="flex-1 w-full border-0"
        title={filename}
      />
    </div>
  );
}
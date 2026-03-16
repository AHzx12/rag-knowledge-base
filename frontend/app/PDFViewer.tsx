"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  filename: string;
  lang: "zh" | "en";
  onClose: () => void;
}

export default function PDFViewer({ filename, lang, onClose }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState(false);

  const isPdf = filename.endsWith(".pdf");
  const fileUrl = `http://localhost:8000/files/${encodeURIComponent(filename)}`;

  const t = {
    zh: { page: "页", of: "共", prev: "上一页", next: "下一页", error: "无法加载原始文件" },
    en: { page: "Page", of: "of", prev: "Prev", next: "Next", error: "Cannot load file" },
  }[lang];

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
          {numPages > 0 && (
            <span className="text-gray-400 text-xs shrink-0">· {numPages} {t.page}</span>
          )}
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors ml-3 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto bg-gray-100 flex flex-col items-center py-4">
        {!isPdf ? (
          <iframe src={fileUrl} className="w-full h-full border-0" title={filename}/>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {t.error}
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setError(true)}
            loading={
              <div className="flex items-center justify-center h-32">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"/>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.15s]"/>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.3s]"/>
                </div>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={420}
              renderTextLayer={true}
              renderAnnotationLayer={false}
              className="shadow-md"
            />
          </Document>
        )}
      </div>

      {/* 翻页 */}
      {numPages > 1 && (
        <div className="h-12 border-t border-gray-100 flex items-center justify-center gap-4 bg-white shrink-0">
          <button onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-3 py-1 rounded-md hover:bg-gray-100 transition-colors">
            {t.prev}
          </button>
          <span className="text-xs text-gray-500">
            {t.page} {pageNumber} {t.of} {numPages}
          </span>
          <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-3 py-1 rounded-md hover:bg-gray-100 transition-colors">
            {t.next}
          </button>
        </div>
      )}
    </div>
  );
}

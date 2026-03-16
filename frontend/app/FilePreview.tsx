"use client";

import dynamic from "next/dynamic";

// 用 dynamic import + ssr:false，确保 pdfjs 只在浏览器里运行
const PDFViewer = dynamic(() => import("./PDFViewer"), { 
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"/>
        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.15s]"/>
        <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0.3s]"/>
      </div>
    </div>
  )
});

interface Props {
  filename: string;
  lang: "zh" | "en";
  onClose: () => void;
}

export default function FilePreview({ filename, lang, onClose }: Props) {
  return <PDFViewer filename={filename} lang={lang} onClose={onClose} />;
}
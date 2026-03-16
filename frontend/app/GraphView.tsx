"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import axios from "axios";

type GraphNode = { id: string; label: string; x?: number; y?: number; fx?: number | null; fy?: number | null };
type Edge = { source: string; relation: string; target: string };
type GraphData = { nodes: GraphNode[]; edges: Edge[] };

interface Props { lang: "zh" | "en" }

export default function GraphView({ lang }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [query, setQuery] = useState("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "empty" | "error" | "ok">("idle");
  const [history, setHistory] = useState<string[]>([]);

  const t = {
    zh: {
      title: "知识图谱", placeholder: "输入实体名称，例如：Python",
      search: "查询", loading: "查询中...",
      idle: "输入实体名称，探索知识库中的关联关系",
      empty: "未找到相关实体，请尝试其他关键词",
      nodes: "个节点", edges: "条关系",
      hint: "点击节点展开 · 拖拽移动 · 滚轮缩放",
      history: "最近查询",
    },
    en: {
      title: "Knowledge Graph", placeholder: "Enter entity, e.g. Python",
      search: "Search", loading: "Loading...",
      idle: "Enter an entity name to explore connections in the knowledge graph",
      empty: "No results found, try a different keyword",
      nodes: "nodes", edges: "relations",
      hint: "Click to expand · Drag to move · Scroll to zoom",
      history: "Recent",
    },
  }[lang];

  const fetchGraph = useCallback(async (entity: string) => {
    if (!entity.trim()) return;
    setLoading(true);
    setGraphData(null);
    setStatus("idle");
    try {
      const res = await axios.get(`http://localhost:8000/graph/${encodeURIComponent(entity.trim())}`);
      if (!res.data.nodes || res.data.nodes.length === 0) {
        setStatus("empty");
      } else {
        setGraphData({ nodes: res.data.nodes, edges: res.data.edges });
        setStatus("ok");
        setHistory(prev => {
          const next = [entity.trim(), ...prev.filter(h => h !== entity.trim())].slice(0, 6);
          return next;
        });
      }
    } catch {
      setStatus("error");
    }
    setLoading(false);
  }, []);

  // D3 渲染
  useEffect(() => {
    if (!graphData || status !== "ok" || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const rect = svgRef.current.getBoundingClientRect();
    const width = rect.width || 700;
    const height = rect.height || 500;
    const g = svg.append("g");

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", e => g.attr("transform", e.transform))
    );

    svg.append("defs").append("marker")
      .attr("id", "arrow").attr("viewBox", "0 -5 10 10")
      .attr("refX", 24).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#cbd5e1");

    const nodes: GraphNode[] = graphData.nodes.map(n => ({ ...n }));
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const links = graphData.edges.map(e => ({
      source: nodeMap.get(e.source) ?? e.source,
      target: nodeMap.get(e.target) ?? e.target,
      relation: e.relation,
    }));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: unknown) => (d as GraphNode).id).distance(130))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(55));

    // 边
    const link = g.append("g").selectAll("line")
      .data(links).enter().append("line")
      .attr("stroke", "#e2e8f0").attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // 边标签背景
    const linkLabelBg = g.append("g").selectAll("rect")
      .data(links).enter().append("rect")
      .attr("fill", "white").attr("rx", 4)
      .attr("width", 0).attr("height", 16);

    // 边标签
    const linkLabel = g.append("g").selectAll("text")
      .data(links).enter().append("text")
      .text(d => d.relation)
      .attr("font-size", "10px").attr("fill", "#94a3b8")
      .attr("text-anchor", "middle").attr("dominant-baseline", "central");

    // 节点组
    const node = g.append("g").selectAll("g")
      .data(nodes).enter().append("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (_e, d) => { setQuery(d.id); fetchGraph(d.id); });

    // 节点外圈（hover 光晕）
    node.append("circle")
      .attr("r", d => d.id === query.trim() ? 34 : 28)
      .attr("fill", d => d.id === query.trim() ? "#dbeafe" : "#f8fafc")
      .attr("stroke", "none");

    // 节点主圆
    node.append("circle")
      .attr("r", d => d.id === query.trim() ? 26 : 22)
      .attr("fill", d => d.id === query.trim() ? "#3b82f6" : "white")
      .attr("stroke", d => d.id === query.trim() ? "#2563eb" : "#e2e8f0")
      .attr("stroke-width", 1.5);

    // 节点文字
    node.append("text")
      .text(d => d.label.length > 7 ? d.label.slice(0, 7) + "…" : d.label)
      .attr("font-size", "11px").attr("font-weight", "500")
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("fill", d => d.id === query.trim() ? "white" : "#374151")
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as GraphNode).x ?? 0)
        .attr("y1", d => (d.source as GraphNode).y ?? 0)
        .attr("x2", d => (d.target as GraphNode).x ?? 0)
        .attr("y2", d => (d.target as GraphNode).y ?? 0);

      const midX = (d: typeof links[0]) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2;
      const midY = (d: typeof links[0]) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2;

      linkLabel.attr("x", midX).attr("y", midY);
      linkLabelBg
        .attr("x", d => midX(d) - (d.relation.length * 3.2))
        .attr("y", d => midY(d) - 8)
        .attr("width", d => d.relation.length * 6.4);

      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [graphData, query, status, fetchGraph]);

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="px-6 py-4 bg-white border-b border-gray-100 shrink-0">
        <div className="flex gap-2 mb-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fetchGraph(query)}
              placeholder={t.placeholder}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"/>
          </div>
          <button onClick={() => fetchGraph(query)} disabled={loading || !query.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            {loading ? t.loading : t.search}
          </button>
        </div>

        {/* 最近查询 */}
        {history.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">{t.history}：</span>
            {history.map(h => (
              <button key={h} onClick={() => { setQuery(h); fetchGraph(h); }}
                className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                {h}
              </button>
            ))}
          </div>
        )}

        {/* 统计 */}
        {status === "ok" && graphData && (
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-blue-500 rounded-full"/>
              <span className="text-xs text-gray-500">{graphData.nodes.length} {t.nodes}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-gray-300 rounded-full"/>
              <span className="text-xs text-gray-500">{graphData.edges.length} {t.edges}</span>
            </div>
            <span className="text-xs text-gray-400 ml-auto">{t.hint}</span>
          </div>
        )}
      </div>

      {/* 画布区 */}
      <div className="flex-1 relative bg-[#fafafa] overflow-hidden">
        {/* 背景网格 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)"/>
        </svg>

        {/* 空状态 */}
        {status === "idle" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-2xl border border-gray-200 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                  <circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/>
                  <line x1="7.5" y1="12" x2="16.5" y2="6.5"/><line x1="7.5" y1="12" x2="16.5" y2="17.5"/>
                </svg>
              </div>
              <p className="text-gray-400 text-sm max-w-xs leading-relaxed">{t.idle}</p>
            </div>
          </div>
        )}

        {/* 空结果 */}
        {status === "empty" && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-2xl border border-gray-200 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="8" y1="11" x2="14" y2="11" stroke="#e5e7eb"/>
                </svg>
              </div>
              <p className="text-gray-400 text-sm">{t.empty}</p>
            </div>
          </div>
        )}

        {/* 加载 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce"/>
              <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.15s]"/>
              <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.3s]"/>
            </div>
          </div>
        )}

        <svg ref={svgRef} width="100%" height="100%"
          style={{ display: status === "ok" && !loading ? "block" : "none" }}/>
      </div>
    </div>
  );
}
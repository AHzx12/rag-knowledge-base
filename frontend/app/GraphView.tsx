"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import axios from "axios";

type Node = { id: string; label: string; x?: number; y?: number; fx?: number | null; fy?: number | null };
type Edge = { source: string; relation: string; target: string };
type GraphData = { nodes: Node[]; edges: Edge[] };

interface Props {
  lang: "zh" | "en";
}

export default function GraphView({ lang }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [query, setQuery] = useState("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const t = {
    zh: {
      title: "知识图谱",
      placeholder: "输入实体名称，例如：Python",
      search: "查询",
      loading: "查询中...",
      empty: "输入实体名称查看其在知识图谱中的关联关系",
      noResult: "未找到相关实体，请尝试其他关键词",
      nodes: "个节点",
      edges: "条关系",
      clickHint: "点击节点展开查询",
    },
    en: {
      title: "Knowledge Graph",
      placeholder: "Enter entity name, e.g. Python",
      search: "Search",
      loading: "Loading...",
      empty: "Enter an entity name to explore its connections in the knowledge graph",
      noResult: "No results found, try a different keyword",
      nodes: "nodes",
      edges: "relations",
      clickHint: "Click a node to expand",
    },
  }[lang];

  async function fetchGraph(entity: string) {
    if (!entity.trim()) return;
    setLoading(true);
    setError("");
    setGraphData(null);
    try {
      const res = await axios.get(
        `http://localhost:8000/graph/${encodeURIComponent(entity)}`
      );
      if (res.data.nodes.length === 0) {
        setError(t.noResult);
      } else {
        setGraphData({ nodes: res.data.nodes, edges: res.data.edges });
      }
    } catch {
      setError(t.noResult);
    }
    setLoading(false);
  }

  // D3 渲染
  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 400;

    const g = svg.append("g");

    // 缩放平移
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // 箭头 marker
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#94a3b8");

    // 构造 D3 nodes/links（需要对象引用）
    const nodes: Node[] = graphData.nodes.map(n => ({ ...n }));
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const links = graphData.edges.map(e => ({
      source: nodeMap.get(e.source) || e.source,
      target: nodeMap.get(e.target) || e.target,
      relation: e.relation,
    }));

    // 力导向模拟
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: unknown) => (d as Node).id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(50));

    // 边
    const link = g.append("g").selectAll("line")
      .data(links).enter().append("line")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // 边标签
    const linkLabel = g.append("g").selectAll("text")
      .data(links).enter().append("text")
      .text(d => d.relation)
      .attr("font-size", "10px")
      .attr("fill", "#94a3b8")
      .attr("text-anchor", "middle");

    // 节点组
    const node = g.append("g").selectAll("g")
      .data(nodes).enter().append("g")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      )
      .on("click", (_event, d) => {
        setSelectedNode(d.id);
        setQuery(d.id);
        fetchGraph(d.id);
      });

    // 节点圆
    node.append("circle")
      .attr("r", d => d.id === query ? 28 : 22)
      .attr("fill", d => d.id === query ? "#3b82f6" : "#f8fafc")
      .attr("stroke", d => d.id === query ? "#2563eb" : "#cbd5e1")
      .attr("stroke-width", 2);

    // 节点文字
    node.append("text")
      .text(d => d.label.length > 8 ? d.label.slice(0, 8) + "…" : d.label)
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", d => d.id === query ? "white" : "#374151");

    // tick 更新位置
    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as Node).x ?? 0)
        .attr("y1", d => (d.source as Node).y ?? 0)
        .attr("x2", d => (d.target as Node).x ?? 0)
        .attr("y2", d => (d.target as Node).y ?? 0);

      linkLabel
        .attr("x", d => (((d.source as Node).x ?? 0) + ((d.target as Node).x ?? 0)) / 2)
        .attr("y", d => (((d.source as Node).y ?? 0) + ((d.target as Node).y ?? 0)) / 2);

      node.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { simulation.stop(); };
  }, [graphData, query]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶栏 */}
      <div className="px-5 py-4 border-b border-gray-100 shrink-0">
        <h2 className="text-gray-700 font-medium text-sm mb-3">{t.title}</h2>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchGraph(query)}
            placeholder={t.placeholder}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
          <button
            onClick={() => fetchGraph(query)}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {loading ? t.loading : t.search}
          </button>
        </div>

        {/* 统计 */}
        {graphData && !loading && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-gray-400">
              {graphData.nodes.length} {t.nodes} · {graphData.edges.length} {t.edges}
            </span>
            <span className="text-xs text-blue-400">{t.clickHint}</span>
          </div>
        )}
      </div>

      {/* 图谱画布 */}
      <div className="flex-1 relative overflow-hidden">
        {!graphData && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <circle cx="5" cy="12" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="19" cy="19" r="3"/>
                <line x1="8" y1="12" x2="16" y2="7"/><line x1="8" y1="12" x2="16" y2="17"/>
              </svg>
              <p className="text-gray-400 text-sm max-w-xs">{t.empty}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"/>
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.15s]"/>
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.3s]"/>
            </div>
          </div>
        )}

        <svg ref={svgRef} width="100%" height="100%"/>
      </div>

      {/* 选中节点提示 */}
      {selectedNode && (
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 bg-gray-50">
          <p className="text-xs text-gray-500">
            已选中：<span className="font-medium text-blue-600">{selectedNode}</span>
            <span className="ml-2 text-gray-400">· 图谱已更新为该节点的关联关系</span>
          </p>
        </div>
      )}
    </div>
  );
}

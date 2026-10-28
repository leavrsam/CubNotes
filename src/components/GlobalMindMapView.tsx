"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  ArrowLeft, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Layers, 
  Hash, 
  FileText, 
  ExternalLink, 
  Sparkles, 
  Filter, 
  MapPin, 
  Mic, 
  Type, 
  X,
  Play,
  Pause,
  SlidersHorizontal,
  ChevronRight,
  Flame,
  Globe2,
  FolderOpen,
  Brain,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { Notebook } from "@/hooks/useNotebooks";
import { getCachedPageState } from "@/lib/offlineStore";
import { 
  TaggedItem, 
  TagDefinition, 
  normalizeTagId, 
  formatTagName, 
  getTagColor, 
  extractInlineHashtags, 
  loadTagRegistry 
} from "@/lib/tags";

interface GlobalMindMapViewProps {
  notebooks: Notebook[];
  onSelectPage: (pageId: string) => void;
  onJumpToCoordinates?: (pageId: string, x: number, y: number) => void;
  onClose: () => void;
  onOpenTagHub?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export type MindMapNodeType = 'tag' | 'page' | 'block' | 'notebook-hub';

export interface GraphNode {
  id: string;
  type: MindMapNodeType;
  label: string;
  sublabel?: string;
  color: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pageId?: string;
  notebookTitle?: string;
  sectionTitle?: string;
  itemCount?: number;
  tags?: string[];
  blockType?: 'text' | 'audio' | 'pin';
  jumpCoordinates?: { x: number; y: number };
  isFixed?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  color?: string;
  weight?: number;
  isNotebookLink?: boolean;
}

// Curated distinctive color palette for notebook galaxies
const NOTEBOOK_COLORS = [
  '#6366f1', // Indigo (Motif / Core)
  '#10b981', // Emerald (Fledge)
  '#f59e0b', // Amber (Caliber)
  '#ec4899', // Pink (Journal / Personal)
  '#06b6d4', // Cyan (Work)
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#ef4444', // Rose
];

export function getNotebookColor(notebookTitle: string = ""): string {
  if (!notebookTitle) return NOTEBOOK_COLORS[0];
  let hash = 0;
  for (let i = 0; i < notebookTitle.length; i++) {
    hash = (hash << 5) - hash + notebookTitle.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % NOTEBOOK_COLORS.length;
  return NOTEBOOK_COLORS[idx];
}

export function GlobalMindMapView({
  notebooks,
  onSelectPage,
  onJumpToCoordinates,
  onClose,
  onOpenTagHub,
  onToggleSidebar,
  isSidebarOpen
}: GlobalMindMapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Graph state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showBlocks, setShowBlocks] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>('all');
  const [groupByNotebook, setGroupByNotebook] = useState<boolean>(true);
  const [showOrphansOnly, setShowOrphansOnly] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  // Obsidian-Style Physics Parameters
  const [repulsionStrength, setRepulsionStrength] = useState<number>(1400);
  const [centerGravity, setCenterGravity] = useState<number>(0.012);
  const [linkDistance, setLinkDistance] = useState<number>(120);
  const [isSimulating, setIsSimulating] = useState(true);

  // Simulation alpha (energy decay parameter)
  const alphaRef = useRef<number>(1.0);

  // Interaction state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Viewport Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDraggingCanvasRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const lastClickTimeRef = useRef<number>(0);

  // Notebook Cluster Centers for Constellation Mode
  const notebookCenters = useMemo(() => {
    const centers = new Map<string, { x: number; y: number; color: string }>();
    const total = Math.max(1, notebooks.length);
    const radius = Math.max(220, total * 65);

    notebooks.forEach((nb, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      centers.set(nb.title, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        color: getNotebookColor(nb.title)
      });
    });
    return centers;
  }, [notebooks]);

  // 1. Scan notebooks & cached document states to build the Knowledge Graph
  useEffect(() => {
    let isMounted = true;

    async function buildKnowledgeGraph() {
      setIsLoading(true);
      const registry = loadTagRegistry();

      const rawNodes: GraphNode[] = [];
      const rawEdges: GraphEdge[] = [];
      const tagCounts: Map<string, number> = new Map();
      const pageTagMap: Map<string, Set<string>> = new Map();

      // Collect all tags and pages
      for (const nb of notebooks) {
        const nbColor = getNotebookColor(nb.title);
        const center = notebookCenters.get(nb.title) || { x: 0, y: 0, color: nbColor };

        for (const sec of nb.sections || []) {
          for (const page of sec.pages || []) {
            const pageTagsSet = new Set<string>();

            try {
              const state: any = await getCachedPageState(page.id);
              
              // Page-level tags
              if (Array.isArray(state?.pageTags)) {
                for (const t of state.pageTags) {
                  const norm = normalizeTagId(t);
                  if (norm) {
                    pageTagsSet.add(norm);
                    tagCounts.set(norm, (tagCounts.get(norm) || 0) + 1);
                  }
                }
              }

              // Text blocks (explicit tags + hashtags)
              const textList = Array.isArray(state?.texts) ? state.texts : (Array.isArray(state?.textBlocks) ? state.textBlocks : []);
              for (const b of textList) {
                const bTags = new Set<string>();
                if (Array.isArray(b.tags)) {
                  for (const t of b.tags) {
                    const norm = normalizeTagId(t);
                    if (norm) bTags.add(norm);
                  }
                }
                const hashtags = extractInlineHashtags(b.content || "");
                for (const t of hashtags) {
                  bTags.add(t);
                }

                if (bTags.size > 0) {
                  bTags.forEach(t => {
                    pageTagsSet.add(t);
                    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                  });

                  const preview = (b.content || "").replace(/<[^>]*>/g, '').trim().slice(0, 36) || "Text Block";
                  const blockNodeId = `block-${page.id}-${b.id}`;
                  rawNodes.push({
                    id: blockNodeId,
                    type: 'block',
                    blockType: 'text',
                    label: preview,
                    sublabel: page.title || "Untitled",
                    color: '#a855f7',
                    radius: 10,
                    x: center.x + (Math.random() - 0.5) * 80,
                    y: center.y + (Math.random() - 0.5) * 80,
                    vx: 0,
                    vy: 0,
                    pageId: page.id,
                    notebookTitle: nb.title,
                    sectionTitle: sec.title,
                    jumpCoordinates: { x: b.x || 0, y: b.y || 0 },
                    tags: Array.from(bTags)
                  });

                  rawEdges.push({
                    id: `edge-${page.id}-${blockNodeId}`,
                    source: `page-${page.id}`,
                    target: blockNodeId,
                    color: '#64748b',
                    weight: 0.6
                  });
                }
              }

              // Audio cards
              const audioList = Array.isArray(state?.audios) ? state.audios : [];
              for (const a of audioList) {
                const aTags: string[] = Array.isArray(a.tags) 
                  ? a.tags.map((t: any) => normalizeTagId(String(t))).filter((t: string): t is string => Boolean(t)) 
                  : [];
                if (aTags.length > 0) {
                  aTags.forEach((t: string) => {
                    pageTagsSet.add(t);
                    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                  });

                  const audioNodeId = `audio-${page.id}-${a.id}`;
                  rawNodes.push({
                    id: audioNodeId,
                    type: 'block',
                    blockType: 'audio',
                    label: a.title || "Voice Note",
                    sublabel: page.title || "Untitled",
                    color: '#ec4899',
                    radius: 11,
                    x: center.x + (Math.random() - 0.5) * 80,
                    y: center.y + (Math.random() - 0.5) * 80,
                    vx: 0,
                    vy: 0,
                    pageId: page.id,
                    notebookTitle: nb.title,
                    sectionTitle: sec.title,
                    jumpCoordinates: { x: a.x || 0, y: a.y || 0 },
                    tags: aTags
                  });

                  rawEdges.push({
                    id: `edge-${page.id}-${audioNodeId}`,
                    source: `page-${page.id}`,
                    target: audioNodeId,
                    color: '#64748b',
                    weight: 0.6
                  });
                }
              }

              // Canvas Tag Pins
              const pinList = Array.isArray(state?.tagPins) ? state.tagPins : [];
              for (const pin of pinList) {
                const pTags: string[] = Array.isArray(pin.tags) 
                  ? pin.tags.map((t: any) => normalizeTagId(String(t))).filter((t: string): t is string => Boolean(t)) 
                  : [];
                if (pTags.length > 0) {
                  pTags.forEach((t: string) => {
                    pageTagsSet.add(t);
                    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                  });

                  const pinNodeId = `pin-${page.id}-${pin.id}`;
                  rawNodes.push({
                    id: pinNodeId,
                    type: 'block',
                    blockType: 'pin',
                    label: pin.label || `#${pTags[0]}`,
                    sublabel: page.title || "Untitled",
                    color: '#10b981',
                    radius: 11,
                    x: center.x + (Math.random() - 0.5) * 80,
                    y: center.y + (Math.random() - 0.5) * 80,
                    vx: 0,
                    vy: 0,
                    pageId: page.id,
                    notebookTitle: nb.title,
                    sectionTitle: sec.title,
                    jumpCoordinates: { x: pin.x || 0, y: pin.y || 0 },
                    tags: pTags
                  });

                  rawEdges.push({
                    id: `edge-${page.id}-${pinNodeId}`,
                    source: `page-${page.id}`,
                    target: pinNodeId,
                    color: '#64748b',
                    weight: 0.6
                  });
                }
              }

            } catch (err) {
              console.warn("Failed reading cached state for page:", page.id, err);
            }

            pageTagMap.set(page.id, pageTagsSet);

            // Add Page Node with notebook-specific galaxy color
            const pageInitialX = center.x + (Math.random() - 0.5) * 110;
            const pageInitialY = center.y + (Math.random() - 0.5) * 110;

            rawNodes.push({
              id: `page-${page.id}`,
              type: 'page',
              label: page.title || "Untitled Note",
              sublabel: `${nb.title} › ${sec.title}`,
              color: nbColor,
              radius: 16,
              x: pageInitialX,
              y: pageInitialY,
              vx: 0,
              vy: 0,
              pageId: page.id,
              notebookTitle: nb.title,
              sectionTitle: sec.title,
              tags: Array.from(pageTagsSet)
            });
          }
        }
      }

      // Add Tag Nodes (Shared conceptual hubs)
      for (const [tagId, count] of tagCounts.entries()) {
        const tagTheme = getTagColor(tagId, registry);
        rawNodes.push({
          id: `tag-${tagId}`,
          type: 'tag',
          label: `#${formatTagName(tagId)}`,
          color: tagTheme.color,
          radius: Math.min(32, Math.max(18, 16 + count * 3)),
          x: (Math.random() - 0.5) * 160,
          y: (Math.random() - 0.5) * 160,
          vx: 0,
          vy: 0,
          itemCount: count
        });
      }

      // Create Edges: Page <-> Tag (bridges across notebooks)
      for (const [pageId, tags] of pageTagMap.entries()) {
        for (const tagId of tags) {
          rawEdges.push({
            id: `edge-tag-${tagId}-page-${pageId}`,
            source: `tag-${tagId}`,
            target: `page-${pageId}`,
            color: getTagColor(tagId, registry).color,
            weight: 1.5
          });
        }
      }

      if (isMounted) {
        setNodes(rawNodes);
        setEdges(rawEdges);
        setIsLoading(false);
        // Start simulation with fresh alpha energy
        alphaRef.current = 1.0;
        setIsSimulating(true);
      }
    }

    buildKnowledgeGraph();

    return () => {
      isMounted = false;
    };
  }, [notebooks, notebookCenters]);

  // 2. Filter active nodes & edges based on search, notebook, and showBlocks
  const { filteredNodes, filteredEdges, connectedNodeIds, degreeMap } = useMemo(() => {
    // Degree map to calculate how connected each node is
    const degMap = new Map<string, number>();
    edges.forEach(e => {
      degMap.set(e.source, (degMap.get(e.source) || 0) + 1);
      degMap.set(e.target, (degMap.get(e.target) || 0) + 1);
    });

    let activeNodes = nodes.filter(n => {
      if (!showBlocks && n.type === 'block') return false;
      if (selectedNotebookId !== 'all') {
        if (n.type === 'page' && n.notebookTitle !== selectedNotebookId) return false;
        if (n.type === 'block' && n.notebookTitle !== selectedNotebookId) return false;
      }
      if (showOrphansOnly) {
        // Orphan = degree 0 (no tags or connected items)
        const deg = degMap.get(n.id) || 0;
        if (deg > 0) return false;
      }
      return true;
    });

    const activeNodeMap = new Map<string, GraphNode>();
    activeNodes.forEach(n => activeNodeMap.set(n.id, n));

    const activeEdges = edges.filter(e => activeNodeMap.has(e.source) && activeNodeMap.has(e.target));

    // Calculate neighborhood highlights for hovered or selected node
    const focusId = selectedNodeId || hoveredNodeId;
    const connected = new Set<string>();
    if (focusId) {
      connected.add(focusId);
      activeEdges.forEach(e => {
        if (e.source === focusId) connected.add(e.target);
        if (e.target === focusId) connected.add(e.source);
      });
    }

    return {
      filteredNodes: activeNodes,
      filteredEdges: activeEdges,
      connectedNodeIds: connected,
      degreeMap: degMap
    };
  }, [nodes, edges, showBlocks, selectedNotebookId, selectedNodeId, hoveredNodeId, showOrphansOnly]);

  // Reignite simulation (re-heat)
  const reheatSimulation = useCallback(() => {
    alphaRef.current = 1.0;
    setIsSimulating(true);
  }, []);

  // 3. Smooth Damped Force Physics Simulation (d3-force style with Alpha Energy Decay)
  useEffect(() => {
    if (!isSimulating || filteredNodes.length === 0) return;

    let animId: number;
    const activeNodes = filteredNodes;
    const activeEdges = filteredEdges;
    const nodeMap = new Map<string, GraphNode>();
    activeNodes.forEach(n => nodeMap.set(n.id, n));

    const step = () => {
      let alpha = alphaRef.current;

      // Stop condition: when energy decays past threshold, lock completely still
      if (alpha < 0.006 && !draggedNodeRef.current) {
        setIsSimulating(false);
        return;
      }

      // 1. Notebook Galaxy Pull (Constellation mode)
      if (groupByNotebook) {
        for (const node of activeNodes) {
          if (node.isFixed) continue;
          if (node.type === 'page' && node.notebookTitle) {
            const center = notebookCenters.get(node.notebookTitle);
            if (center) {
              const cdx = center.x - node.x;
              const cdy = center.y - node.y;
              node.vx += cdx * 0.04 * alpha;
              node.vy += cdy * 0.04 * alpha;
            }
          }
        }
      }

      // 2. Anti-Collision & Node Repulsion
      for (let i = 0; i < activeNodes.length; i++) {
        const n1 = activeNodes[i];
        for (let j = i + 1; j < activeNodes.length; j++) {
          const n2 = activeNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 0.1;
          const dist = Math.sqrt(distSq);

          // Direct collision boundary (radius + label safety margin)
          const minDist = n1.radius + n2.radius + 36;
          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap * 0.45 * alpha;
            if (!n1.isFixed) {
              n1.x -= nx * push;
              n1.y -= ny * push;
            }
            if (!n2.isFixed) {
              n2.x += nx * push;
              n2.y += ny * push;
            }
          }

          // Smooth inverse-square repulsion
          const k = (n1.type === 'tag' || n2.type === 'tag') ? repulsionStrength * 1.5 : repulsionStrength;
          const repForce = (k / distSq) * alpha;
          const fx = (dx / dist) * repForce;
          const fy = (dy / dist) * repForce;

          if (!n1.isFixed) {
            n1.vx -= fx;
            n1.vy -= fy;
          }
          if (!n2.isFixed) {
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // 3. Spring Attraction along Edges
      for (const edge of activeEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const idealDist = (source.type === 'tag' && target.type === 'page') ? linkDistance : linkDistance * 0.65;
        const displacement = dist - idealDist;
        const springK = 0.045 * (edge.weight || 1);

        const fx = (dx / dist) * displacement * springK * alpha;
        const fy = (dy / dist) * displacement * springK * alpha;

        if (!source.isFixed) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.isFixed) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // 4. Center Gravity, Friction Damping & Velocity Cutoff
      const damping = 0.74; // High friction so nodes settle fast without wobbling

      for (const node of activeNodes) {
        if (node.isFixed) continue;

        // Gentle global center gravity
        node.vx += -node.x * centerGravity * alpha;
        node.vy += -node.y * centerGravity * alpha;

        // Apply damping
        node.vx *= damping;
        node.vy *= damping;

        // Deadband: eliminate micro-vibrations completely
        if (Math.abs(node.vx) < 0.03) node.vx = 0;
        if (Math.abs(node.vy) < 0.03) node.vy = 0;

        // Cap maximum speed
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        const maxSpeed = 12;
        if (speed > maxSpeed) {
          node.vx = (node.vx / speed) * maxSpeed;
          node.vy = (node.vy / speed) * maxSpeed;
        }

        node.x += node.vx;
        node.y += node.vy;
      }

      // Decay simulation energy (alpha cools down toward 0)
      alphaRef.current *= 0.965;

      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animId);
  }, [
    isSimulating, 
    filteredNodes, 
    filteredEdges, 
    groupByNotebook, 
    notebookCenters, 
    repulsionStrength, 
    centerGravity, 
    linkDistance
  ]);

  // 4. Canvas Renderer (Draws cosmic background, galaxy watermarks, edges, nodes, labels, selection halo)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply pan & zoom
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);

    const nodeMap = new Map<string, GraphNode>();
    filteredNodes.forEach(n => nodeMap.set(n.id, n));

    const focusId = selectedNodeId || hoveredNodeId;
    const isSearching = searchQuery.trim().length > 0;
    const searchLower = searchQuery.toLowerCase().trim();

    // 1. Draw Notebook Galaxy Watermarks & Ambient Boundaries (Constellation mode)
    if (groupByNotebook && !isSearching) {
      notebookCenters.forEach((center, title) => {
        // Draw subtle galaxy orbit / cluster glow
        const gradient = ctx.createRadialGradient(center.x, center.y, 10, center.x, center.y, 140);
        gradient.addColorStop(0, center.color + '18');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 140, 0, Math.PI * 2);
        ctx.fill();

        // Notebook title watermark in background
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = center.color + '66';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title.toUpperCase(), center.x, center.y - 100);
      });
    }

    // 2. Draw Edges
    for (const edge of filteredEdges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const isConnectedToFocus = focusId ? (edge.source === focusId || edge.target === focusId) : true;
      const alpha = focusId ? (isConnectedToFocus ? 0.85 : 0.05) : 0.22;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = edge.color || '#94a3b8';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isConnectedToFocus && focusId ? 2.2 : 1.0;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 3. Draw Nodes
    for (const node of filteredNodes) {
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isConnected = focusId ? connectedNodeIds.has(node.id) : true;
      const matchesSearch = isSearching ? node.label.toLowerCase().includes(searchLower) || (node.tags || []).some(t => t.includes(searchLower)) : true;

      const nodeAlpha = (focusId && !isConnected) || (isSearching && !matchesSearch) ? 0.12 : 1.0;
      ctx.globalAlpha = nodeAlpha;

      // Glow halo on hover or select
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '33';
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'tag' ? node.color : '#0f172a';
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = node.type === 'tag' ? 3 : 2.2;
      ctx.stroke();

      // Node Icon / Badge inside (Crisp vector drawing, NO emojis)
      if (node.type === 'page') {
        const w = 10, h = 13;
        const left = node.x - w / 2;
        const top = node.y - h / 2;
        const fold = 3.5;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left + w - fold, top);
        ctx.lineTo(left + w, top + fold);
        ctx.lineTo(left + w, top + h);
        ctx.lineTo(left, top + h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(left + w - fold, top);
        ctx.lineTo(left + w - fold, top + fold);
        ctx.lineTo(left + w, top + fold);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(left + 2.5, top + 6.5);
        ctx.lineTo(left + w - 2.5, top + 6.5);
        ctx.moveTo(left + 2.5, top + 9.5);
        ctx.lineTo(left + w - 4, top + 9.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (node.type === 'block') {
        if (node.blockType === 'audio') {
          // Clean vector microphone
          ctx.beginPath();
          ctx.arc(node.x, node.y - 3, 2.5, Math.PI, 0, false);
          ctx.lineTo(node.x + 2.5, node.y + 1);
          ctx.arc(node.x, node.y + 1, 2.5, 0, Math.PI, false);
          ctx.closePath();
          ctx.fillStyle = node.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(node.x, node.y, 4.5, 0, Math.PI, false);
          ctx.moveTo(node.x, node.y + 4.5);
          ctx.lineTo(node.x, node.y + 7);
          ctx.moveTo(node.x - 3, node.y + 7);
          ctx.lineTo(node.x + 3, node.y + 7);
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else if (node.blockType === 'pin') {
          // Clean vector map pin
          ctx.beginPath();
          ctx.arc(node.x, node.y - 2, 4, Math.PI * 0.8, Math.PI * 2.2);
          ctx.lineTo(node.x, node.y + 6);
          ctx.closePath();
          ctx.fillStyle = node.color;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(node.x, node.y - 2, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        } else {
          // Clean vector chat/text bubble
          const bw = 11, bh = 8;
          const bleft = node.x - bw / 2;
          const btop = node.y - bh / 2 - 1;
          ctx.beginPath();
          ctx.moveTo(bleft, btop);
          ctx.lineTo(bleft + bw, btop);
          ctx.lineTo(bleft + bw, btop + bh);
          ctx.lineTo(bleft + 4, btop + bh);
          ctx.lineTo(bleft + 1.5, btop + bh + 2.5);
          ctx.lineTo(bleft + 2, btop + bh);
          ctx.lineTo(bleft, btop + bh);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.fill();
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(bleft + 2.5, btop + 2.8);
          ctx.lineTo(bleft + bw - 2.5, btop + 2.8);
          ctx.moveTo(bleft + 2.5, btop + 5.5);
          ctx.lineTo(bleft + bw - 4, btop + 5.5);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      } else {
        // Tag node: print item count
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.itemCount || 1), node.x, node.y);
      }

      // Label below (Level of Detail: show when zoomed in, hovered, selected, or tag)
      const shouldShowLabel = zoom >= 0.65 || isHovered || isSelected || node.type === 'tag' || isSearching;

      if (shouldShowLabel) {
        const fontSize = node.type === 'tag' ? 12 : 11;
        ctx.font = `${node.type === 'tag' ? 'bold ' : '500 '}${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const labelText = node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label;
        const labelY = node.y + node.radius + 5;

        // Label background pill with subtle border
        const textMetrics = ctx.measureText(labelText);
        const paddingX = 6;
        const paddingY = 3;
        const bgWidth = textMetrics.width + paddingX * 2;
        const bgHeight = fontSize + paddingY * 2;

        ctx.fillStyle = 'rgba(10, 10, 18, 0.9)';
        ctx.beginPath();
        ctx.roundRect(node.x - bgWidth / 2, labelY, bgWidth, bgHeight, 5);
        ctx.fill();
        ctx.strokeStyle = isHovered || isSelected ? node.color : 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isHovered || isSelected ? '#ffffff' : '#e2e8f0';
        ctx.fillText(labelText, node.x, labelY + paddingY);
      }
    }

    ctx.restore();
  }, [
    filteredNodes, 
    filteredEdges, 
    pan, 
    zoom, 
    selectedNodeId, 
    hoveredNodeId, 
    connectedNodeIds, 
    searchQuery, 
    groupByNotebook, 
    notebookCenters
  ]);

  // Continuous smooth rendering frame loop
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  // 5. Pointer & Gesture Handlers (Pan, Zoom, Drag Node, Click to Select, Double Click to Open)
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0, clientX: e.clientX, clientY: e.clientY };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - rect.width / 2 - pan.x) / zoom;
    const worldY = (mouseY - rect.height / 2 - pan.y) / zoom;
    return { worldX, worldY, clientX: e.clientX, clientY: e.clientY };
  };

  const findNodeAtCoords = (wx: number, wy: number) => {
    for (let i = filteredNodes.length - 1; i >= 0; i--) {
      const node = filteredNodes[i];
      const dx = wx - node.x;
      const dy = wy - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 8) {
        return node;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasCoords(e);
    const hitNode = findNodeAtCoords(worldX, worldY);

    const now = Date.now();
    const isDoubleClick = now - lastClickTimeRef.current < 300;
    lastClickTimeRef.current = now;

    if (hitNode) {
      if (isDoubleClick && hitNode.type === 'page' && hitNode.pageId) {
        onSelectPage(hitNode.pageId);
        onClose();
        return;
      }

      draggedNodeRef.current = hitNode;
      hitNode.isFixed = true;
      alphaRef.current = 0.5; // Re-heat gently while dragging
      setIsSimulating(true);
      setSelectedNodeId(hitNode.id);
    } else {
      isDraggingCanvasRef.current = true;
      lastMousePosRef.current = { x: clientX, y: clientY };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasCoords(e);

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = worldX;
      draggedNodeRef.current.y = worldY;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
      return;
    }

    if (isDraggingCanvasRef.current) {
      const dx = clientX - lastMousePosRef.current.x;
      const dy = clientY - lastMousePosRef.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePosRef.current = { x: clientX, y: clientY };
      return;
    }

    // Hover detection
    const hit = findNodeAtCoords(worldX, worldY);
    setHoveredNodeId(hit ? hit.id : null);
  };

  const handlePointerUp = () => {
    if (draggedNodeRef.current) {
      draggedNodeRef.current.isFixed = false;
      draggedNodeRef.current = null;
    }
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.min(3.0, Math.max(0.15, prev * zoomFactor)));
  };

  // Center / Fit Graph to Screen
  const handleFitToScreen = () => {
    if (filteredNodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    filteredNodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });

    const graphWidth = maxX - minX + 160;
    const graphHeight = maxY - minY + 160;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scaleX = canvas.clientWidth / graphWidth;
    const scaleY = canvas.clientHeight / graphHeight;
    const newZoom = Math.min(1.4, Math.max(0.3, Math.min(scaleX, scaleY)));

    setZoom(newZoom);
    setPan({
      x: -((minX + maxX) / 2) * newZoom,
      y: -((minY + maxY) / 2) * newZoom
    });
  };

  // Currently selected node object
  const activeSelectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <header 
        className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 z-10 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
      >
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title={isSidebarOpen ? "Collapse Sidebar (Cmd+B)" : "Expand Sidebar (Cmd+B)"}
            >
              {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
          )}

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
            title="Return to Note Canvas"
          >
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>

          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span className="p-1 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Brain size={15} />
              </span>
              <span>Knowledge Graph</span>
            </span>

            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{nodes.filter(n => n.type === 'page').length} notes</span>
              <span>·</span>
              <span>{nodes.filter(n => n.type === 'tag').length} tags</span>
            </span>
          </div>
        </div>

        {/* Center Search Input */}
        <div className="hidden sm:flex items-center relative max-w-xs w-full mx-4">
          <Search size={14} className="absolute left-3 text-zinc-500" />
          <input
            type="text"
            placeholder="Search tags or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-800 rounded-full py-1.5 pl-8 pr-8 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-zinc-500 hover:text-zinc-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {onOpenTagHub && (
            <button
              onClick={onOpenTagHub}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-colors"
              title="Switch to Tag Place list & filters"
            >
              <Hash size={13} />
              <span>Tag Place</span>
            </button>
          )}

          {/* Obsidian Graph Settings Button */}
          <button
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              showSettingsDrawer 
                ? 'bg-zinc-800 text-purple-300 border-purple-500/40 shadow-sm' 
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
            title="Graph View Controls & Filters"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Reheat / Restart Physics Button */}
          <button
            onClick={reheatSimulation}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 transition-colors"
            title="Rearrange & Re-balance Physics"
          >
            <Flame size={15} />
          </button>

          {/* Fit to View */}
          <button
            onClick={handleFitToScreen}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Center and Fit Graph"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>

      {/* 2. Main Interactive Graph Canvas */}
      <div className="flex-1 relative overflow-hidden bg-[#09090b]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none block"
        />

        {/* Floating Zoom & Control Pod */}
        <div className="absolute bottom-6 left-6 flex items-center gap-1 p-1 bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800 shadow-xl z-20">
          <button
            onClick={() => setZoom(prev => Math.min(3.0, prev * 1.2))}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <span className="text-[11px] font-mono text-zinc-400 px-1 min-w-[42px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(prev => Math.max(0.15, prev * 0.8))}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <div className="h-4 w-px bg-zinc-800 my-auto" />
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Reset View"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Floating Obsidian-Style Settings Drawer */}
        {showSettingsDrawer && (
          <div className="absolute top-4 left-4 w-76 p-4 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-800 shadow-2xl z-30 animate-in fade-in slide-in-from-top-2 duration-150 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <span className="font-bold text-white flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-purple-400" />
                <span>Graph View Settings</span>
              </span>
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X size={14} />
              </button>
            </div>

            <div className="py-3 space-y-3.5">
              {/* Group By Notebook Constellations */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-zinc-200 block">Notebook Constellations</span>
                  <span className="text-[10px] text-zinc-500">Cluster notes by project</span>
                </div>
                <button
                  onClick={() => {
                    setGroupByNotebook(!groupByNotebook);
                    reheatSimulation();
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                    groupByNotebook ? 'bg-purple-600' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    groupByNotebook ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Media & Canvas Pins */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-zinc-200 block">Show Canvas Blocks</span>
                  <span className="text-[10px] text-zinc-500">Audio, text & canvas pins</span>
                </div>
                <button
                  onClick={() => {
                    setShowBlocks(!showBlocks);
                    reheatSimulation();
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                    showBlocks ? 'bg-purple-600' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    showBlocks ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Show Orphan Notes Only */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-zinc-200 block">Orphan Notes Only</span>
                  <span className="text-[10px] text-zinc-500">Find notes with 0 connections</span>
                </div>
                <button
                  onClick={() => {
                    setShowOrphansOnly(!showOrphansOnly);
                    reheatSimulation();
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative p-0.5 ${
                    showOrphansOnly ? 'bg-amber-600' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    showOrphansOnly ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Filter By Specific Notebook */}
              <div className="pt-2 border-t border-zinc-800">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Filter by Notebook
                </label>
                <select
                  value={selectedNotebookId}
                  onChange={(e) => {
                    setSelectedNotebookId(e.target.value);
                    reheatSimulation();
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All Notebooks ({notebooks.length})</option>
                  {notebooks.map(nb => (
                    <option key={nb.id} value={nb.title}>
                      {nb.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Force Sliders */}
              <div className="pt-2 border-t border-zinc-800 space-y-2.5">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Node Spacing (Repulsion)</span>
                    <span className="font-mono text-zinc-300">{repulsionStrength}</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="3000"
                    step="100"
                    value={repulsionStrength}
                    onChange={(e) => {
                      setRepulsionStrength(Number(e.target.value));
                      reheatSimulation();
                    }}
                    className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Link Distance</span>
                    <span className="font-mono text-zinc-300">{linkDistance}px</span>
                  </div>
                  <input
                    type="range"
                    min="60"
                    max="240"
                    step="10"
                    value={linkDistance}
                    onChange={(e) => {
                      setLinkDistance(Number(e.target.value));
                      reheatSimulation();
                    }}
                    className="w-full accent-purple-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              <button
                onClick={reheatSimulation}
                className="w-full py-2 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Flame size={14} className="text-amber-400" />
                <span>Re-balance Constellations</span>
              </button>
            </div>
          </div>
        )}

        {/* Floating Node Details Card when clicked */}
        {activeSelectedNode && (
          <div className="absolute top-4 right-4 w-84 max-w-[calc(100vw-2rem)] p-4 bg-zinc-900/95 backdrop-blur-xl rounded-2xl border border-zinc-800 shadow-2xl z-30 animate-in fade-in slide-in-from-right-4 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3.5 h-3.5 rounded-full shrink-0" 
                  style={{ backgroundColor: activeSelectedNode.color }} 
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {activeSelectedNode.type === 'tag' ? 'Tag Hub' : activeSelectedNode.type === 'page' ? 'Note Document' : 'Tagged Block'}
                </span>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              >
                <X size={14} />
              </button>
            </div>

            <h3 className="mt-2 text-base font-bold text-white break-words">
              {activeSelectedNode.label}
            </h3>

            {activeSelectedNode.sublabel && (
              <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                <FolderOpen size={12} className="text-zinc-500" />
                <span>{activeSelectedNode.sublabel}</span>
              </p>
            )}

            {/* Tag Node Specific Details */}
            {activeSelectedNode.type === 'tag' && (
              <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>Connected items:</span>
                  <span className="font-semibold text-white">{activeSelectedNode.itemCount}</span>
                </div>
                {onOpenTagHub && (
                  <button
                    onClick={() => onOpenTagHub()}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20"
                  >
                    <Hash size={13} />
                    <span>View in Tag Place</span>
                  </button>
                )}
              </div>
            )}

            {/* Page Node Specific Details */}
            {activeSelectedNode.type === 'page' && activeSelectedNode.pageId && (
              <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-3">
                {activeSelectedNode.tags && activeSelectedNode.tags.length > 0 ? (
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 block mb-1">
                      Tags on this note:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {activeSelectedNode.tags.map(t => (
                        <span 
                          key={t}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-500 italic bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/60">
                    No tags attached yet. Add tags in the note to connect it to other ideas!
                  </div>
                )}

                <button
                  onClick={() => {
                    onSelectPage(activeSelectedNode.pageId!);
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20"
                >
                  <FileText size={13} />
                  <span>Open Note in Canvas</span>
                </button>
              </div>
            )}

            {/* Block Node Specific Details */}
            {activeSelectedNode.type === 'block' && activeSelectedNode.pageId && (
              <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-3">
                <div className="text-xs text-zinc-300 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 italic">
                  "{activeSelectedNode.label}"
                </div>

                <button
                  onClick={() => {
                    if (activeSelectedNode.jumpCoordinates && onJumpToCoordinates) {
                      onJumpToCoordinates(
                        activeSelectedNode.pageId!, 
                        activeSelectedNode.jumpCoordinates.x, 
                        activeSelectedNode.jumpCoordinates.y
                      );
                    } else {
                      onSelectPage(activeSelectedNode.pageId!);
                    }
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-purple-600/20"
                >
                  <MapPin size={13} />
                  <span>Jump to Canvas Spot</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-30">
            <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-zinc-300">Synthesizing workspace knowledge graph...</p>
          </div>
        )}
      </div>
    </div>
  );
}

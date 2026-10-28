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
  ChevronRight
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
}

export type MindMapNodeType = 'tag' | 'page' | 'block';

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
}

export function GlobalMindMapView({
  notebooks,
  onSelectPage,
  onJumpToCoordinates,
  onClose,
  onOpenTagHub
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
  const [isSimulating, setIsSimulating] = useState(true);

  // Interaction state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Viewport Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isDraggingCanvasRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Animation frame ref
  const animFrameRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  nodesRef.current = nodes;
  edgesRef.current = edges;

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
                  const norm = normalizeTagId(t);
                  if (norm) bTags.add(norm);
                }

                for (const t of bTags) {
                  pageTagsSet.add(t);
                  tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                }

                // Optional block node
                if (bTags.size > 0) {
                  const blockNodeId = `block-${b.id}`;
                  rawNodes.push({
                    id: blockNodeId,
                    type: 'block',
                    label: (b.content || "Text snippet").replace(/<[^>]+>/g, '').trim().slice(0, 36) || "Text Block",
                    color: '#94a3b8',
                    radius: 9,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    pageId: page.id,
                    notebookTitle: nb.title,
                    sectionTitle: sec.title,
                    tags: Array.from(bTags),
                    blockType: 'text',
                    jumpCoordinates: { x: b.x || 0, y: b.y || 0 }
                  });

                  // Edge to page
                  rawEdges.push({
                    id: `edge-${page.id}-${blockNodeId}`,
                    source: `page-${page.id}`,
                    target: blockNodeId,
                    color: '#cbd5e1',
                    weight: 0.5
                  });
                }
              }

              // Audio recordings
              const audioList = Array.isArray(state?.audios) ? state.audios : (Array.isArray(state?.audioRecordings) ? state.audioRecordings : []);
              for (const a of audioList) {
                if (Array.isArray(a.tags) && a.tags.length > 0) {
                  const aTags: string[] = [];
                  for (const t of a.tags) {
                    const norm = normalizeTagId(t);
                    if (norm) {
                      aTags.push(norm);
                      pageTagsSet.add(norm);
                      tagCounts.set(norm, (tagCounts.get(norm) || 0) + 1);
                    }
                  }

                  const audioNodeId = `audio-${a.id}`;
                  rawNodes.push({
                    id: audioNodeId,
                    type: 'block',
                    label: a.title || "Voice Note",
                    color: '#ef4444',
                    radius: 10,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    pageId: page.id,
                    notebookTitle: nb.title,
                    sectionTitle: sec.title,
                    tags: aTags,
                    blockType: 'audio',
                    jumpCoordinates: { x: a.x || 0, y: a.y || 0 }
                  });

                  rawEdges.push({
                    id: `edge-${page.id}-${audioNodeId}`,
                    source: `page-${page.id}`,
                    target: audioNodeId,
                    color: '#fca5a5',
                    weight: 0.5
                  });
                }
              }

              // Canvas Tag Pins
              if (Array.isArray(state?.tagPins)) {
                for (const pin of state.tagPins) {
                  const norm = normalizeTagId(pin.tag);
                  if (norm) {
                    pageTagsSet.add(norm);
                    tagCounts.set(norm, (tagCounts.get(norm) || 0) + 1);

                    const pinNodeId = `pin-${pin.id}`;
                    rawNodes.push({
                      id: pinNodeId,
                      type: 'block',
                      label: pin.label || `#${pin.tag}`,
                      color: pin.color || getTagColor(norm, registry).color,
                      radius: 9,
                      x: 0,
                      y: 0,
                      vx: 0,
                      vy: 0,
                      pageId: page.id,
                      notebookTitle: nb.title,
                      sectionTitle: sec.title,
                      tags: [norm],
                      blockType: 'pin',
                      jumpCoordinates: { x: pin.x || 0, y: pin.y || 0 }
                    });

                    rawEdges.push({
                      id: `edge-${page.id}-${pinNodeId}`,
                      source: `page-${page.id}`,
                      target: pinNodeId,
                      color: '#cbd5e1',
                      weight: 0.5
                    });
                  }
                }
              }

            } catch (err) {
              console.warn("Failed reading cached state for page:", page.id, err);
            }

            pageTagMap.set(page.id, pageTagsSet);

            // Add Page Node
            rawNodes.push({
              id: `page-${page.id}`,
              type: 'page',
              label: page.title || "Untitled Note",
              sublabel: `${nb.title} › ${sec.title}`,
              color: '#3b82f6',
              radius: 18,
              x: 0,
              y: 0,
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

      // Add Tag Nodes
      for (const [tagId, count] of tagCounts.entries()) {
        const tagTheme = getTagColor(tagId, registry);
        rawNodes.push({
          id: `tag-${tagId}`,
          type: 'tag',
          label: `#${formatTagName(tagId)}`,
          color: tagTheme.color,
          radius: Math.min(38, Math.max(20, 18 + count * 4)),
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          itemCount: count
        });
      }

      // Create Edges: Page <-> Tag
      for (const [pageId, tags] of pageTagMap.entries()) {
        for (const tagId of tags) {
          rawEdges.push({
            id: `edge-tag-${tagId}-page-${pageId}`,
            source: `tag-${tagId}`,
            target: `page-${pageId}`,
            color: getTagColor(tagId, registry).color,
            weight: 1.2
          });
        }
      }

      // Initial placement in concentric layout to speed up force convergence
      const tagList = rawNodes.filter(n => n.type === 'tag');
      const pageList = rawNodes.filter(n => n.type === 'page');
      const blockList = rawNodes.filter(n => n.type === 'block');

      // Tag nodes in center ring
      const tagRadius = Math.max(120, tagList.length * 36);
      tagList.forEach((tagNode, idx) => {
        const angle = (idx / Math.max(1, tagList.length)) * Math.PI * 2;
        tagNode.x = Math.cos(angle) * tagRadius + (Math.random() - 0.5) * 30;
        tagNode.y = Math.sin(angle) * tagRadius + (Math.random() - 0.5) * 30;
      });

      // Page nodes in outer ring
      const pageRadius = tagRadius + 180;
      pageList.forEach((pageNode, idx) => {
        const angle = (idx / Math.max(1, pageList.length)) * Math.PI * 2;
        pageNode.x = Math.cos(angle) * pageRadius + (Math.random() - 0.5) * 50;
        pageNode.y = Math.sin(angle) * pageRadius + (Math.random() - 0.5) * 50;
      });

      // Block nodes around their parent page
      const pageMap = new Map<string, GraphNode>();
      pageList.forEach(p => pageMap.set(p.pageId!, p));
      blockList.forEach((bNode, idx) => {
        const parentPage = bNode.pageId ? pageMap.get(bNode.pageId) : null;
        if (parentPage) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 40;
          bNode.x = parentPage.x + Math.cos(angle) * dist;
          bNode.y = parentPage.y + Math.sin(angle) * dist;
        }
      });

      if (isMounted) {
        setNodes(rawNodes);
        setEdges(rawEdges);
        setIsLoading(false);
      }
    }

    buildKnowledgeGraph();

    return () => {
      isMounted = false;
    };
  }, [notebooks]);

  // 2. Filter active nodes & edges based on search, notebook, and showBlocks
  const { filteredNodes, filteredEdges, connectedNodeIds } = useMemo(() => {
    let activeNodes = nodes.filter(n => {
      if (!showBlocks && n.type === 'block') return false;
      if (selectedNotebookId !== 'all') {
        if (n.type === 'page' && n.notebookTitle !== selectedNotebookId) return false;
        if (n.type === 'block' && n.notebookTitle !== selectedNotebookId) return false;
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
      connectedNodeIds: connected
    };
  }, [nodes, edges, showBlocks, selectedNotebookId, selectedNodeId, hoveredNodeId]);

  // 3. Force-directed physics step (Repulsion, Springs, Center Gravity, Damping)
  useEffect(() => {
    if (!isSimulating || filteredNodes.length === 0) return;

    let animId: number;
    let iteration = 0;
    const MAX_ITERATIONS = 400;

    const step = () => {
      if (iteration++ > MAX_ITERATIONS && !draggedNodeRef.current) {
        setIsSimulating(false);
        return;
      }

      const activeNodes = filteredNodes;
      const activeEdges = filteredEdges;
      const nodeMap = new Map<string, GraphNode>();
      activeNodes.forEach(n => nodeMap.set(n.id, n));

      // 1. Repulsion between all node pairs
      for (let i = 0; i < activeNodes.length; i++) {
        const n1 = activeNodes[i];
        for (let j = i + 1; j < activeNodes.length; j++) {
          const n2 = activeNodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const distSq = dx * dx + dy * dy + 1;
          const dist = Math.sqrt(distSq);

          const minDistance = n1.radius + n2.radius + 30;
          const repulsionK = (n1.type === 'tag' || n2.type === 'tag') ? 2400 : 1200;
          const force = (repulsionK / distSq) * (dist < minDistance ? 3 : 1);

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

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

      // 2. Spring attraction along edges
      for (const edge of activeEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const idealDist = (source.type === 'tag' && target.type === 'page') ? 140 : 80;
        const displacement = dist - idealDist;
        const springK = 0.035 * (edge.weight || 1);

        const fx = (dx / dist) * displacement * springK;
        const fy = (dy / dist) * displacement * springK;

        if (!source.isFixed) {
          source.vx += fx;
          source.vy += fy;
        }
        if (!target.isFixed) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // 3. Center gravity & velocity dampening
      const gravity = 0.015;
      const damping = 0.82;

      for (const node of activeNodes) {
        if (node.isFixed) continue;

        node.vx += -node.x * gravity;
        node.vy += -node.y * gravity;

        node.vx *= damping;
        node.vy *= damping;

        // Apply velocities with cap
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        const maxSpeed = 16;
        if (speed > maxSpeed) {
          node.vx = (node.vx / speed) * maxSpeed;
          node.vy = (node.vy / speed) * maxSpeed;
        }

        node.x += node.vx;
        node.y += node.vy;
      }

      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animId);
  }, [isSimulating, filteredNodes, filteredEdges]);

  // 4. Canvas Renderer (Draws edges, nodes, labels, selection halo)
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

    // 1. Draw Edges
    for (const edge of filteredEdges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const isConnectedToFocus = focusId ? (edge.source === focusId || edge.target === focusId) : true;
      const alpha = focusId ? (isConnectedToFocus ? 0.8 : 0.08) : 0.28;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = edge.color || '#94a3b8';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isConnectedToFocus && focusId ? 2.5 : 1.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // 2. Draw Nodes
    for (const node of filteredNodes) {
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isConnected = focusId ? connectedNodeIds.has(node.id) : true;
      const matchesSearch = isSearching ? node.label.toLowerCase().includes(searchLower) || (node.tags || []).some(t => t.includes(searchLower)) : true;

      const nodeAlpha = (focusId && !isConnected) || (isSearching && !matchesSearch) ? 0.15 : 1.0;
      ctx.globalAlpha = nodeAlpha;

      // Glow halo on hover or select
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '44';
        ctx.fill();
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Main Node Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'tag' ? node.color : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = node.type === 'tag' ? 3 : 2;
      ctx.stroke();

      // Node Icon / Badge inside
      if (node.type === 'page') {
        ctx.fillStyle = node.color;
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("📄", node.x, node.y);
      } else if (node.type === 'block') {
        ctx.fillStyle = node.color;
        ctx.font = '10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.blockType === 'audio' ? "🎙️" : node.blockType === 'pin' ? "📍" : "💬", node.x, node.y);
      } else {
        // Tag node: print item count
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.itemCount || 1), node.x, node.y);
      }

      // Label below or pill
      const fontSize = node.type === 'tag' ? 12 : node.type === 'page' ? 11 : 10;
      ctx.font = `${node.type === 'tag' ? 'bold ' : 'medium '}${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const labelText = node.label.length > 24 ? node.label.slice(0, 22) + '…' : node.label;
      const labelY = node.y + node.radius + 5;

      // Label background pill for readability
      const textMetrics = ctx.measureText(labelText);
      const paddingX = 6;
      const paddingY = 3;
      const bgWidth = textMetrics.width + paddingX * 2;
      const bgHeight = fontSize + paddingY * 2;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(node.x - bgWidth / 2, labelY, bgWidth, bgHeight, 5);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(labelText, node.x, labelY + paddingY);
    }

    ctx.restore();
  }, [filteredNodes, filteredEdges, pan, zoom, selectedNodeId, hoveredNodeId, connectedNodeIds, searchQuery]);

  // Animation loop for continuous smooth drawing during physics or pan/zoom
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [draw]);

  // 5. Pointer & Gesture Handlers (Pan, Zoom, Drag Node, Click to Select)
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0, clientX: e.clientX, clientY: e.clientY };
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert screen coordinates to world coordinates
    const worldX = (mouseX - rect.width / 2 - pan.x) / zoom;
    const worldY = (mouseY - rect.height / 2 - pan.y) / zoom;
    return { worldX, worldY, clientX: e.clientX, clientY: e.clientY };
  };

  const findNodeAtCoords = (wx: number, wy: number) => {
    for (let i = filteredNodes.length - 1; i >= 0; i--) {
      const node = filteredNodes[i];
      const dx = wx - node.x;
      const dy = wy - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 6) {
        return node;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { worldX, worldY, clientX, clientY } = getCanvasCoords(e);
    const hitNode = findNodeAtCoords(worldX, worldY);

    if (hitNode) {
      draggedNodeRef.current = hitNode;
      hitNode.isFixed = true;
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

    const graphWidth = maxX - minX + 120;
    const graphHeight = maxY - minY + 120;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scaleX = canvas.clientWidth / graphWidth;
    const scaleY = canvas.clientHeight / graphHeight;
    const newZoom = Math.min(1.5, Math.max(0.3, Math.min(scaleX, scaleY)));

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
        className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 z-10 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-3">
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
              <span className="p-1 rounded-md bg-purple-500/20 text-purple-400">🧠</span>
              <span>Knowledge Graph</span>
            </span>

            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 border border-zinc-700 text-zinc-300">
              {nodes.filter(n => n.type === 'tag').length} tags · {nodes.filter(n => n.type === 'page').length} notes
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

          {/* Toggle Block Items */}
          <button
            onClick={() => setShowBlocks(!showBlocks)}
            className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showBlocks 
                ? 'bg-zinc-800 text-purple-300 border-purple-500/40' 
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="Toggle tagged paragraphs, audio, and pins"
          >
            <Layers size={13} />
            <span>{showBlocks ? "Hide Blocks" : "Show Blocks"}</span>
          </button>

          {/* Physics Simulation Toggle */}
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isSimulating ? "Pause Physics (Stabilize)" : "Resume Physics"}
          >
            {isSimulating ? <Pause size={14} /> : <Play size={14} />}
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
      <div className="flex-1 relative overflow-hidden bg-zinc-950">
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

        {/* Floating Node Details Card when clicked */}
        {activeSelectedNode && (
          <div className="absolute top-6 right-6 w-80 max-w-[calc(100vw-3rem)] p-4 bg-zinc-900/95 backdrop-blur-lg rounded-2xl border border-zinc-800 shadow-2xl z-30 animate-in fade-in slide-in-from-right-4 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3.5 h-3.5 rounded-full shrink-0" 
                  style={{ backgroundColor: activeSelectedNode.color }} 
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {activeSelectedNode.type === 'tag' ? 'Tag Cluster' : activeSelectedNode.type === 'page' ? 'Note Document' : 'Tagged Block'}
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
              <p className="text-xs text-zinc-400 mt-0.5">
                {activeSelectedNode.sublabel}
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
                    onClick={() => {
                      onOpenTagHub();
                    }}
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
                {activeSelectedNode.tags && activeSelectedNode.tags.length > 0 && (
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
                )}

                <button
                  onClick={() => {
                    onSelectPage(activeSelectedNode.pageId!);
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20"
                >
                  <FileText size={13} />
                  <span>Open Note</span>
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

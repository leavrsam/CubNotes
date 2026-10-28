"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { FileNode, ToolType } from "../../CustomCanvas";
import { ChevronLeft, ChevronRight, Grid, ZoomIn, ZoomOut, Download, FileText, Loader2 } from "lucide-react";

interface PdfShapeProps {
  node: FileNode;
  zoom: number;
  pan: { x: number; y: number };
  tool: ToolType;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragStart?: (e: React.PointerEvent, id: string, type: 'file', x: number, y: number) => void;
  onUnpackToGrid?: (id: string, numPages: number, aspectRatio: number) => void;
  onDelete?: (id: string) => void;
  onAnnotate?: (id: string) => void;
}

export function PdfShape({
  node,
  zoom,
  pan,
  tool,
  isSelected,
  onSelect,
  onDragStart,
  onUnpackToGrid,
  onDelete,
  onAnnotate,
}: PdfShapeProps) {
  const [numPages, setNumPages] = useState<number>(node.pageCount || 1);
  const [currentPage, setCurrentPage] = useState<number>(node.currentPage || 1);
  const [aspectRatio, setAspectRatio] = useState<number>(4 / 3);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const thumbnailCache = useRef<Map<number, string>>(new Map());

  // Dynamically load pdfjs-dist on client side
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        const pdfjsLib = await import("pdfjs-dist");
        
        // Use CDN worker matching version or fallback
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        }

        const loadingTask = pdfjsLib.getDocument({
          url: node.url,
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Sample first page to determine aspect ratio
        const firstPage = await doc.getPage(1);
        const vp = firstPage.getViewport({ scale: 1.0 });
        if (vp.width && vp.height) {
          setAspectRatio(vp.width / vp.height);
        }
        setIsLoading(false);
      } catch (err) {
        console.warn("[PdfShape] Failed to load PDF via pdfjs-dist:", err);
        setIsLoading(false);
      }
    }

    if (node.url) {
      loadPdf();
    }

    return () => {
      isCancelled = true;
    };
  }, [node.url]);

  // Render current page onto virtualized canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
    }

    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const baseWidth = node.width || 600;
      // High-DPI crisp rendering capped to 2x
      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const displayWidth = baseWidth;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = (displayWidth / unscaledViewport.width) * dpr;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${baseWidth}px`;
      canvas.style.height = `${baseWidth / aspectRatio}px`;

      const ctx = canvas.getContext("2d", { desynchronized: true });
      if (!ctx) return;

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        console.warn("[PdfShape] Page render error:", err);
      }
    }
  }, [pdfDoc, currentPage, node.width, aspectRatio]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  const handlePrevPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  };

  const handleNextPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPage < numPages) {
      setCurrentPage((p) => p + 1);
    }
  };

  const handleUnpackClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUnpackToGrid) {
      onUnpackToGrid(node.id, numPages, aspectRatio);
    }
  };

  const width = node.width || 600;
  const height = width / aspectRatio;

  return (
    <div
      id={`pdf-node-${node.id}`}
      className="absolute select-none"
      style={{
        transform: `translate(${node.x * zoom + pan.x}px, ${node.y * zoom + pan.y}px) scale(${zoom})`,
        transformOrigin: "0 0",
        pointerEvents: tool === "home" ? "auto" : "none",
        zIndex: isSelected ? 50 : 10,
        width: `${width}px`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      <div
        className={`relative group bg-white dark:bg-zinc-900 rounded-2xl shadow-md border-2 transition-all overflow-hidden ${
          isSelected
            ? "border-primary-500 ring-2 ring-primary-500/20 shadow-xl"
            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
        }`}
      >
        {/* PDF Floating Contextual Toolbar */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700/80 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2 truncate max-w-[220px]">
            <FileText size={15} className="text-red-500 shrink-0" />
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100" title={node.filename}>
              {node.filename}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Multi-page Navigation */}
            {numPages > 1 && (
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-700/60 border border-zinc-200 dark:border-zinc-600/60 rounded-lg px-1.5 py-0.5">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  className="p-0.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-mono font-medium px-1">
                  {currentPage} / {numPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={currentPage >= numPages}
                  className="p-0.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Unpack to Grid ("Explode Deck") Contextual Action */}
            {numPages > 1 && onUnpackToGrid && (
              <button
                onClick={handleUnpackClick}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold rounded-lg border border-indigo-200 dark:border-indigo-800/70 transition-colors"
                title="Unpack multi-page PDF into 2D slide matrix for margin notes"
              >
                <Grid size={13} />
                <span>Unpack to Grid</span>
              </button>
            )}

            {/* Direct PDF Download */}
            <a
              href={node.url}
              download={node.filename}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
              title="Download original PDF"
            >
              <Download size={14} />
            </a>
          </div>
        </div>

        {/* Virtualized Single-Node Canvas Viewport */}
        <div
          className="relative bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden"
          style={{ width: `${width}px`, height: `${height}px` }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 dark:bg-zinc-900/70 z-10">
              <Loader2 size={24} className="animate-spin text-primary-500" />
              <span className="text-xs text-zinc-500 font-medium">Rendering PDF...</span>
            </div>
          )}
          <canvas ref={canvasRef} className="block shadow-sm" />
        </div>
      </div>
    </div>
  );
}

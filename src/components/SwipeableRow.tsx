"use client";

import React, { useState, useRef, useEffect } from "react";
import { Share2, FolderInput, Trash2 } from "lucide-react";

interface SwipeableRowProps {
  id: string;
  isOpen: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
  onShare: () => void;
  onMove: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  actionsWidth?: number;
  className?: string;
  shareLabel?: string;
  moveLabel?: string;
}

export function SwipeableRow({
  id,
  isOpen,
  onOpen,
  onClose,
  onShare,
  onMove,
  onDelete,
  children,
  actionsWidth = 210,
  className = "",
  shareLabel = "Share",
  moveLabel = "Move",
}: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalRef = useRef<boolean | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Sync state with parent's isOpen
  useEffect(() => {
    if (isOpen) {
      setOffsetX(-actionsWidth);
    } else {
      setOffsetX(0);
    }
  }, [isOpen, actionsWidth]);

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isHorizontalRef.current = null;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startXRef.current;
    const deltaY = currentY - startYRef.current;

    // Detect gesture direction after 6px of movement
    if (isHorizontalRef.current === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        isHorizontalRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalRef.current) {
      const baseOffset = isOpen ? -actionsWidth : 0;
      let newOffset = baseOffset + deltaX;

      // Restrict range with resistance
      if (newOffset > 0) {
        newOffset = newOffset * 0.2; // Rubberband to the right
      } else if (newOffset < -actionsWidth) {
        const excess = -actionsWidth - newOffset;
        newOffset = -actionsWidth - excess * 0.3; // Rubberband past actions width
      }

      setOffsetX(newOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (isHorizontalRef.current) {
      if (isOpen) {
        // If already open, close unless dragged significantly left
        if (offsetX > -actionsWidth + 40) {
          onClose();
          setOffsetX(0);
        } else {
          setOffsetX(-actionsWidth);
        }
      } else {
        // If closed, open if swiped left past threshold (-50px)
        if (offsetX < -50) {
          onOpen(id);
          setOffsetX(-actionsWidth);
        } else {
          setOffsetX(0);
        }
      }
    } else if (isOpen) {
      onClose();
      setOffsetX(0);
    }

    isHorizontalRef.current = null;
  };

  return (
    <div 
      ref={rowRef}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Background Action Buttons (Revealed on Swipe Left) */}
      <div 
        className="absolute inset-y-0 right-0 flex z-0 select-none"
        style={{ width: `${actionsWidth}px` }}
      >
        {/* Share Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
            onClose();
          }}
          className="flex-1 flex flex-col items-center justify-center bg-blue-600 active:bg-blue-700 text-white transition-colors"
          title={shareLabel}
        >
          <Share2 size={18} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">{shareLabel}</span>
        </button>

        {/* Move Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMove();
            onClose();
          }}
          className="flex-1 flex flex-col items-center justify-center bg-indigo-600 active:bg-indigo-700 text-white transition-colors"
          title={moveLabel}
        >
          <FolderInput size={18} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">{moveLabel}</span>
        </button>

        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            onClose();
          }}
          className="flex-1 flex flex-col items-center justify-center bg-red-600 active:bg-red-700 text-white transition-colors"
          title="Delete"
        >
          <Trash2 size={18} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">Delete</span>
        </button>
      </div>

      {/* Foreground Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={(e) => {
          if (isOpen) {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
        className="relative z-10 w-full bg-white dark:bg-zinc-900"
      >
        {children}
      </div>
    </div>
  );
}

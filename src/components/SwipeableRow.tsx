"use client";

import React, { useState, useRef, useEffect } from "react";
import { Share2, FolderInput, Trash2, Pin, PinOff, Edit2 } from "lucide-react";

export type SwipeDirection = "left" | "right" | null;

interface SwipeableRowProps {
  id: string;
  openDirection: SwipeDirection;
  onOpen: (id: string, direction: "left" | "right") => void;
  onClose: () => void;
  onShare?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  onRename?: () => void;
  children: React.ReactNode;
  rightActionsWidth?: number; // width when swiped left (revealing right actions: Share, Move, Delete)
  leftActionsWidth?: number;  // width when swiped right (revealing left actions: Pin, Rename)
  className?: string;
  shareLabel?: string;
  moveLabel?: string;
}

export function SwipeableRow({
  id,
  openDirection,
  onOpen,
  onClose,
  onShare,
  onMove,
  onDelete,
  onPin,
  isPinned = false,
  onRename,
  children,
  rightActionsWidth = 210,
  leftActionsWidth = 140,
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

  // Sync state with parent's openDirection
  useEffect(() => {
    if (openDirection === "left") {
      setOffsetX(-rightActionsWidth);
    } else if (openDirection === "right") {
      setOffsetX(leftActionsWidth);
    } else {
      setOffsetX(0);
    }
  }, [openDirection, rightActionsWidth, leftActionsWidth]);

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
      let baseOffset = 0;
      if (openDirection === "left") baseOffset = -rightActionsWidth;
      if (openDirection === "right") baseOffset = leftActionsWidth;

      let newOffset = baseOffset + deltaX;

      // Restrict range with resistance
      if (newOffset > leftActionsWidth) {
        const excess = newOffset - leftActionsWidth;
        newOffset = leftActionsWidth + excess * 0.3; // Rubberband to the right
      } else if (newOffset < -rightActionsWidth) {
        const excess = -rightActionsWidth - newOffset;
        newOffset = -rightActionsWidth - excess * 0.3; // Rubberband to the left
      }

      setOffsetX(newOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (isHorizontalRef.current) {
      if (openDirection === "left") {
        // If swiped left already, close unless still far left
        if (offsetX > -rightActionsWidth + 40) {
          onClose();
          setOffsetX(0);
        } else {
          setOffsetX(-rightActionsWidth);
        }
      } else if (openDirection === "right") {
        // If swiped right already, close unless still far right
        if (offsetX < leftActionsWidth - 40) {
          onClose();
          setOffsetX(0);
        } else {
          setOffsetX(leftActionsWidth);
        }
      } else {
        // From neutral: check if dragged left or right past 45px threshold
        if (offsetX < -45 && (onShare || onMove || onDelete)) {
          onOpen(id, "left");
          setOffsetX(-rightActionsWidth);
        } else if (offsetX > 45 && (onPin || onRename)) {
          onOpen(id, "right");
          setOffsetX(leftActionsWidth);
        } else {
          setOffsetX(0);
        }
      }
    } else if (openDirection) {
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
      {/* Left Action Buttons (Revealed on Swipe Right: Pin, Rename) */}
      {(onPin || onRename) && (
        <div 
          className="absolute inset-y-0 left-0 flex z-0 select-none"
          style={{ width: `${leftActionsWidth}px` }}
        >
          {/* Pin Button */}
          {onPin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPin();
                onClose();
              }}
              className="flex-1 flex flex-col items-center justify-center bg-amber-500 active:bg-amber-600 text-white transition-colors"
              title={isPinned ? "Unpin" : "Pin"}
            >
              {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
              <span className="text-[10px] font-bold mt-1 tracking-tight">
                {isPinned ? "Unpin" : "Pin"}
              </span>
            </button>
          )}

          {/* Rename Button */}
          {onRename && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRename();
                onClose();
              }}
              className="flex-1 flex flex-col items-center justify-center bg-emerald-600 active:bg-emerald-700 text-white transition-colors"
              title="Rename"
            >
              <Edit2 size={18} />
              <span className="text-[10px] font-bold mt-1 tracking-tight">Rename</span>
            </button>
          )}
        </div>
      )}

      {/* Right Action Buttons (Revealed on Swipe Left: Share, Move, Delete) */}
      {(onShare || onMove || onDelete) && (
        <div 
          className="absolute inset-y-0 right-0 flex z-0 select-none"
          style={{ width: `${rightActionsWidth}px` }}
        >
          {/* Share Button */}
          {onShare && (
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
          )}

          {/* Move Button */}
          {onMove && (
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
          )}

          {/* Delete Button */}
          {onDelete && (
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
          )}
        </div>
      )}

      {/* Foreground Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={(e) => {
          if (openDirection) {
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

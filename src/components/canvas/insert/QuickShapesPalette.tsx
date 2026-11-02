"use client";

import React from "react";
import { FlowchartShapeType, ConnectorRouting, ConnectorEnd } from "@/components/CustomCanvas";

interface QuickShapesPaletteProps {
  onInsertShape: (type: FlowchartShapeType, label: string) => void;
  onInsertConnector: (routing: ConnectorRouting, arrowEnd: ConnectorEnd, label?: string) => void;
}

export function QuickShapesPalette({ onInsertShape, onInsertConnector }: QuickShapesPaletteProps) {
  return (
    <div className="flex items-center h-full py-0.5">
      <div 
        className="flex flex-col justify-between h-[38px] px-1.5 py-1 bg-zinc-50 dark:bg-zinc-850 rounded-lg border border-zinc-200 dark:border-zinc-750 shadow-2xs"
        title="Quick Shapes & Diagrams"
      >
        {/* Row 1: Connectors & Box shapes */}
        <div className="flex items-center gap-1.5">
          {/* Straight line */}
          <button
            type="button"
            onClick={() => onInsertConnector('straight', 'none')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Line"
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <line x1="1" y1="9" x2="13" y2="1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>

          {/* Right Arrow */}
          <button
            type="button"
            onClick={() => onInsertConnector('straight', 'arrow')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Arrow"
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <line x1="1" y1="8" x2="11" y2="2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <polyline points="7,2 11,2 11,6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Double Arrow */}
          <button
            type="button"
            onClick={() => onInsertConnector('straight', 'double-arrow')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Double Arrow"
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <line x1="3" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <polyline points="5,3 2,5 5,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="9,3 12,5 9,7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Elbow / Corner Arrow */}
          <button
            type="button"
            onClick={() => onInsertConnector('orthogonal', 'arrow')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Elbow Arrow"
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <polyline points="2,2 2,8 10,8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="8,6 11,8 8,10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Double Elbow */}
          <button
            type="button"
            onClick={() => onInsertConnector('orthogonal', 'double-arrow')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Double Elbow Arrow"
          >
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <polyline points="3,2 3,8 10,8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="1,4 3,1 5,4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="8,6 11,8 8,10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Rectangle */}
          <button
            type="button"
            onClick={() => onInsertShape('rectangle', 'Process')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Rectangle"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <rect x="0.75" y="0.75" width="11.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          {/* Rounded Rect */}
          <button
            type="button"
            onClick={() => onInsertShape('rounded', 'Start / End')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Rounded Rectangle"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <rect x="0.75" y="0.75" width="11.5" height="7.5" rx="3.75" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* Row 2: Geometry & Coordinate axes */}
        <div className="flex items-center gap-1.5">
          {/* Circle / Oval */}
          <button
            type="button"
            onClick={() => onInsertShape('circle', 'Event')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Oval / Circle"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <ellipse cx="6.5" cy="4.5" rx="5.75" ry="3.75" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          {/* Parallelogram */}
          <button
            type="button"
            onClick={() => onInsertShape('parallelogram', 'Data')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Parallelogram"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <polygon points="3,0.75 12.25,0.75 10,8.25 0.75,8.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Triangle */}
          <button
            type="button"
            onClick={() => onInsertShape('triangle', 'Triangle')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Triangle"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <polygon points="6.5,0.75 12.25,8.25 0.75,8.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Diamond */}
          <button
            type="button"
            onClick={() => onInsertShape('diamond', 'Decision')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Diamond / Decision"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <polygon points="6.5,0.75 12.25,4.5 6.5,8.25 0.75,4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>

          {/* 2D Coordinate Axes */}
          <button
            type="button"
            onClick={() => onInsertShape('axes2d', '2D Graph')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="2D Coordinate Axes (X-Y Graph)"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <line x1="2" y1="1" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="0.5,2.5 2,1 3.5,2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              <line x1="2" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <polyline points="10.5,6.5 12,8 10.5,9.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </button>

          {/* 3D Coordinate Axes */}
          <button
            type="button"
            onClick={() => onInsertShape('axes3d', '3D Graph')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="3D Coordinate Axes (X-Y-Z Graph)"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <line x1="6.5" y1="8" x2="6.5" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6.5" y1="8" x2="1" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="6.5" y1="8" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {/* Sticky Note */}
          <button
            type="button"
            onClick={() => onInsertShape('note', 'Note')}
            className="w-5 h-3.5 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/40 rounded transition-colors group"
            title="Sticky Note"
          >
            <svg width="13" height="9" viewBox="0 0 13 9" fill="none" className="text-blue-500 group-hover:text-blue-600">
              <path d="M1 1 H12 V6 L9 9 H1 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

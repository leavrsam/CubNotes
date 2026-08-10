import React, { useState } from 'react';
import { HexColorPicker, HexColorInput } from "react-colorful";

export type ColorPickerType = 'text' | 'drawing' | 'page';

interface ColorPickerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeColor: string;
  onChange: (color: string) => void;
  type: ColorPickerType;
}

const DRAWING_COLORS = [
  '#806000', '#cc4100', '#ff0080', '#ed1c24',
  '#c8bfe7', '#ff66ff', '#ff66cc', '#66ccff',
  '#0080aa', '#004066', '#009944', '#336600',
  '#ffffff', '#c3c3c3', '#7f7f7f', '#000000',
  '#ffae00', '#3f48cc', '#a30000', '#006666',
  '#ffcccc', '#ffcc00', '#ccddff', '#cc8866'
]; // 4 columns, 6 rows

const TEXT_THEME_COLORS = [
  // Row 1
  '#000000', '#ffffff', '#e2e2e2', '#3b82f6', '#ea580c', '#f97316', '#854d0e', '#8b5cf6', '#a855f7', '#65a30d',
  // Row 2
  '#18181b', '#f4f4f5', '#d4d4d8', '#2563eb', '#c2410c', '#ea580c', '#713f12', '#7c3aed', '#9333ea', '#4d7c0f',
  // Row 3
  '#27272a', '#e4e4e7', '#a1a1aa', '#1d4ed8', '#9a3412', '#c2410c', '#422006', '#6d28d9', '#7e22ce', '#3f6212',
  // Row 4
  '#3f3f46', '#d4d4d8', '#71717a', '#1e40af', '#7c2d12', '#9a3412', '#451a03', '#5b21b6', '#6b21a8', '#365314',
  // Row 5
  '#52525b', '#e4e4e7', '#52525b', '#1e3a8a', '#431407', '#7c2d12', '#78350f', '#4c1d95', '#581c87', '#14532d',
  // Row 6
  '#71717a', '#ffffff', '#3f3f46', '#bfdbfe', '#ffedd5', '#fed7aa', '#fef08a', '#f3e8ff', '#fce7f3', '#dcfce7'
];

const TEXT_STANDARD_COLORS = [
  '#ef4444', '#dc2626', '#b91c1c', '#65a30d', '#15803d', '#16a34a', '#0891b2', '#3b82f6', '#60a5fa', '#a855f7'
];

const PAGE_COLORS = [
  '#0f172a', '#022c22', '#052e16', '#450a0a',
  '#1e1b4b', '#000000', '#14532d', '#7f1d1d',
  '#172554', '#09090b', '#064e3b', '#4c0519',
  '#2e1065', '#4a044e', '#3f2c00', '#422006'
]; // 4x4 dark tinted colors

export function ColorPickerMenu({ isOpen, onClose, activeColor, onChange, type }: ColorPickerMenuProps) {
  const [isMoreColorsMode, setIsMoreColorsMode] = useState(false);

  if (!isOpen) return null;

  const handleMoreColors = () => {
    setIsMoreColorsMode(true);
  };

  const handleClose = () => {
    setIsMoreColorsMode(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={handleClose} />
      <div className="absolute top-full left-0 mt-1 bg-[#2c2c2c] border border-[#444] rounded shadow-xl z-50 p-3 min-w-[200px] flex flex-col gap-3 font-sans text-sm text-zinc-200" onClick={e => e.stopPropagation()}>
        
        {isMoreColorsMode ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-zinc-100">Custom Color</span>
              <button 
                onClick={() => setIsMoreColorsMode(false)}
                className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            </div>
            <HexColorPicker 
              color={activeColor !== 'default' ? activeColor : '#ffffff'} 
              onChange={onChange} 
              style={{ width: '100%', height: '150px' }} 
            />
            <div className="flex items-center gap-2 bg-[#3c3c3c] border border-[#444] rounded px-2 py-1">
              <span className="text-zinc-400 font-mono text-sm">#</span>
              <HexColorInput 
                color={activeColor !== 'default' ? activeColor : '#ffffff'} 
                onChange={onChange} 
                className="bg-transparent border-none outline-none w-full text-zinc-200 font-mono text-sm uppercase tracking-wider" 
                prefixed={false}
              />
            </div>
            <button 
              className="mt-1 w-full bg-[#3c3c3c] hover:bg-[#4a4a4a] text-white py-1.5 rounded text-xs font-medium"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {type === 'drawing' && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-xs text-zinc-100">Recent Colors</span>
              <div className="w-8 h-8 border-2 border-orange-500 rounded-sm" style={{ backgroundColor: activeColor }}></div>
            </div>
            
            <div className="w-full h-px bg-[#444]" />
            
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-xs text-zinc-100">Colors</span>
              <div className="grid grid-cols-4 gap-[2px] bg-[#444] border border-[#444]">
                {DRAWING_COLORS.map((c, i) => (
                  <button 
                    key={i} 
                    className="w-8 h-8 hover:opacity-80 hover:ring-1 hover:ring-white/50" 
                    style={{ backgroundColor: c }}
                    onClick={() => { onChange(c); onClose(); }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'text' && (
          <>
            <button 
              className="flex items-center gap-2 hover:bg-[#3c3c3c] px-2 py-1 rounded -mx-1"
              onClick={() => { onChange('#000000'); onClose(); }}
            >
              <div className="w-4 h-4 bg-white border border-[#444]"></div>
              <span>Automatic</span>
            </button>
            
            <div className="w-full h-px bg-[#444]" />
            
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-xs text-zinc-100">Theme Colors</span>
              <div className="grid grid-cols-10 gap-0">
                {TEXT_THEME_COLORS.map((c, i) => (
                  <button 
                    key={i} 
                    className="w-4 h-4 hover:opacity-80 hover:ring-1 hover:ring-white z-10 hover:z-20 border border-[#2c2c2c]" 
                    style={{ backgroundColor: c }}
                    onClick={() => { onChange(c); onClose(); }}
                  />
                ))}
              </div>
            </div>
            
            <div className="w-full h-px bg-[#444]" />
            
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-xs text-zinc-100">Standard Colors</span>
              <div className="grid grid-cols-10 gap-[2px]">
                {TEXT_STANDARD_COLORS.map((c, i) => (
                  <button 
                    key={i} 
                    className="w-4 h-4 hover:opacity-80 hover:ring-1 hover:ring-white z-10 hover:z-20" 
                    style={{ backgroundColor: c }}
                    onClick={() => { onChange(c); onClose(); }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {type === 'page' && (
          <>
            <div className="grid grid-cols-4 gap-[2px] bg-[#444] border border-[#444]">
              {PAGE_COLORS.map((c, i) => (
                <button 
                  key={i} 
                  className="w-8 h-8 hover:opacity-80 hover:ring-1 hover:ring-white/50" 
                  style={{ backgroundColor: c }}
                  onClick={() => { onChange(c); onClose(); }}
                />
              ))}
            </div>
            <button 
              className="flex items-center gap-2 hover:bg-[#3c3c3c] px-2 py-1 rounded -mx-1"
              onClick={() => { onChange('default'); onClose(); }}
            >
              <div className="w-4 h-4 border border-[#444]"></div>
              <span>No Color</span>
            </button>
          </>
        )}

            <div className="w-full h-px bg-[#444]" />
            
            <button 
              className="flex items-center gap-2 hover:bg-[#3c3c3c] px-2 py-1 rounded -mx-1"
              onClick={handleMoreColors}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
              <span>More Colors...</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}

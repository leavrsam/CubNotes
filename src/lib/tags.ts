/**
 * Universal Tagging System Utilities for Motif
 * Manages tag definitions, palettes, inline #hashtag extraction,
 * and workspace-wide tag indexing for the Tag Hub.
 */

export interface TagDefinition {
  id: string;        // Normalized lowercase slug, e.g. "product"
  name: string;      // Display label, e.g. "Product"
  color: string;     // Hex color code, e.g. "#3b82f6"
  icon?: string;     // Optional emoji or icon identifier
}

export interface TagPinNode {
  id: string;
  x: number;
  y: number;
  tags: string[];
  label?: string;
  createdAt: number;
}

export interface TaggedItem {
  id: string;
  type: 'page' | 'text' | 'audio' | 'image' | 'file' | 'shape' | 'pin';
  pageId: string;
  pageTitle: string;
  notebookId?: string;
  notebookTitle?: string;
  sectionId?: string;
  sectionTitle?: string;
  tags: string[];
  textPreview: string;
  x?: number;
  y?: number;
  createdAt?: string | number;
}

export const TAG_PALETTE: { name: string; color: string; bg: string; border: string; text: string }[] = [
  { name: 'Indigo', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.35)', text: '#818cf8' },
  { name: 'Cyan',   color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.35)', text: '#22d3ee' },
  { name: 'Emerald',color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)', text: '#34d399' },
  { name: 'Amber',  color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)', text: '#fbbf24' },
  { name: 'Rose',   color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.35)', text: '#fb7185' },
  { name: 'Purple', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.35)', text: '#c084fc' },
  { name: 'Blue',   color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.35)', text: '#60a5fa' },
  { name: 'Orange', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.35)', text: '#fb923c' },
  { name: 'Teal',   color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.35)', text: '#2dd4bf' },
  { name: 'Pink',   color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.35)', text: '#f472b6' },
  { name: 'Lime',   color: '#84cc16', bg: 'rgba(132, 204, 22, 0.15)', border: 'rgba(132, 204, 22, 0.35)', text: '#a3e635' },
  { name: 'Violet', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.35)', text: '#a78bfa' },
];

/**
 * Normalizes a raw string into a clean tag slug:
 * e.g. "  #Meeting Notes  " -> "meeting-notes"
 */
export function normalizeTagId(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-\u00C0-\u024F]/g, '');
}

/**
 * Returns a display-friendly tag name from an ID or string:
 * e.g. "meeting-notes" -> "Meeting Notes"
 */
export function formatTagName(tag: string): string {
  const clean = tag.trim().replace(/^#+/, '');
  if (!clean) return '';
  return clean
    .split(/[-_]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Returns consistent hash-based color from TAG_PALETTE for a tag name
 */
export function getTagColor(tag: string, customRegistry?: Record<string, TagDefinition>): { color: string; bg: string; border: string; text: string } {
  const id = normalizeTagId(tag);
  if (customRegistry && customRegistry[id]?.color) {
    const customHex = customRegistry[id].color;
    return {
      color: customHex,
      bg: `${customHex}26`, // ~15% opacity hex
      border: `${customHex}59`, // ~35% opacity hex
      text: customHex,
    };
  }

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

/**
 * Extracts inline #hashtags from text or HTML:
 * e.g. "We need to fix #bug-123 before #launch!" -> ["bug-123", "launch"]
 */
export function extractInlineHashtags(textOrHtml: string): string[] {
  if (!textOrHtml) return [];
  // Strip HTML tags first
  const plain = textOrHtml.replace(/<[^>]+>/g, ' ');
  // Match hashtag pattern: starts with # followed by alphanumeric, underscore, or dash.
  // Avoid hex colors (e.g. #fff, #3b82f6) if preceded by color/style syntax
  const regex = /(?:^|\s|[([{"'])#([a-zA-Z0-9_\-\u00C0-\u024F]{2,50})(?=[)\]}"',.!?:\s]|$)/g;
  const matches = new Set<string>();
  let match;
  while ((match = regex.exec(plain)) !== null) {
    const tag = match[1];
    // Ignore pure 3- or 6-digit hex codes like #ffffff, #000, #3b82f6
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tag)) {
      matches.add(normalizeTagId(tag));
    }
  }
  return Array.from(matches);
}

const TAG_REGISTRY_STORAGE_KEY = 'cubnotes_tag_registry';

export function loadTagRegistry(): Record<string, TagDefinition> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem(TAG_REGISTRY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export function saveTagDefinition(tag: TagDefinition) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadTagRegistry();
    current[tag.id] = tag;
    localStorage.setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('cubnotes:tag_registry_updated', { detail: { tag } }));
  } catch (err) {
    console.warn("Failed to save tag definition:", err);
  }
}

export function deleteTagDefinition(tagId: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = loadTagRegistry();
    delete current[tagId];
    localStorage.setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('cubnotes:tag_registry_updated', { detail: { tagId } }));
  } catch (err) {
    console.warn("Failed to delete tag definition:", err);
  }
}

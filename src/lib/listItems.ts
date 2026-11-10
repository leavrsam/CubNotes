/**
 * Shared list-note helpers used by both the Jarvis API route and the app's
 * checklist UI, so both read and write list items the same way.
 *
 * Storage format (unchanged): each item is a line in a canvas text card, e.g.
 * `<p>- [ ] milk</p>` / `<p>- [x] eggs</p>` (or a plain `- milk` bullet, which
 * counts as unchecked), with an aligned `itemsMeta` array holding
 * `{ text, addedBy, addedByOwner }` for each line. Items are stored in their
 * original order; the UI shows unchecked items first and checked items below.
 */

export interface JarvisItemMeta {
  text: string;
  addedBy: string | null;
  addedByOwner: boolean;
}

export interface JarvisStructuredItem {
  text: string;
  item: string;
  line: string;
  checked: boolean;
  addedBy: string | null;
  addedByOwner: boolean;
}

/**
 * Helper to escape HTML characters when writing into Canvas text cards
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Splits a Canvas text card's HTML content into trimmed non-empty lines
 */
export function htmlToLines(html: string): string[] {
  if (!html) return [];
  const plain = html
    .replace(/<\/(p|li|h[1-6]|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  return plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Serializes plain text lines back into Canvas paragraph HTML
 */
export function linesToHtml(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/**
 * Parses a list line to extract its core item text, bullet/checkbox status,
 * and any legacy inline "[Added by <Speaker>]" prefix.
 */
export function parseListLine(line: string): {
  coreText: string;
  hasBullet: boolean;
  hasCheckbox: boolean;
  checked: boolean;
  inlineAddedBy: string | null;
} {
  let rest = line.trim();
  let hasBullet = false;
  let hasCheckbox = false;
  let checked = false;
  let inlineAddedBy: string | null = null;

  const extractGuest = (s: string) => {
    const m = s.match(/^\[Added by ([^\]]+)\]\s*(.*)$/i);
    if (m) {
      inlineAddedBy = m[1].trim() || "Guest";
      return m[2].trim();
    }
    return s;
  };

  for (let i = 0; i < 3; i++) {
    rest = extractGuest(rest);

    const bulletMatch = rest.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      hasBullet = true;
      rest = bulletMatch[1].trim();
    }

    rest = extractGuest(rest);

    const checkMatch = rest.match(/^\[([ xX]?)\]\s*(.*)$/);
    if (checkMatch) {
      hasCheckbox = true;
      checked = checkMatch[1].toLowerCase() === "x";
      rest = checkMatch[2].trim();
    }

    rest = extractGuest(rest);
  }

  return {
    coreText: rest.trim(),
    hasBullet,
    hasCheckbox,
    checked,
    inlineAddedBy,
  };
}

/**
 * Extracts structured items (with addedBy and addedByOwner metadata) and clean markdown content
 * from a text node's HTML content and itemsMeta array. Also supports legacy inline "[Added by ...]" prefixes.
 */
export function parseTextNodeItems(textNode: any, docLevelMeta?: any[]): {
  items: JarvisStructuredItem[];
  cleanLines: string[];
  normalizedMeta: JarvisItemMeta[];
} {
  const rawLines = htmlToLines(textNode?.content || "");
  const rawMeta: any[] = Array.isArray(textNode?.itemsMeta)
    ? textNode.itemsMeta
    : Array.isArray(docLevelMeta)
    ? docLevelMeta
    : [];

  const consumedMetaIndices = new Set<number>();
  const items: JarvisStructuredItem[] = [];
  const cleanLines: string[] = [];
  const normalizedMeta: JarvisItemMeta[] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const parsed = parseListLine(rawLines[idx]);
    const coreLower = parsed.coreText.toLowerCase();

    // 1. Try aligned index match in itemsMeta if lengths match and coreText matches
    let matchedMeta: any = null;
    if (
      rawMeta.length === rawLines.length &&
      !consumedMetaIndices.has(idx) &&
      rawMeta[idx] &&
      typeof rawMeta[idx].text === "string" &&
      parseListLine(rawMeta[idx].text).coreText.toLowerCase() === coreLower
    ) {
      matchedMeta = rawMeta[idx];
      consumedMetaIndices.add(idx);
    } else {
      // 2. Fallback: find first unconsumed meta entry with matching coreText
      for (let mIdx = 0; mIdx < rawMeta.length; mIdx++) {
        if (consumedMetaIndices.has(mIdx)) continue;
        const candidate = rawMeta[mIdx];
        if (
          candidate &&
          typeof candidate.text === "string" &&
          parseListLine(candidate.text).coreText.toLowerCase() === coreLower
        ) {
          matchedMeta = candidate;
          consumedMetaIndices.add(mIdx);
          break;
        }
      }
    }

    let addedByOwner = true;
    let addedBy: string | null = null;

    if (matchedMeta) {
      addedByOwner =
        typeof matchedMeta.addedByOwner === "boolean"
          ? matchedMeta.addedByOwner
          : parsed.inlineAddedBy
          ? false
          : true;
      addedBy =
        matchedMeta.addedBy !== undefined && matchedMeta.addedBy !== null
          ? String(matchedMeta.addedBy)
          : parsed.inlineAddedBy
          ? parsed.inlineAddedBy
          : addedByOwner
          ? null
          : "Guest";
    } else if (parsed.inlineAddedBy) {
      addedByOwner = false;
      addedBy = parsed.inlineAddedBy;
    }

    const cleanLine = parsed.hasCheckbox
      ? `${parsed.checked ? "- [x]" : "- [ ]"} ${parsed.coreText}`
      : parsed.hasBullet
      ? `- ${parsed.coreText}`
      : parsed.coreText;

    cleanLines.push(cleanLine);
    normalizedMeta.push({
      text: parsed.coreText,
      addedBy,
      addedByOwner,
    });
    items.push({
      text: parsed.coreText,
      item: parsed.coreText,
      line: cleanLine,
      checked: parsed.checked,
      addedBy,
      addedByOwner,
    });
  }

  return { items, cleanLines, normalizedMeta };
}

// ---------------------------------------------------------------------------
// Checklist (Google Keep style) helpers
// ---------------------------------------------------------------------------

/** One checklist row. `meta` keeps any extra fields so nothing is lost on save. */
export interface ChecklistItem {
  text: string;
  checked: boolean;
  addedBy: string | null;
  addedByOwner: boolean;
  meta?: Record<string, unknown>;
}

const NUMBER_WORDS =
  "a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|couple|few|some|several";
const UNIT_WORDS =
  "x|lbs?|pounds?|oz|ounces?|kg|kgs?|g|grams?|l|liters?|litres?|ml|gal|gallons?|qt|quarts?|pt|pints?|cups?|tbsp|tsp|" +
  "packs?|packets?|packages?|pkgs?|bags?|boxe?s?|cans?|bottles?|jars?|cartons?|bunche?s?|heads?|loave?s?|loafs?|" +
  "dozens?|pieces?|pcs|rolls?|sticks?|cases?|tubs?|containers?|blocks?|slices?|bars?";
const LEADING_QTY = new RegExp(
  `^(?:(?:\\d+(?:[.,/]\\d+)?|(?:${NUMBER_WORDS})\\b)\\s*(?:-\\s*)?(?:(?:${UNIT_WORDS})\\b)?\\.?\\s*(?:of\\s+)?)+`,
  "i"
);

function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes|zes|oes)$/.test(word)) return word.slice(0, -2);
  if (/ves$/.test(word)) return word.slice(0, -3) + "f";
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Key used to decide whether two list items are "the same thing".
 * Ignores case, plurals, leading quantities ("2 lbs", "a dozen", "3x")
 * and anything in parentheses. "2 Apples (green)" and "apple" match.
 */
export function normalizeItemKey(text: string): string {
  let s = parseListLine(text || "").coreText.toLowerCase();
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s'/.,-]/gu, " ").replace(/\s+/g, " ").trim();
  const withoutQty = s.replace(LEADING_QTY, "").trim();
  if (withoutQty) s = withoutQty; // never reduce an item to nothing ("Dozen" stays "dozen")
  s = s.replace(/[.,'-]/g, " ").replace(/\s+/g, " ").trim();
  return s.split(" ").map(singularize).join(" ");
}

export function itemsMatch(a: string, b: string): boolean {
  const ka = normalizeItemKey(a);
  return ka.length > 0 && ka === normalizeItemKey(b);
}

/** Reads a text card into checklist items, in stored order. */
export function parseChecklist(textNode: { content?: string; itemsMeta?: unknown }): ChecklistItem[] {
  const rawMeta: any[] = Array.isArray(textNode?.itemsMeta) ? (textNode.itemsMeta as any[]) : [];
  const { items, normalizedMeta } = parseTextNodeItems(textNode);
  return items
    .map((it, i) => {
      // Carry over any extra fields stored on the original meta entry (by text match)
      const original = rawMeta.find(
        (m) => m && typeof m.text === "string" && parseListLine(m.text).coreText.toLowerCase() === it.text.toLowerCase()
      );
      const { text: _t, addedBy: _a, addedByOwner: _o, ...extra } = (original || {}) as Record<string, unknown>;
      return {
        text: it.text,
        checked: it.checked,
        addedBy: normalizedMeta[i]?.addedBy ?? it.addedBy,
        addedByOwner: normalizedMeta[i]?.addedByOwner ?? it.addedByOwner,
        meta: Object.keys(extra).length ? extra : undefined,
      };
    })
    .filter((it) => it.text.length > 0);
}

/** Writes checklist items back to a text card's `content` + aligned `itemsMeta`. */
export function serializeChecklist(items: ChecklistItem[]): { content: string; itemsMeta: JarvisItemMeta[] } {
  const kept = items.filter((it) => it.text.trim().length > 0);
  return {
    content: linesToHtml(kept.map((it) => `${it.checked ? "- [x]" : "- [ ]"} ${it.text.trim()}`)),
    itemsMeta: kept.map((it) => ({
      ...(it.meta || {}),
      text: it.text.trim(),
      addedBy: it.addedBy,
      addedByOwner: it.addedByOwner,
    })),
  };
}

/** Unchecked first, then checked; original order kept within each group. */
export function splitChecklist(items: ChecklistItem[]) {
  const unchecked: { item: ChecklistItem; index: number }[] = [];
  const checked: { item: ChecklistItem; index: number }[] = [];
  items.forEach((item, index) => (item.checked ? checked : unchecked).push({ item, index }));
  return { unchecked, checked };
}

export type AddItemOutcome = "added" | "movedFromChecked" | "alreadyOnList";

/**
 * Adds an item Keep-style:
 * - a checked match is unchecked instead of adding a duplicate ("movedFromChecked");
 * - if a match is already unchecked, any checked copies are removed and
 *   nothing new is added ("alreadyOnList");
 * - otherwise the item is appended ("added").
 * Matched items keep their addedBy/addedByOwner metadata.
 */
export function addItemToChecklist(
  items: ChecklistItem[],
  text: string,
  meta: { addedBy: string | null; addedByOwner: boolean }
): { items: ChecklistItem[]; outcome: AddItemOutcome } {
  const coreText = parseListLine(text).coreText.trim();
  if (!coreText) return { items, outcome: "added" };

  const hasUncheckedMatch = items.some((it) => !it.checked && itemsMatch(it.text, coreText));
  const firstCheckedIdx = items.findIndex((it) => it.checked && itemsMatch(it.text, coreText));

  if (hasUncheckedMatch) {
    if (firstCheckedIdx === -1) {
      return { items: [...items, { text: coreText, checked: false, ...meta }], outcome: "added" };
    }
    return {
      items: items.filter((it) => !(it.checked && itemsMatch(it.text, coreText))),
      outcome: "alreadyOnList",
    };
  }

  if (firstCheckedIdx !== -1) {
    const next = items
      .map((it, i) => (i === firstCheckedIdx ? { ...it, checked: false } : it))
      // drop any other checked duplicates of the same item
      .filter((it, i) => i === firstCheckedIdx || !(it.checked && itemsMatch(it.text, coreText)));
    return { items: next, outcome: "movedFromChecked" };
  }

  return { items: [...items, { text: coreText, checked: false, ...meta }], outcome: "added" };
}

const LIST_LINE = /^\s*(?:[-*•]\s+|\[[ xX]?\]\s*)/;

/**
 * Whether a text card should show as a checklist. A card is a checklist when
 * it is explicitly marked as one, or it sits in a list note (the same "title
 * contains 'list'" rule Jarvis uses) and is a Jarvis-managed card (has
 * `itemsMeta`) or every line is a bullet/checkbox line.
 */
export function isChecklistCard(
  textNode: { content?: string; itemsMeta?: unknown; checklist?: boolean },
  pageTitle?: string
): boolean {
  if (textNode?.checklist === true) return true;
  if (textNode?.checklist === false) return false;
  if (!/list/i.test(pageTitle || "")) return false;
  const lines = htmlToLines(textNode?.content || "");
  if (lines.length === 0) return false;
  if (Array.isArray(textNode?.itemsMeta)) return true;
  return lines.every((l) => LIST_LINE.test(l));
}

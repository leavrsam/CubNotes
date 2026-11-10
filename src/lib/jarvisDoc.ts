/**
 * Pure document operations behind /api/jarvis list actions. Every operation
 * works on the page's `document_state` — the same document the canvas editor
 * renders — so the API and the editor can never disagree.
 */
import {
  htmlToLines,
  isChecklistCard,
  itemsMatch,
  linesToHtml,
  parseChecklist,
  parseListLine,
  parseTextNodeItems,
  serializeChecklist,
  type ChecklistItem,
  type JarvisItemMeta,
  type JarvisStructuredItem,
} from "./listItems";

type Doc = Record<string, any>;
type TextCard = Record<string, any>;

export type AppendOutcome = "added" | "movedFromChecked" | "alreadyOnList";

/** Marks a document as changed now (also lets open editors treat it as newer). */
export function stampDoc(doc: Doc, now: Date = new Date()): Doc {
  return { ...doc, _clientUpdatedAt: now.getTime(), _updatedAt: now.toISOString() };
}

/** Last-changed time of a page: our stamp, else the row's updated_at/created_at. */
export function docUpdatedAt(doc: Doc | null | undefined, fallback?: string | null): string | null {
  if (doc && typeof doc._updatedAt === "string") return doc._updatedAt;
  if (doc && typeof doc._clientUpdatedAt === "number" && doc._clientUpdatedAt > 0) {
    return new Date(doc._clientUpdatedAt).toISOString();
  }
  return fallback ?? null;
}

function textsOf(doc: Doc | null | undefined): TextCard[] {
  return Array.isArray(doc?.texts) ? doc!.texts : [];
}

function isListCard(card: TextCard, pageTitle: string, isListNote: boolean): boolean {
  // Jarvis treats a note as a list when note_type is "list" or the title says "list"
  return isChecklistCard(card, isListNote ? `${pageTitle} list` : pageTitle);
}

function listCardIndexes(doc: Doc, pageTitle: string, isListNote: boolean): number[] {
  return textsOf(doc)
    .map((t, i) => (isListCard(t, pageTitle, isListNote) ? i : -1))
    .filter((i) => i >= 0);
}

/** Where to put a new card so it never covers existing content. */
function nextCardY(texts: TextCard[]): number {
  let y = 280;
  for (const t of texts) {
    const lines = Math.max(1, htmlToLines(t?.content || "").length);
    y = Math.max(y, (Number(t?.y) || 0) + lines * 28 + 48);
  }
  return Math.round(y);
}

function newCardId(): string {
  const c: any = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Items as the page shows them. For a list note that has checklist cards, only
 * those cards' items are returned (hand-typed text elsewhere on the page is not
 * a list item). Otherwise every line is returned, as before.
 */
export function readItems(doc: Doc, pageTitle: string, isListNote: boolean): {
  items: JarvisStructuredItem[];
  plainContent: string;
} {
  const texts = textsOf(doc);
  const docLevelMeta = Array.isArray(doc?.itemsMeta) ? doc.itemsMeta : undefined;
  const listIdx = new Set(listCardIndexes(doc, pageTitle, isListNote));
  const items: JarvisStructuredItem[] = [];
  const lines: string[] = [];
  texts.forEach((t, i) => {
    const parsed = parseTextNodeItems(t, docLevelMeta);
    lines.push(...parsed.cleanLines);
    if (listIdx.size === 0 || listIdx.has(i)) {
      items.push(...parsed.items.filter((it) => it.text.length > 0));
    }
  });
  return { items, plainContent: lines.join("\n") };
}

/**
 * Append one item. For list notes: Keep-style — a checked copy is moved back
 * (unchecked) instead of duplicating; if an unchecked copy already exists the
 * checked copies are removed; otherwise one unchecked item is added at the end
 * of the list card (a new card is created below existing content if needed —
 * hand-typed cards are never rewritten). For other notes the text is appended
 * to the first card, as before.
 */
export function appendToDoc(
  doc: Doc,
  opts: { pageTitle: string; isListNote: boolean; text: string; addedBy: string | null; addedByOwner: boolean }
): { doc: Doc; outcome: AppendOutcome } {
  const texts = [...textsOf(doc)];
  const meta = { addedBy: opts.addedBy, addedByOwner: opts.addedByOwner };
  const coreText = parseListLine(opts.text).coreText.trim();
  const isListNote = opts.isListNote || listCardIndexes(doc, opts.pageTitle, false).length > 0;

  if (!isListNote) {
    // Plain note: append the text as a new line of the first card (previous behaviour)
    const line = opts.text.trim();
    const entry: JarvisItemMeta = { text: coreText || line, ...meta };
    if (texts.length === 0) {
      texts.push({ id: newCardId(), x: 64, y: 280, width: 480, content: linesToHtml([line]), itemsMeta: [entry] });
    } else {
      const first = texts[0];
      const existingMeta = Array.isArray(first.itemsMeta) ? first.itemsMeta : parseTextNodeItems(first).normalizedMeta;
      texts[0] = { ...first, content: (first.content || "") + linesToHtml([line]), itemsMeta: [...existingMeta, entry] };
    }
    return { doc: { ...doc, texts }, outcome: "added" };
  }

  const listIdx = listCardIndexes({ ...doc, texts }, opts.pageTitle, true);
  const parsed = new Map<number, ChecklistItem[]>(listIdx.map((i) => [i, parseChecklist(texts[i])]));

  // Keep-style dedupe across all list cards on the page
  const hasUnchecked = [...parsed.values()].some((items) => items.some((it) => !it.checked && itemsMatch(it.text, coreText)));
  const checkedHits: { card: number; item: number }[] = [];
  parsed.forEach((items, card) =>
    items.forEach((it, item) => {
      if (it.checked && itemsMatch(it.text, coreText)) checkedHits.push({ card, item });
    })
  );

  if (checkedHits.length > 0) {
    const keep = hasUnchecked ? null : checkedHits[0];
    for (const card of new Set(checkedHits.map((h) => h.card))) {
      const next = parsed
        .get(card)!
        .map((it, i) => (keep && keep.card === card && keep.item === i ? { ...it, checked: false } : it))
        .filter((it, i) => (keep && keep.card === card && keep.item === i) || !(it.checked && itemsMatch(it.text, coreText)));
      texts[card] = { ...texts[card], ...serializeChecklist(next), checklist: true };
    }
    return { doc: { ...doc, texts }, outcome: keep ? "movedFromChecked" : "alreadyOnList" };
  }

  const newItem: ChecklistItem = { text: coreText, checked: false, ...meta };
  if (listIdx.length > 0) {
    const target = listIdx[listIdx.length - 1];
    texts[target] = { ...texts[target], ...serializeChecklist([...parsed.get(target)!, newItem]), checklist: true };
  } else {
    texts.push({ id: newCardId(), x: 64, y: nextCardY(texts), width: 480, ...serializeChecklist([newItem]), checklist: true });
  }
  return { doc: { ...doc, texts }, outcome: "added" };
}

/**
 * Check/uncheck or remove the first item whose text equals `itemText`
 * (case-insensitive, trimmed). List cards are searched first. Only the card
 * that holds the item is rewritten; every other card is left byte-for-byte.
 */
export function updateItemInDoc(
  doc: Doc,
  opts: { pageTitle: string; isListNote: boolean; itemText: string; action: "check" | "remove"; checked?: boolean }
): { doc: Doc; matched: boolean } {
  const target = parseListLine(opts.itemText).coreText.trim().toLowerCase();
  const texts = [...textsOf(doc)];
  if (!target) return { doc, matched: false };
  const docLevelMeta = Array.isArray(doc?.itemsMeta) ? doc.itemsMeta : undefined;
  const listIdx = listCardIndexes(doc, opts.pageTitle, opts.isListNote);
  const order = [...listIdx, ...texts.map((_, i) => i).filter((i) => !listIdx.includes(i))];

  for (const cardIdx of order) {
    const card = texts[cardIdx];
    if (listIdx.includes(cardIdx)) {
      const items = parseChecklist({ content: card.content, itemsMeta: Array.isArray(card.itemsMeta) ? card.itemsMeta : docLevelMeta });
      const hit = items.findIndex((it) => it.text.trim().toLowerCase() === target);
      if (hit === -1) continue;
      const next =
        opts.action === "remove"
          ? items.filter((_, i) => i !== hit)
          : items.map((it, i) => (i === hit ? { ...it, checked: opts.checked !== false } : it));
      texts[cardIdx] = { ...card, ...serializeChecklist(next) };
      return { doc: { ...doc, texts }, matched: true };
    }
    // Non-list card: same line-level edit as before, applied to this card only
    const { items, cleanLines, normalizedMeta } = parseTextNodeItems(card, docLevelMeta);
    const hit = items.findIndex((it) => it.text.toLowerCase() === target);
    if (hit === -1) continue;
    const lines = [...cleanLines];
    const meta = [...normalizedMeta];
    if (opts.action === "remove") {
      lines.splice(hit, 1);
      meta.splice(hit, 1);
    } else {
      lines[hit] = `${opts.checked !== false ? "- [x]" : "- [ ]"} ${items[hit].text}`;
    }
    texts[cardIdx] = { ...card, content: linesToHtml(lines), itemsMeta: meta };
    return { doc: { ...doc, texts }, matched: true };
  }
  return { doc, matched: false };
}

/**
 * Pure helpers for keeping the canvas editor in sync with the page's saved
 * document (`pages.document_state`), which is the single source of truth for
 * both the editor and the Jarvis API.
 *
 * Key rule: the editor's local cache only wins over the server when it holds
 * real unsaved edits — and even then, changes made on the server (e.g. list
 * items added by Jarvis) are merged in instead of being overwritten.
 */
import { itemsMatch, parseChecklist, serializeChecklist, type ChecklistItem } from "./listItems";

export const CORE_KEYS = [
  "strokes",
  "texts",
  "audios",
  "images",
  "files",
  "videos",
  "shapes",
  "connectors",
  "pageTags",
  "tagPins",
] as const;

type AnyDoc = Record<string, any>;

/** Stable fingerprint of the user-visible parts of a document. */
export function stateKey(doc: AnyDoc | null | undefined): string {
  const d = doc || {};
  return JSON.stringify(CORE_KEYS.map((k) => d[k] || []));
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const itemKey = (it: ChecklistItem) => it.text.trim().toLowerCase();

/**
 * Three-way merge of checklist items. `base` is the last version both sides
 * agreed on (null when unknown). Local edits win on conflict; items added or
 * checked/unchecked/removed only on the server are carried over.
 */
function mergeChecklistItems(base: ChecklistItem[] | null, local: ChecklistItem[], remote: ChecklistItem[]): ChecklistItem[] {
  const find = (list: ChecklistItem[] | null, it: ChecklistItem) => list?.find((x) => itemKey(x) === itemKey(it));
  const result: ChecklistItem[] = [];
  for (const it of local) {
    const r = find(remote, it);
    const b = find(base, it);
    if (!r) {
      // Removed on the server: drop it only if we know it existed before and we didn't change it
      if (b && b.checked === it.checked) continue;
      result.push(it);
      continue;
    }
    // Checked state changed only on the server -> take the server's state
    if (b && b.checked === it.checked && r.checked !== it.checked) result.push({ ...it, checked: r.checked });
    else result.push(it);
  }
  for (const r of remote) {
    if (find(local, r)) continue;
    if (base && find(base, r)) continue; // existed before, so the local side deleted it on purpose
    if (!base && result.some((x) => itemsMatch(x.text, r.text))) continue;
    result.push(r);
  }
  return result;
}

function isListLike(node: AnyDoc | undefined): boolean {
  return !!node && (node.checklist === true || Array.isArray(node.itemsMeta));
}

function mergeTexts(base: AnyDoc[] | null, local: AnyDoc[], remote: AnyDoc[]): AnyDoc[] {
  const byId = (list: AnyDoc[] | null) => new Map((list || []).map((n) => [n.id, n]));
  const baseMap = byId(base);
  const remoteMap = byId(remote);
  const localIds = new Set(local.map((n) => n.id));
  const result: AnyDoc[] = [];

  for (const l of local) {
    const r = remoteMap.get(l.id);
    const b = base ? baseMap.get(l.id) : undefined;
    if (!r) {
      // Deleted on the server: honour it only if we know the local copy is untouched
      if (b && same(b, l)) continue;
      result.push(l);
      continue;
    }
    if (b && same(b, l)) {
      result.push(r); // untouched locally -> take server version
    } else if (b && same(b, r)) {
      result.push(l); // untouched on server -> keep local edit
    } else if (same(l, r)) {
      result.push(l);
    } else if (isListLike(l) || isListLike(r)) {
      // Both sides changed a list card: merge item by item
      const items = mergeChecklistItems(b ? parseChecklist(b) : null, parseChecklist(l), parseChecklist(r));
      result.push({ ...r, ...l, ...serializeChecklist(items), checklist: l.checklist ?? r.checklist });
    } else {
      result.push(l); // both changed rich text -> local edit wins
    }
  }
  for (const r of remote) {
    if (localIds.has(r.id)) continue;
    if (base && baseMap.has(r.id)) continue; // deleted locally on purpose
    result.push(r); // new on the server (e.g. a card created by Jarvis)
  }
  return result;
}

/**
 * Merge server changes into the local document.
 * @param base   last state known to match the server (null if unknown)
 * @param local  what the editor currently has (may contain unsaved edits)
 * @param remote what the server has now
 */
export function mergeDocStates(base: AnyDoc | null, local: AnyDoc, remote: AnyDoc): AnyDoc {
  const merged: AnyDoc = { ...remote, ...local };
  for (const key of CORE_KEYS) {
    const l = local[key] || [];
    const r = remote[key] || [];
    const b = base ? base[key] || [] : null;
    if (key === "texts") {
      merged.texts = mergeTexts(b, l, r);
    } else if (b && same(b, l)) {
      merged[key] = r; // untouched locally
    } else {
      merged[key] = l;
    }
  }
  return merged;
}

/**
 * Decide what to show after fetching the server copy on page load.
 * - No unsaved local edits: the server copy is the truth, show it as-is.
 * - Unsaved local edits: keep them, merge server-only changes in, and save.
 */
export function resolveLoadedState(opts: {
  remote: AnyDoc;
  local: AnyDoc | null;
  hasUnsavedLocalEdits: boolean;
  base?: AnyDoc | null;
}): { state: AnyDoc; needsSave: boolean } {
  const { remote, local, hasUnsavedLocalEdits, base = null } = opts;
  if (!hasUnsavedLocalEdits || !local) return { state: remote, needsSave: false };
  const merged = mergeDocStates(base, local, remote);
  return { state: merged, needsSave: stateKey(merged) !== stateKey(remote) };
}

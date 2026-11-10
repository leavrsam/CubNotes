// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

/**
 * Runs the real page-loading hook used by the canvas editor (desktop and
 * mobile) against a fake Supabase + in-memory offline cache, reproducing the
 * Shopping List bug: Jarvis wrote items to the page, but an editor with an
 * older cached copy showed (and re-saved) the empty page.
 */

const PAGE_ID = "cf69a977-a2f9-487d-bb64-d0909e6aa3fc";

const server = {
  doc: {} as any,
  updates: [] as any[],
  realtime: null as null | ((payload: any) => void),
};
const cache = new Map<string, { pageId: string; documentState: any; updatedAt: number; isDirty: boolean }>();

vi.mock("@/lib/supabase/client", () => {
  const client = {
    from: (table: string) => {
      const chain: any = {
        _update: null as any,
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: async () => ({ data: null, error: null }),
        update: (values: any) => {
          chain._update = values;
          return chain;
        },
        single: async () => ({ data: table === "pages" ? { document_state: structuredClone(server.doc) } : null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        then: (res: any, rej: any) => {
          if (table === "pages" && chain._update) {
            server.doc = structuredClone(chain._update.document_state);
            server.updates.push(structuredClone(chain._update.document_state));
          }
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        },
      };
      return chain;
    },
    channel: () => {
      const ch: any = {
        on: (_type: string, _filter: any, cb: (payload: any) => void) => {
          server.realtime = cb;
          return ch;
        },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: () => {},
  };
  return { createClient: () => client };
});

vi.mock("@/lib/offlineStore", () => ({
  getCachedPageState: async (id: string) => cache.get(id)?.documentState ?? null,
  getCachedPageRecord: async (id: string) => cache.get(id) ?? null,
  setCachedPageState: async (id: string, state: any, isDirty = false) => {
    cache.set(id, { pageId: id, documentState: state, updatedAt: state?._clientUpdatedAt || Date.now(), isDirty });
  },
  queueOfflineSync: async () => {},
  getPendingSyncActions: async () => [],
  removeSyncAction: async () => {},
  replayPendingSync: async () => 0,
}));

const { useCanvasData } = await import("@/hooks/useCanvasData");

const listCard = (lines: string[]) => ({
  id: "list",
  x: 64,
  y: 280,
  width: 480,
  content: lines.map((l) => `<p>- [ ] ${l}</p>`).join(""),
  itemsMeta: lines.map((l) => ({ text: l, addedBy: "Samuel", addedByOwner: true })),
});

describe("canvas editor shows what the API saved", () => {
  beforeEach(() => {
    cache.clear();
    server.updates = [];
    server.realtime = null;
    // The editor opened the empty page on Nov 6, so its cache holds the empty page
    // (stamped "now", which used to make the cache look newer than the server).
    cache.set(PAGE_ID, { pageId: PAGE_ID, documentState: { texts: [] }, updatedAt: Date.now(), isDirty: false });
    // Since then Jarvis added milk and sour cream to the page on the server
    server.doc = { texts: [listCard(["milk", "sour cream"])], _clientUpdatedAt: Date.now() - 60_000 };
  });
  afterEach(() => vi.useRealTimers());

  it("loads the items Jarvis added and never pushes the stale empty cache back", async () => {
    const { result } = renderHook(() => useCanvasData(PAGE_ID));
    await waitFor(() => expect(result.current.texts).toHaveLength(1));
    expect(result.current.texts[0].content).toBe("<p>- [ ] milk</p><p>- [ ] sour cream</p>");

    await new Promise((r) => setTimeout(r, 1800)); // longer than the 1.5s autosave debounce
    expect(server.updates.filter((d) => (d.texts || []).length === 0)).toHaveLength(0);
    expect(server.doc.texts[0].content).toContain("sour cream");
  });

  it("an open editor picks up a live update from the API", async () => {
    const { result } = renderHook(() => useCanvasData(PAGE_ID));
    await waitFor(() => expect(result.current.texts).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));

    const next = { texts: [listCard(["milk", "sour cream", "eggs"])], _clientUpdatedAt: Date.now() };
    server.doc = next;
    act(() => server.realtime!({ new: { document_state: next } }));
    await waitFor(() => expect(result.current.texts[0].content).toContain("eggs"));
  });

  it("an open editor refetches on focus if a live update was missed", async () => {
    const { result } = renderHook(() => useCanvasData(PAGE_ID));
    await waitFor(() => expect(result.current.texts).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 2100)); // focus refetch is throttled to every 2s

    server.doc = { texts: [listCard(["milk", "sour cream", "butter"])], _clientUpdatedAt: Date.now() };
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.texts[0].content).toContain("butter"));
  });

  it("real edits after loading are still saved", async () => {
    const { result } = renderHook(() => useCanvasData(PAGE_ID));
    await waitFor(() => expect(result.current.texts).toHaveLength(1));
    act(() => {
      result.current.setTexts((prev: any[]) => [...prev, { id: "typed", x: 64, y: 500, width: 480, content: "<p>hello</p>" }]);
    });
    await waitFor(() => expect(server.updates.some((d) => d.texts?.some((t: any) => t.id === "typed"))).toBe(true), { timeout: 3000 });
    expect(server.doc.texts.map((t: any) => t.id)).toEqual(["list", "typed"]);
  });

  it("unsaved local edits survive, and server items are merged in", async () => {
    cache.set(PAGE_ID, {
      pageId: PAGE_ID,
      documentState: { texts: [{ id: "typed", x: 64, y: 600, width: 480, content: "<p>offline note</p>" }] },
      updatedAt: Date.now(),
      isDirty: true,
    });
    const { result } = renderHook(() => useCanvasData(PAGE_ID));
    await waitFor(() => expect(result.current.texts.map((t: any) => t.id).sort()).toEqual(["list", "typed"]));
    await waitFor(() => expect(server.doc.texts.map((t: any) => t.id).sort()).toEqual(["list", "typed"]), { timeout: 3000 });
  });
});

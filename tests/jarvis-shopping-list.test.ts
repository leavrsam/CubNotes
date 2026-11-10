import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeDb, type FakePage } from "./fakeSupabase";
import { isChecklistCard, parseChecklist, type ChecklistItem } from "@/lib/listItems";
import { resolveLoadedState, mergeDocStates } from "@/lib/docSync";

// The route builds its Supabase client with createClient(); hand it our fake.
let fake: ReturnType<typeof createFakeDb>;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fake.client }));
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake.supabase";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key";

const { POST } = await import("@/app/api/jarvis/route");

const PAGE_ID = "cf69a977-a2f9-487d-bb64-d0909e6aa3fc";
const CREATED_AT = "2026-11-06T19:15:27Z";

function shoppingListPage(documentState: any = {}): FakePage {
  return { id: PAGE_ID, title: "Shopping List", notebook: "Household", created_at: CREATED_AT, document_state: documentState };
}

async function jarvis(body: Record<string, unknown>) {
  const req = new NextRequest("https://motif.wolfcubventures.com/api/jarvis", {
    method: "POST",
    headers: { "content-type": "application/json", "x-jarvis-key": "test-key" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as any };
}

const base = { title: "Shopping List", notebook: "Household", note_type: "list", speaker: "Samuel", isAuthorizedOwner: true };
const simplify = (items: any[]) => items.map((i) => ({ text: i.text, checked: i.checked }));

/** What the canvas editor shows after loading the page (stale cache, no unsaved edits). */
function loadPageInEditor(staleCache: any) {
  const remote = fake.db.pages.find((p) => p.id === PAGE_ID)!.document_state;
  const { state } = resolveLoadedState({ remote, local: staleCache, hasUnsavedLocalEdits: false });
  const cards = (state.texts || []).filter((t: any) => isChecklistCard(t, "Shopping List"));
  const items: ChecklistItem[] = cards.flatMap((c: any) => parseChecklist(c));
  return { state, items };
}

describe("Jarvis shopping list writes to the page the editor renders", () => {
  beforeEach(() => {
    fake = createFakeDb([shoppingListPage({})]);
  });

  it("append milk, append sour cream, read, load the page", async () => {
    const staleCache = structuredClone(fake.db.pages[0].document_state); // editor opened the empty page earlier

    const r0 = await jarvis({ ...base, action: "read" });
    expect(r0.body.success).toBe(true);
    expect(r0.body.items).toEqual([]);
    expect(r0.body.note.updated_at).toBe(CREATED_AT);

    const a1 = await jarvis({ ...base, action: "append", text: "milk" });
    expect(a1.status).toBe(200);
    expect(a1.body.success).toBe(true);
    expect(a1.body.items).toMatchObject([{ text: "milk", checked: false, addedBy: "Samuel", addedByOwner: true }]);

    const a2 = await jarvis({ ...base, action: "append", text: "sour cream" });
    expect(a2.body.success).toBe(true);
    expect(simplify(a2.body.items)).toEqual([
      { text: "milk", checked: false },
      { text: "sour cream", checked: false },
    ]);
    // content is the whole list, not just the latest item
    expect(a2.body.updatedNote.content).toContain("milk");
    expect(a2.body.updatedNote.content).toContain("sour cream");

    const r1 = await jarvis({ ...base, action: "read" });
    expect(simplify(r1.body.items)).toEqual([
      { text: "milk", checked: false },
      { text: "sour cream", checked: false },
    ]);
    expect(r1.body.items[0]).toMatchObject({ addedBy: "Samuel", addedByOwner: true });
    expect(new Date(r1.body.note.updated_at).getTime()).toBeGreaterThan(new Date(CREATED_AT).getTime());

    // The editor shows both items even though its cache is the old empty page
    const page = loadPageInEditor(staleCache);
    expect(page.items.map((i) => [i.text, i.checked])).toEqual([
      ["milk", false],
      ["sour cream", false],
    ]);
    // ...and read returns exactly what the page shows
    expect(page.items.map((i) => ({ text: i.text, checked: i.checked }))).toEqual(simplify(r1.body.items));
  });

  it("check true/false sets the checked state and bumps updated_at", async () => {
    await jarvis({ ...base, action: "append", text: "milk" });
    await jarvis({ ...base, action: "append", text: "sour cream" });
    const before = (await jarvis({ ...base, action: "read" })).body.note.updated_at;
    await new Promise((r) => setTimeout(r, 5));

    const c1 = await jarvis({ ...base, action: "check", item: "  MILK ", checked: true });
    expect(c1.body.success).toBe(true);
    expect(simplify(c1.body.items)).toEqual([
      { text: "milk", checked: true },
      { text: "sour cream", checked: false },
    ]);
    expect(c1.body.items[0]).toMatchObject({ addedBy: "Samuel", addedByOwner: true });
    expect(new Date(c1.body.note.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime());
    expect(loadPageInEditor(null).items.find((i) => i.text === "milk")!.checked).toBe(true);

    const c2 = await jarvis({ ...base, action: "check", item: "milk", checked: false });
    expect(c2.body.success).toBe(true);
    expect(c2.body.items[0]).toMatchObject({ text: "milk", checked: false });
  });

  it("remove deletes one item", async () => {
    await jarvis({ ...base, action: "append", text: "milk" });
    await jarvis({ ...base, action: "append", text: "sour cream" });
    const r = await jarvis({ ...base, action: "remove", item: "Milk" });
    expect(r.body.success).toBe(true);
    expect(simplify(r.body.items)).toEqual([{ text: "sour cream", checked: false }]);
    expect(loadPageInEditor(null).items.map((i) => i.text)).toEqual(["sour cream"]);
  });

  it("unknown item returns an error and changes nothing", async () => {
    await jarvis({ ...base, action: "append", text: "milk" });
    const before = structuredClone(fake.db.pages[0].document_state);
    for (const action of ["check", "remove"]) {
      const r = await jarvis({ ...base, action, item: "caviar", checked: true });
      expect(r.status).toBe(404);
      expect(r.body.success).toBe(false);
      expect(r.body.error).toMatch(/not found/i);
    }
    expect(fake.db.pages[0].document_state).toEqual(before);
  });

  it("keeps hand-typed content on the page", async () => {
    const handTyped = {
      id: "hand-1",
      x: 64,
      y: 280,
      width: 480,
      content: "<h2>Costco run</h2><p>Bring the <strong>coupons</strong> and bags</p>",
    };
    fake = createFakeDb([shoppingListPage({ texts: [handTyped], strokes: [{ id: "s1" }] })]);

    await jarvis({ ...base, action: "append", text: "milk" });
    await jarvis({ ...base, action: "append", text: "sour cream" });
    await jarvis({ ...base, action: "check", item: "milk", checked: true });

    const doc = fake.db.pages[0].document_state;
    expect(doc.texts[0]).toEqual(handTyped); // byte-for-byte untouched
    expect(doc.strokes).toEqual([{ id: "s1" }]);
    expect(doc.texts[1].y).toBeGreaterThan(handTyped.y); // list card sits below it

    const read = await jarvis({ ...base, action: "read" });
    expect(simplify(read.body.items)).toEqual([
      { text: "milk", checked: true },
      { text: "sour cream", checked: false },
    ]);
    expect(read.body.note.content).toContain("Costco run");
  });

  it("appends to an existing checklist without overwriting it", async () => {
    fake = createFakeDb([
      shoppingListPage({
        texts: [{ id: "list", x: 64, y: 280, width: 480, content: "<p>- [ ] eggs</p><p>- [x] bread</p>", itemsMeta: [
          { text: "eggs", addedBy: "Ann", addedByOwner: false },
          { text: "bread", addedBy: null, addedByOwner: true },
        ] }],
      }),
    ]);
    const r = await jarvis({ ...base, action: "append", text: "milk" });
    expect(simplify(r.body.items)).toEqual([
      { text: "eggs", checked: false },
      { text: "bread", checked: true },
      { text: "milk", checked: false },
    ]);
    expect(r.body.items[0]).toMatchObject({ addedBy: "Ann", addedByOwner: false });
    expect(fake.db.pages[0].document_state.texts).toHaveLength(1);
  });

  it("never reports success when the write fails", async () => {
    fake.db.failNextUpdate = true;
    const r = await jarvis({ ...base, action: "append", text: "milk" });
    expect(r.body.success).toBe(false);
    expect(r.body.error).toBeTruthy();
    expect((await jarvis({ ...base, action: "read" })).body.items).toEqual([]);
  });

  it("re-adding a checked item moves it back instead of duplicating", async () => {
    await jarvis({ ...base, action: "append", text: "milk" });
    await jarvis({ ...base, action: "check", item: "milk", checked: true });
    const r = await jarvis({ ...base, action: "append", text: "2 Milks", speaker: "Guest", isAuthorizedOwner: false });
    // guests are routed to the Household notebook, which is where this list lives
    expect(r.body.success).toBe(true);
    expect(r.body.message).toBe("Moved back from Checked");
    expect(r.body.items).toMatchObject([{ text: "milk", checked: false, addedBy: "Samuel", addedByOwner: true }]);
  });

  it("creates the page on first append when it does not exist", async () => {
    fake = createFakeDb([]);
    const r = await jarvis({ ...base, action: "append", text: "milk" });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.items).toMatchObject([{ text: "milk", checked: false }]);
  });
});

describe("editor loading never hides or overwrites server changes", () => {
  const serverDoc = {
    texts: [{ id: "list", x: 64, y: 280, width: 480, content: "<p>- [ ] milk</p><p>- [ ] sour cream</p>", itemsMeta: [
      { text: "milk", addedBy: "Samuel", addedByOwner: true },
      { text: "sour cream", addedBy: "Samuel", addedByOwner: true },
    ] }],
  };

  it("a stale cache without unsaved edits shows the server copy", () => {
    const { state, needsSave } = resolveLoadedState({ remote: serverDoc, local: { texts: [] }, hasUnsavedLocalEdits: false });
    expect(state).toBe(serverDoc);
    expect(needsSave).toBe(false);
  });

  it("unsaved local edits are kept and server items are merged in", () => {
    const local = { texts: [{ id: "note", x: 64, y: 600, width: 480, content: "<p>typed offline</p>" }] };
    const { state, needsSave } = resolveLoadedState({ remote: serverDoc, local, hasUnsavedLocalEdits: true });
    expect(needsSave).toBe(true);
    expect(state.texts.map((t: any) => t.id)).toEqual(["note", "list"]);
  });

  it("while typing in a list, a Jarvis item arriving live is merged, not lost", () => {
    const baseDoc = { texts: [{ id: "list", x: 0, y: 0, width: 480, content: "<p>- [ ] milk</p>", itemsMeta: [{ text: "milk", addedBy: null, addedByOwner: true }] }] };
    const local = { texts: [{ ...baseDoc.texts[0], content: "<p>- [x] milk</p>" }] }; // user checked milk
    const remote = { texts: [{ ...baseDoc.texts[0], content: "<p>- [ ] milk</p><p>- [ ] eggs</p>", itemsMeta: [...baseDoc.texts[0].itemsMeta, { text: "eggs", addedBy: "Samuel", addedByOwner: true }] }] };
    const merged = mergeDocStates(baseDoc, local, remote);
    expect(parseChecklist(merged.texts[0]).map((i) => [i.text, i.checked, i.addedBy])).toEqual([
      ["milk", true, null],
      ["eggs", false, "Samuel"],
    ]);
  });
});

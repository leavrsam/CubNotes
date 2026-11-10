import { describe, expect, it } from "vitest";
import { addItemToChecklist, itemsMatch, normalizeItemKey, parseChecklist, serializeChecklist } from "@/lib/listItems";

describe("list item matching", () => {
  it.each([
    ["2 Apples (green)", "apple"],
    ["- [x] Bananas", "banana"],
    ["a dozen eggs", "Eggs"],
    ["3 lbs chicken breasts", "chicken breast"],
    ["2x paper towels", "Paper towel (Bounty)"],
    ["berries", "berry"],
    ["tomatoes", "tomato"],
    ["1/2 gallon of milk", "milk"],
  ])("%s matches %s", (a, b) => expect(itemsMatch(a, b)).toBe(true));

  it("does not over-match", () => {
    expect(itemsMatch("milk", "almond milk")).toBe(false);
    expect(normalizeItemKey("canola oil")).toBe("canola oil");
    expect(normalizeItemKey("Dozen")).toBe("dozen");
  });
});

describe("checklist edits keep metadata", () => {
  const node = {
    content: "<p>- milk</p><p>- [x] Eggs</p>",
    itemsMeta: [
      { text: "milk", addedBy: "Ann", addedByOwner: false },
      { text: "Eggs", addedBy: null, addedByOwner: true, extra: 1 },
    ],
  };

  it("moves a checked match back instead of duplicating", () => {
    const r = addItemToChecklist(parseChecklist(node), "2 eggs", { addedBy: "Zed", addedByOwner: false });
    expect(r.outcome).toBe("movedFromChecked");
    expect(r.items.map((i) => [i.text, i.checked, i.addedBy])).toEqual([
      ["milk", false, "Ann"],
      ["Eggs", false, null],
    ]);
  });

  it("round-trips extra metadata fields", () => {
    expect(serializeChecklist(parseChecklist(node)).itemsMeta[1]).toMatchObject({ extra: 1 });
  });
});

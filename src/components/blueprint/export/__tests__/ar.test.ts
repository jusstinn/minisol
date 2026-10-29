import { describe, expect, it, vi } from "vitest";
import { openQuickLook, quickLookHref } from "../ar";

/** A minimal Document: elements that record attributes, children and clicks. */
function fakeDoc() {
  const made: FakeEl[] = [];
  class FakeEl {
    attrs: Record<string, string> = {};
    children: FakeEl[] = [];
    click = vi.fn();
    constructor(public tag: string) {
      made.push(this);
    }
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    }
    appendChild(c: FakeEl) {
      this.children.push(c);
      return c;
    }
  }
  return { doc: { createElement: (tag: string) => new FakeEl(tag) } as unknown as Document, made };
}

describe("AR Quick Look (iOS)", () => {
  it("clicks an <a rel=ar> whose first child is an <img>, pointing at the blob", () => {
    const { doc, made } = fakeDoc();
    const a = openQuickLook("blob:https://blueprint.example/1234-abcd", { doc });
    const anchor = made[0] as unknown as { tag: string; attrs: Record<string, string>; children: { tag: string }[]; click: ReturnType<typeof vi.fn> };
    expect(a).toBe(anchor);
    expect(anchor.tag).toBe("a");
    expect(anchor.attrs.rel).toBe("ar");
    expect(anchor.children[0].tag).toBe("img");
    expect(anchor.attrs.href.startsWith("blob:https://blueprint.example/1234-abcd")).toBe(true);
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("keeps the model at true size (no pinch-to-resize) unless asked otherwise", () => {
    expect(quickLookHref("blob:https://x/1")).toBe("blob:https://x/1#allowsContentScaling=0");
    expect(quickLookHref("blob:https://x/1#old")).toBe("blob:https://x/1#allowsContentScaling=0");
    expect(quickLookHref("blob:https://x/1", { fixedScale: false })).toBe("blob:https://x/1");
  });
});

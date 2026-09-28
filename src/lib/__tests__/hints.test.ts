import { describe, expect, it } from "vitest";
import { pickHint } from "../hints";

describe("first-run hints", () => {
  it("shows the most useful unseen hint whose target is on screen", () => {
    expect(pickHint({}, { sketch: true, list: true, chat: true })).toBe("sketch");
    expect(pickHint({ sketch: 1 }, { sketch: true, list: true, chat: true })).toBe("list");
    // Phones: only the conversation is on screen after the first answer.
    expect(pickHint({}, { chat: true })).toBe("chat");
  });

  it("never repeats one, and waits for a target to be visible", () => {
    expect(pickHint({ sketch: 1, list: 1, chat: 1 }, { sketch: true, list: true, chat: true })).toBeNull();
    expect(pickHint({ chat: 1 }, { chat: true })).toBeNull();
    expect(pickHint({}, {})).toBeNull();
  });
});

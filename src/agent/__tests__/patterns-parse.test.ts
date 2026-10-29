import { describe, expect, it } from "vitest";
import { fold } from "@/domain/search";
import type { ProjectType } from "@/domain/calculators";
import { bondIn, deckBoardsIn, parseIntent, parseSketchEdit } from "../scripted";
import type { SessionState } from "../types";

const empty: SessionState = { basket: [] };
const on = (type: ProjectType): SessionState => ({
  basket: [],
  project: { type, title: "", inputs: {}, measurements: [], assumptions: [], estimate: { hoursMin: 1, hoursMax: 2, difficulty: 1, people: 1 }, safetyNotes: [] },
});
/** What the offline agent does with a follow-up on the project on screen. */
const edit = (msg: string, type: ProjectType) => parseSketchEdit(fold(msg), type);

describe("paver bond phrases (offline parser)", () => {
  it.each([
    ["pavele în spic", "herringbone"],
    ["Fă modelul în spic", "herringbone"],
    ["model herringbone", "herringbone"],
    ["I want a herringbone pattern", "herringbone"],
    ["use a herring-bone bond", "herringbone"],
    ["pavele în coș", "basketweave"],
    ["model în coș", "basketweave"],
    ["basketweave please", "basketweave"],
    ["a basket weave pattern", "basketweave"],
    ["pavele în linie", "stack"],
    ["pune-le aliniate", "stack"],
    ["stack bond", "stack"],
    ["rânduri drepte", "stack"],
    ["pavele în rânduri decalate", "running"],
    ["running bond", "running"],
    ["stretcher bond", "running"],
    ["ca la cărămizi", "running"],
  ])("%s → %s", (msg, bond) => {
    expect(bondIn(fold(msg))).toBe(bond);
    expect(edit(msg, "paving")).toEqual([{ op: "set_option", key: "bond", value: bond }]);
  });

  it("says nothing about a bond when none is named", () => {
    expect(bondIn(fold("fă-o pentru mașini"))).toBeUndefined();
    expect(edit("fă-o pentru mașini", "paving")).toEqual([{ op: "set_option", key: "use", value: "driveway" }]);
  });

  it("only paving projects read a bond", () => {
    expect(edit("în spic", "fence")).toBeNull();
    expect(edit("în coș", "paint_room")).toBeNull();
  });

  it("a bond and a use can come in one message", () => {
    expect(edit("fă-o pentru mașini, pavele în spic", "paving")).toEqual([
      { op: "set_option", key: "use", value: "driveway" },
      { op: "set_option", key: "bond", value: "herringbone" },
    ]);
  });

  it("is a sketch edit on the project on screen, in either language", () => {
    expect(parseIntent("Vreau pavelele în spic", on("paving"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "bond", value: "herringbone" }] });
    expect(parseIntent("make the pavers basketweave", on("paving"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "bond", value: "basketweave" }] });
  });

  it("a new request names the bond in its parameters", () => {
    expect(parseIntent("Vreau o alee din pavele în spic de 6 x 1,2 m", empty)).toMatchObject({ kind: "project", type: "paving", params: { bond: "herringbone", lengthM: 6, widthM: 1.2 } });
    expect(parseIntent("A 4 x 3 m paved patio in basketweave", empty)).toMatchObject({ kind: "project", type: "paving", params: { bond: "basketweave" } });
    expect(parseIntent("Terasă din pavele 4 × 3 m", empty)).toMatchObject({ kind: "project", type: "paving" });
    expect((parseIntent("Terasă din pavele 4 × 3 m", empty) as { params: Record<string, unknown> }).params.bond).toBeUndefined();
  });
});

describe("deck board layout phrases (offline parser)", () => {
  it.each([
    ["deck pe diagonală", "diagonal"],
    ["montează deck-ul în diagonală", "diagonal"],
    ["scândurile oblic", "diagonal"],
    ["diagonal boards", "diagonal"],
    ["lay the boards at 45 degrees", "diagonal"],
    ["cu ramă", "frame"],
    ["cu chenar", "frame"],
    ["deck cu ramă / chenar", "frame"],
    ["add a picture-frame border", "frame"],
    ["with a border of boards", "frame"],
    ["scânduri pe margini", "frame"],
    ["fără ramă", "straight"],
    ["without the frame", "straight"],
    ["montaj drept", "straight"],
    ["lay them straight", "straight"],
    ["nu mai vreau diagonal", "straight"],
  ])("%s → %s", (msg, boards) => {
    expect(deckBoardsIn(fold(msg))).toBe(boards);
    expect(edit(msg, "deck")).toEqual([{ op: "set_option", key: "boards", value: boards }]);
  });

  it("leaves other deck edits alone", () => {
    expect(deckBoardsIn(fold("adaugă 2 trepte în față"))).toBeUndefined();
    expect(edit("adaugă 2 trepte în față", "deck")).toMatchObject([{ op: "add_steps" }]);
    expect(edit("ridic-o la 40 cm", "deck")).toEqual([{ op: "set_height", value: 0.4 }]);
  });

  it("is a sketch edit on the deck on screen, a parameter on a new one", () => {
    expect(parseIntent("Vreau deck pe diagonală", on("deck"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "boards", value: "diagonal" }] });
    expect(parseIntent("Make the deck with a picture frame", on("deck"))).toMatchObject({ kind: "sketch", edits: [{ op: "set_option", key: "boards", value: "frame" }] });
    expect(parseIntent("Vreau o terasă din deck 5 x 4 m pe diagonală", empty)).toMatchObject({ kind: "project", type: "deck", params: { boards: "diagonal", lengthM: 5, widthM: 4 } });
    expect(parseIntent("A 4 x 3 m deck with a border", empty)).toMatchObject({ kind: "project", type: "deck", params: { boards: "frame" } });
  });

  it("laminate keeps its own diagonal option", () => {
    expect(edit("montaj diagonal", "laminate_floor")).toEqual([{ op: "set_option", key: "pattern", value: "diagonal" }]);
  });
});

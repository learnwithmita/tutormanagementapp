import { describe, it, expect } from "vitest";
import {
  applyStatusTransition,
  stagesFor,
  paperPercent,
  workItemLabel,
  paperLabel,
  type Stamped,
} from "@/lib/progress";

const T = "2026-07-07";
const fresh: Stamped = { status: "NOT_STARTED", started_at: null, completed_at: null };

describe("stagesFor", () => {
  it("NOTES has 3 stages, no DONE/MARKED", () => {
    expect(stagesFor("NOTES")).toEqual(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]);
  });
  it("PRACTICE/PAPER have 5 stages", () => {
    expect(stagesFor("PRACTICE")).toHaveLength(5);
    expect(stagesFor("PAPER")).toContain("MARKED");
  });
});

describe("applyStatusTransition — stamping", () => {
  it("stamps started_at when moving off NOT_STARTED", () => {
    const r = applyStatusTransition(fresh, "IN_PROGRESS", "PRACTICE", T);
    expect(r).toEqual({ status: "IN_PROGRESS", started_at: T, completed_at: null });
  });

  it("forward jump to COMPLETED stamps started=completed=today", () => {
    const r = applyStatusTransition(fresh, "COMPLETED", "NOTES", T);
    expect(r).toEqual({ status: "COMPLETED", started_at: T, completed_at: T });
  });

  it("preserves an existing started_at (backfill/edit)", () => {
    const cur: Stamped = { status: "IN_PROGRESS", started_at: "2026-06-01", completed_at: null };
    const r = applyStatusTransition(cur, "COMPLETED", "PRACTICE", T);
    expect(r.started_at).toBe("2026-06-01");
    expect(r.completed_at).toBe(T);
  });
});

describe("applyStatusTransition — clearing on backward moves", () => {
  it("leaving COMPLETED clears completed_at, keeps started_at", () => {
    const cur: Stamped = { status: "COMPLETED", started_at: "2026-06-01", completed_at: "2026-06-10" };
    const r = applyStatusTransition(cur, "MARKED", "PRACTICE", T);
    expect(r).toEqual({ status: "MARKED", started_at: "2026-06-01", completed_at: null });
  });

  it("back to NOT_STARTED clears both dates", () => {
    const cur: Stamped = { status: "COMPLETED", started_at: "2026-06-01", completed_at: "2026-06-10" };
    const r = applyStatusTransition(cur, "NOT_STARTED", "PRACTICE", T);
    expect(r).toEqual({ status: "NOT_STARTED", started_at: null, completed_at: null });
  });
});

describe("NOTES stage restriction", () => {
  it("throws if a NOTES item is moved to DONE or MARKED", () => {
    expect(() => applyStatusTransition(fresh, "DONE", "NOTES", T)).toThrow();
    expect(() => applyStatusTransition(fresh, "MARKED", "NOTES", T)).toThrow();
  });
});

describe("paperPercent", () => {
  it("rounds score/max*100", () => {
    expect(paperPercent(38, 50)).toBe(76);
    expect(paperPercent(2, 3)).toBe(67);
  });
  it("returns null when unscored or max invalid", () => {
    expect(paperPercent(null, 50)).toBeNull();
    expect(paperPercent(10, null)).toBeNull();
    expect(paperPercent(10, 0)).toBeNull();
  });
});

describe("labels", () => {
  it("work item falls back to '{topic} {kind}'", () => {
    expect(workItemLabel("Algebra", "PRACTICE", null)).toBe("Algebra Practice");
    expect(workItemLabel("Algebra", "NOTES", "  ")).toBe("Algebra Notes");
    expect(workItemLabel("Algebra", "PRACTICE", "TYS Ex 4B")).toBe("TYS Ex 4B");
  });
  it("paper label", () => {
    expect(paperLabel("ABC", "Sec 2", "Mid-Year", 2024)).toBe("ABC Sec 2 Mid-Year 2024");
  });
});

import { describe, expect, it } from "vitest";
import { scorePriority, bucketOf } from "@/agent/priorityEngine";

describe("bucketOf", () => {
  it("maps score ranges to buckets", () => {
    expect(bucketOf(0.9)).toBe("CRITICAL");
    expect(bucketOf(0.75)).toBe("CRITICAL");
    expect(bucketOf(0.6)).toBe("HIGH");
    expect(bucketOf(0.4)).toBe("MEDIUM");
    expect(bucketOf(0.1)).toBe("LOW");
    expect(bucketOf(0)).toBe("LOW");
  });
});

describe("scorePriority", () => {
  it("returns a score in [0,1] and a matching bucket", () => {
    const r = scorePriority({ urgency: 0.5, importance: 0.5 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.bucket).toBe(bucketOf(r.score));
  });

  it("treats missing numeric fields as 0", () => {
    expect(scorePriority({}).score).toBe(0);
    expect(scorePriority({}).bucket).toBe("LOW");
  });

  it("ranks an overdue + important item well above a trivial one", () => {
    const hot = scorePriority({
      urgency: 0.9,
      importance: 0.9,
      deadline: new Date(Date.now() - 3_600_000),
    });
    const cold = scorePriority({ urgency: 0.1, importance: 0.1 });
    expect(hot.score).toBeGreaterThan(cold.score + 0.4);
    expect(["HIGH", "CRITICAL"]).toContain(hot.bucket);
  });

  it("applies the alreadyHandled penalty", () => {
    const base = { urgency: 0.9, importance: 0.9, deadline: new Date() };
    const handled = scorePriority({ ...base, alreadyHandled: true });
    const notHandled = scorePriority({ ...base, alreadyHandled: false });
    expect(notHandled.score - handled.score).toBeGreaterThan(0.4);
  });

  it("weights nearer deadlines higher", () => {
    const soon = scorePriority({ importance: 0.5, deadline: new Date(Date.now() + 3_600_000) });
    const later = scorePriority({ importance: 0.5, deadline: new Date(Date.now() + 30 * 864e5) });
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it("clamps out-of-range inputs", () => {
    const r = scorePriority({ urgency: 5, importance: 5, relationshipImportance: 5 });
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

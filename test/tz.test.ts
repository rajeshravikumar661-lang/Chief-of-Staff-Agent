import { describe, expect, it } from "vitest";
import { dayBoundsInTz, formatTime, greeting, hourInTz } from "@/lib/tz";

// A fixed instant: 2026-09-02T20:30:00Z
const d = new Date("2026-09-02T20:30:00.000Z");

describe("formatTime", () => {
  it("renders UTC clock time", () => {
    expect(formatTime(d, "UTC")).toBe("20:30");
  });
  it("shifts into Asia/Kolkata (+05:30)", () => {
    // 20:30Z -> 02:00 next day
    expect(formatTime(d, "Asia/Kolkata")).toBe("02:00");
  });
  it("shifts into America/New_York (-04:00 DST)", () => {
    expect(formatTime(d, "America/New_York")).toBe("16:30");
  });
  it("falls back to UTC for an invalid zone", () => {
    expect(formatTime(d, "Not/AZone")).toBe("20:30");
  });
});

describe("hourInTz", () => {
  it("UTC", () => {
    expect(hourInTz(d, "UTC")).toBe(20);
  });
  it("Asia/Kolkata rolls past midnight", () => {
    expect(hourInTz(d, "Asia/Kolkata")).toBe(2);
  });
  it("America/New_York", () => {
    expect(hourInTz(d, "America/New_York")).toBe(16);
  });
});

describe("greeting", () => {
  it("evening in UTC (20:00)", () => {
    expect(greeting(d, "UTC")).toBe("Good evening");
  });
  it("morning in Asia/Kolkata (02:00)", () => {
    expect(greeting(d, "Asia/Kolkata")).toBe("Good morning");
  });
  it("afternoon in America/New_York (16:30)", () => {
    expect(greeting(d, "America/New_York")).toBe("Good afternoon");
  });
});

describe("dayBoundsInTz", () => {
  it("UTC day contains the instant and spans ~24h", () => {
    const { start, end } = dayBoundsInTz(d, "UTC");
    expect(start.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    expect(start.getTime()).toBeLessThanOrEqual(d.getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(d.getTime());
  });

  it("Asia/Kolkata local day starts at 18:30Z the previous date", () => {
    // 20:30Z is 02:00 IST on Sep 3 -> IST day is Sep 3, 00:00 IST = Sep 2 18:30Z
    const { start, end } = dayBoundsInTz(d, "Asia/Kolkata");
    expect(start.toISOString()).toBe("2026-09-02T18:30:00.000Z");
    expect(start.getTime()).toBeLessThanOrEqual(d.getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(d.getTime());
  });

  it("America/New_York local day starts at 04:00Z (DST)", () => {
    const { start, end } = dayBoundsInTz(d, "America/New_York");
    expect(start.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(start.getTime()).toBeLessThanOrEqual(d.getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(d.getTime());
  });
});

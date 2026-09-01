import type { BriefingItem } from "@/lib/types";
import { formatDay, formatTime } from "@/lib/tz";

export interface DigestInput {
  name: string | null;
  date: Date;
  timezone: string;
  agenda: { start: Date; title: string; attendees: number }[];
  items: BriefingItem[]; // ranked briefing items (already top-N)
}

const ICON: Record<BriefingItem["kind"], string> = {
  meeting: "📅",
  email: "✉️",
  pr: "🔧",
  commitment: "🤝",
  task: "✅",
  follow_up: "↩️",
};

/** Compact WhatsApp-formatted daily digest (*bold* via asterisks). */
export function formatDigest(d: DigestInput): string {
  const hi = d.name ? d.name.split(/\s+/)[0] : "there";
  const tz = d.timezone;
  const lines: string[] = [`*Good morning, ${hi}* — ${formatDay(d.date, tz)}`, ""];

  if (d.agenda.length) {
    lines.push(`*Today (${d.agenda.length})*`);
    for (const e of d.agenda.slice(0, 8)) {
      const who = e.attendees > 1 ? ` · ${e.attendees} people` : "";
      lines.push(`${formatTime(e.start, tz)}  ${e.title}${who}`);
    }
  } else {
    lines.push("*Today* — nothing on the calendar");
  }
  lines.push("");

  const attention = d.items.filter((i) => i.priority === "CRITICAL" || i.priority === "HIGH");
  const rest = d.items.filter((i) => i.priority === "MEDIUM" || i.priority === "LOW");

  if (attention.length) {
    lines.push("*Needs your attention*");
    for (const i of attention.slice(0, 6)) lines.push(`${ICON[i.kind]} ${i.title}`);
    lines.push("");
  }
  if (rest.length) {
    lines.push("*Also*");
    for (const i of rest.slice(0, 5)) lines.push(`${ICON[i.kind]} ${i.title}`);
    lines.push("");
  }
  if (!attention.length && !rest.length) {
    lines.push("Nothing needs a decision from you right now. 🎉");
    lines.push("");
  }

  lines.push("_Reply here or open the dashboard to act._");
  return lines.join("\n").trim();
}

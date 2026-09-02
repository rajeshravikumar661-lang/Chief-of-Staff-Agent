import type { EventIconName, AgentIconName } from "@/components/Icons";
import type { NeedsAttentionItem, SuggestedAction } from "@/lib/types";

const STOPWORDS = new Set(["the", "with", "and", "for", "today", "meeting", "call", "review", "standup", "product"]);

function keywordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Best-effort match: does a needs-attention item mention a word from this event's title? */
export function relatedAttention(eventTitle: string, attention: NeedsAttentionItem[]): NeedsAttentionItem[] {
  const keywords = keywordsOf(eventTitle);
  if (keywords.length === 0) return [];
  return attention.filter((a) => keywords.some((k) => a.text.toLowerCase().includes(k)));
}

/** Same idea, but against suggested actions — used to surface a relevant "prep" button on the Focus card. */
export function relatedActions(eventTitle: string, actions: SuggestedAction[]): SuggestedAction[] {
  const keywords = keywordsOf(eventTitle);
  if (keywords.length === 0) return [];
  return actions.filter((a) => keywords.some((k) => a.label.toLowerCase().includes(k)));
}

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Minutes between now and an "HH:MM" time today. Negative if already past. */
export function minutesUntil(time: string): number {
  const [h, m] = time.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return Math.round((target.getTime() - Date.now()) / 60000);
}

/** "Now", "In 25 min", or "In 1h 30m" — for the Focus Now card's countdown. */
export function formatCountdown(minutes: number): string {
  if (minutes <= 1) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `In ${h}h` : `In ${h}h ${m}m`;
}

/**
 * Best-effort category icon for an agenda item, guessed from its title —
 * purely decorative (mirrors the mockup's per-event icons); never changes
 * what the event actually is, just which glyph sits next to it.
 */
export function eventIcon(title: string): EventIconName {
  const t = title.toLowerCase();
  if (/\b(routine|wellness|gym|workout|walk|meditat)/.test(t)) return "wellness";
  if (/\b(lunch|dinner|breakfast|coffee|cafe)/.test(t)) return "food";
  if (/\b(standup|stand-up|sync|team|1:1|onboard)/.test(t)) return "people";
  if (/\b(focus|strategy|investor|review|prep|plan)/.test(t)) return "focus";
  return "calendar";
}

/** Same idea for an agent run's goal — briefing/research/comms, guessed from the goal text. */
export function agentIcon(goal: string): AgentIconName {
  const t = goal.toLowerCase();
  if (/\b(reply|email|draft|send|message)/.test(t)) return "comms";
  if (/\b(research|summar|scan|search|find)/.test(t)) return "research";
  return "briefing";
}

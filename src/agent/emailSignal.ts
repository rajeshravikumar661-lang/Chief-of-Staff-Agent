/**
 * Heuristics that separate "a human is waiting on your reply" from the newsletter
 * / notification / job-alert noise that makes up most of a personal inbox.
 * Pure and dependency-free so the briefing, the /today feed and tests can share it.
 *
 * We only synced sender/subject/snippet (no raw headers), so these are best-effort
 * signals, not a spam filter — tuned to be *quiet*: when unsure, not important.
 */

export interface EmailLike {
  sender: string | null;
  subject: string | null;
  snippet?: string | null;
  body?: string | null;
}

/** Role/automation local-parts that never expect a personal reply. */
const AUTOMATED_LOCALPART =
  /^(no-?reply|do-?not-?reply|donotreply|noreply|notif(y|ications?)?|alerts?|updates?|news(letter)?|digest|mailer|mailer-daemon|postmaster|bounce[sd]?|info|hello|hi|team|support|help|care|service[s]?|billing|invoices?|receipts?|accounts?|security|automated|auto|robot|bot|system|marketing|promo(tions?)?|offers?|deals?|community|hey|contact|members?|feedback|survey|jobs?|careers?|talent|recruiting)([.+-]|$)/i;

/** Brands / platforms whose mail is transactional or promotional, never a 1:1. */
const BRAND_DOMAIN =
  /(linkedin|indeed|glassdoor|naukri|unstop|instahyre|hirist|cutshort|zerodha|kite|groww|upstox|hdfcbank|icici|sbi|axisbank|kotak|paytm|phonepe|cred|amazon|flipkart|adidas|nike|myntra|ajio|swiggy|zomato|uber|olacabs|makemytrip|goibibo|irctc|medium|substack|beehiiv|mailchimp|sendgrid|hubspot|apollo|calendly|notion|figma|canva|atlassian|slack|gitlab|vercel|netlify|render|railway|coursera|udemy|duolingo|spotify|netflix|primevideo|cdslindia|nsdl|epfindia)\./i;

const PROMO_SUBJECT =
  /\b(unsubscribe|% ?off|\bsale\b|discount|coupon|promo|webinar|newsletter|digest|weekly (recap|roundup|update)|job alert|apply now|now hiring|is hiring|new role|limited time|don'?t miss|last chance|expires? (soon|today)|reminder: your|your .*(report|statement|summary|invoice) is (ready|available)|verify your|confirm your (email|subscription|account)|welcome to|get started|upgrade (now|to)|go premium|free trial|earn .* returns|cashback|lifetime free)\b/i;

const PROMO_GLYPH = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u; // emoji in a subject → almost always bulk

const REPLY_CUE =
  /(\bcan you\b|\bcould you\b|\bcould we\b|\bwould you\b|are you able|\blet me know\b|\blmk\b|your thoughts|what do you think|\bthoughts\?|any update|any progress|waiting (on|for) (you|your)|following up|circling back|circle back|when can (you|we)|are we still|please (send|share|review|confirm|advise|let)|need your|by (eod|tomorrow|monday|tuesday|wednesday|thursday|friday|end of)|\?\s*$)/i;

function parseSender(sender: string | null): { name: string; email: string } {
  if (!sender) return { name: "", email: "" };
  const m = sender.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: sender.trim().toLowerCase() };
}

export function isAutomatedSender(sender: string | null): boolean {
  const { email } = parseSender(sender);
  if (!email) return true;
  const local = email.split("@")[0] ?? "";
  return AUTOMATED_LOCALPART.test(local) || BRAND_DOMAIN.test(email);
}

/** A display name that looks like an actual person: 2+ alphabetic tokens, no brand words. */
export function fromRealPerson(sender: string | null): boolean {
  if (isAutomatedSender(sender)) return false;
  const { name, email } = parseSender(sender);
  if (BRAND_DOMAIN.test(email)) return false;
  const tokens = name.split(/\s+/).filter((t) => /^[a-z][a-z'.-]+$/i.test(t));
  if (tokens.length >= 2 && !/team|support|no ?reply|notifications?/i.test(name)) return true;
  // single-name display but a plausibly personal address (first.last@, first@smalldomain)
  const local = email.split("@")[0] ?? "";
  return /^[a-z]+[._][a-z]+$/i.test(local);
}

export function isLikelyPromotional(e: EmailLike): boolean {
  const subject = e.subject ?? "";
  if (isAutomatedSender(e.sender)) return true;
  if (PROMO_SUBJECT.test(subject)) return true;
  if (PROMO_GLYPH.test(subject)) return true;
  return false;
}

export interface ReplySignal {
  needsReply: boolean;
  score: number; // 0..1 — confidence that a human reply is expected
  reasons: string[];
}

/**
 * Does this look like a message from a person that is actually waiting on you?
 */
export function assessReply(e: EmailLike): ReplySignal {
  const reasons: string[] = [];
  if (isLikelyPromotional(e)) {
    return { needsReply: false, score: 0, reasons: ["automated / promotional"] };
  }

  let score = 0;
  if (fromRealPerson(e.sender)) {
    score += 0.55;
    reasons.push("from a real person");
  } else {
    score += 0.15;
  }

  const haystack = `${e.subject ?? ""}\n${e.snippet ?? ""}\n${e.body ?? ""}`;
  if (REPLY_CUE.test(haystack)) {
    score += 0.35;
    reasons.push("asks a question / requests something");
  }
  if (/^re:/i.test(e.subject ?? "")) {
    score += 0.1;
    reasons.push("part of an ongoing thread");
  }

  score = Math.min(1, score);
  return { needsReply: score >= 0.5, score, reasons };
}

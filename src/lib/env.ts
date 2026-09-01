/**
 * Central env access. Never read process.env elsewhere — import from here so a
 * missing var fails loudly at startup instead of deep inside a request.
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}

export const env = {
  databaseUrl: () => req("DATABASE_URL"),
  authSecret: () => req("AUTH_SECRET"),
  nextAuthUrl: () => opt("NEXTAUTH_URL", "http://localhost:3000"),

  googleClientId: () => opt("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => opt("GOOGLE_CLIENT_SECRET"),

  tokenEncryptionKey: () => req("TOKEN_ENCRYPTION_KEY"),

  llmProvider: () => opt("LLM_PROVIDER", "claude") as "claude" | "openai",
  anthropicApiKey: () => opt("ANTHROPIC_API_KEY"),
  openaiApiKey: () => opt("OPENAI_API_KEY"),
  strongModel: () =>
    opt("LLM_PROVIDER", "claude") === "openai"
      ? opt("OPENAI_STRONG_MODEL", "gpt-4o")
      : opt("LLM_STRONG_MODEL", "claude-sonnet-5"),
  cheapModel: () =>
    opt("LLM_PROVIDER", "claude") === "openai"
      ? opt("OPENAI_CHEAP_MODEL", "gpt-4o-mini")
      : opt("LLM_CHEAP_MODEL", "claude-haiku-4-5-20251001"),

  redisUrl: () => opt("REDIS_URL", "redis://localhost:6379"),
  briefingHour: () => num("BRIEFING_HOUR", 8),
  briefingMinute: () => num("BRIEFING_MINUTE", 30),

  agentMaxSteps: () => num("AGENT_MAX_STEPS", 20),
  agentMaxToolCalls: () => num("AGENT_MAX_TOOL_CALLS", 40),
  agentMaxWallclockMs: () => num("AGENT_MAX_WALLCLOCK_MS", 90_000),
  agentMaxCostUsd: () => num("AGENT_MAX_COST_USD", 1.0),

  slackClientId: () => opt("SLACK_CLIENT_ID"),
  slackClientSecret: () => opt("SLACK_CLIENT_SECRET"),
  githubClientId: () => opt("GITHUB_CLIENT_ID"),
  githubClientSecret: () => opt("GITHUB_CLIENT_SECRET"),
  notionClientId: () => opt("NOTION_CLIENT_ID"),
  notionClientSecret: () => opt("NOTION_CLIENT_SECRET"),
};

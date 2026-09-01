import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import type {
  BlockObjectResponse,
  CreatePageParameters,
  DatabaseObjectResponse,
  PageObjectResponse,
  QueryDatabaseParameters,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/security/tokenCrypto";

/**
 * Normalized wrappers over the Notion API (spec §7). The agent only ever sees
 * the normalized shapes below — never raw Notion response objects.
 */

const MAX_CONTENT_CHARS = 5000;
const SNIPPET_CHARS = 200;

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  snippet: string | null;
}

export interface NotionPageDetail extends NotionPage {
  /** Block children flattened to plain text, capped at ~5k chars. */
  content: string;
}

export interface NotionDatabaseRef {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
}

export interface CreatedNotionPage {
  id: string;
  url: string;
}

export interface CreatePageInput {
  parentDatabaseId?: string;
  parentPageId?: string;
  title: string;
  content?: string;
}

export class NotionConnectionError extends Error {
  constructor() {
    super("No connected 'notion' account for this user");
    this.name = "NotionConnectionError";
  }
}

/** Build an authenticated Notion client for the user, or throw a clear error. */
export async function getNotionClient(userId: string): Promise<Client> {
  const conn = await prisma.connection.findUnique({
    where: { userId_provider: { userId, provider: "notion" } },
  });
  if (!conn || conn.status !== "connected" || !conn.accessTokenEncrypted) {
    throw new NotionConnectionError();
  }
  return new Client({ auth: decryptToken(conn.accessTokenEncrypted) });
}

/* ----------------------------- normalization ----------------------------- */

function richTextToPlain(rich: RichTextItemResponse[]): string {
  return rich.map((r) => r.plain_text).join("");
}

function pageTitle(page: PageObjectResponse): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") {
      const text = richTextToPlain(prop.title).trim();
      if (text) return text;
    }
  }
  return "(untitled)";
}

function databaseTitle(db: DatabaseObjectResponse): string {
  const text = richTextToPlain(db.title).trim();
  return text || "(untitled database)";
}

function normalizePage(page: PageObjectResponse): NotionPage {
  return {
    id: page.id,
    title: pageTitle(page),
    url: page.url,
    lastEditedTime: page.last_edited_time,
    snippet: null,
  };
}

/**
 * Recursively walk an arbitrary Notion JSON value and collect every
 * `plain_text` string it contains. Keeps us out of the messy block union.
 */
function collectPlainText(value: unknown, acc: string[], budget: { left: number }): void {
  if (budget.left <= 0) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPlainText(item, acc, budget);
    return;
  }
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const pt = rec.plain_text;
    if (typeof pt === "string" && pt.length > 0) {
      acc.push(pt);
      budget.left -= pt.length;
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === "plain_text") continue;
      collectPlainText(v, acc, budget);
    }
  }
}

/* -------------------------------- search -------------------------------- */

export async function search(
  userId: string,
  query: string,
  pageSize = 15,
): Promise<Array<NotionPage | NotionDatabaseRef>> {
  const notion = await getNotionClient(userId);
  const res = await notion.search({
    query,
    page_size: Math.min(Math.max(pageSize, 1), 100),
  });
  const out: Array<NotionPage | NotionDatabaseRef> = [];
  for (const item of res.results) {
    if (isFullPage(item)) {
      out.push(normalizePage(item));
    } else if (isFullDatabase(item)) {
      out.push({
        id: item.id,
        title: databaseTitle(item),
        url: item.url,
        lastEditedTime: item.last_edited_time,
      });
    }
  }
  return out;
}

/* ------------------------------- getPage ------------------------------- */

export async function getPage(
  userId: string,
  pageId: string,
): Promise<NotionPageDetail> {
  const notion = await getNotionClient(userId);
  const page = await notion.pages.retrieve({ page_id: pageId });
  if (!isFullPage(page)) {
    throw new Error(`Notion page ${pageId} is not accessible`);
  }

  const parts: string[] = [];
  const budget = { left: MAX_CONTENT_CHARS };
  let cursor: string | undefined;
  for (let i = 0; i < 5 && budget.left > 0; i += 1) {
    const children = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of children.results) {
      collectPlainText(block as BlockObjectResponse, parts, budget);
      parts.push("\n");
    }
    if (!children.has_more || !children.next_cursor) break;
    cursor = children.next_cursor;
  }

  const content = parts.join("").replace(/\n{2,}/g, "\n").trim().slice(0, MAX_CONTENT_CHARS);
  const base = normalizePage(page);
  return {
    ...base,
    content,
    snippet: content ? content.slice(0, SNIPPET_CHARS).replace(/\s+/g, " ").trim() : null,
  };
}

/* ---------------------------- queryDatabase --------------------------- */

export async function queryDatabase(
  userId: string,
  databaseId: string,
  filter?: Record<string, unknown>,
): Promise<NotionPage[]> {
  const notion = await getNotionClient(userId);
  const res = await notion.databases.query({
    database_id: databaseId,
    page_size: 50,
    ...(filter
      ? { filter: filter as QueryDatabaseParameters["filter"] }
      : {}),
  });
  return res.results.filter(isFullPage).map(normalizePage);
}

/* ---------------------------- listDatabases -------------------------- */

export async function listDatabases(userId: string): Promise<NotionDatabaseRef[]> {
  const notion = await getNotionClient(userId);
  const res = await notion.search({
    filter: { property: "object", value: "database" },
    page_size: 100,
  });
  const out: NotionDatabaseRef[] = [];
  for (const item of res.results) {
    if (isFullDatabase(item)) {
      out.push({
        id: item.id,
        title: databaseTitle(item),
        url: item.url,
        lastEditedTime: item.last_edited_time,
      });
    }
  }
  return out;
}

/* ------------------------------ createPage --------------------------- */

function paragraphBlocks(content: string): CreatePageParameters["children"] {
  const lines = content.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.map((line) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: line.slice(0, 2000) } }],
    },
  }));
}

export async function createPage(
  userId: string,
  input: CreatePageInput,
): Promise<CreatedNotionPage> {
  const notion = await getNotionClient(userId);

  if (!input.parentDatabaseId && !input.parentPageId) {
    throw new Error("createPage requires parentDatabaseId or parentPageId");
  }

  const parent: CreatePageParameters["parent"] = input.parentDatabaseId
    ? { database_id: input.parentDatabaseId }
    : { page_id: input.parentPageId as string };

  const params: CreatePageParameters = {
    parent,
    properties: {
      // Notion resolves the "title" key to the parent's title property
      // regardless of its display name (commonly "Name").
      title: {
        title: [{ type: "text", text: { content: input.title.slice(0, 2000) } }],
      },
    },
    ...(input.content && input.content.trim()
      ? { children: paragraphBlocks(input.content) }
      : {}),
  };

  const created = await notion.pages.create(params);
  const url = isFullPage(created)
    ? created.url
    : `https://www.notion.so/${created.id.replace(/-/g, "")}`;
  return { id: created.id, url };
}

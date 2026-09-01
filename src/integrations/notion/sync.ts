import { isFullPage } from "@notionhq/client";
import type {
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { prisma, scopedDb } from "@/lib/db";
import { getNotionClient, getPage, NotionConnectionError } from "./client";

const MAX_DOCS = 40;
const MAX_TASKS = 50;
const MAX_CONTENT_CHARS = 5000;

type PageProperty = PageObjectResponse["properties"][string];
type TaskStatus = "todo" | "doing" | "done";

function richTextToPlain(rich: RichTextItemResponse[]): string {
  return rich.map((r) => r.plain_text).join("");
}

function propTitle(props: PageObjectResponse["properties"]): string {
  for (const p of Object.values(props)) {
    if (p.type === "title") {
      const t = richTextToPlain(p.title).trim();
      if (t) return t;
    }
  }
  return "(untitled)";
}

function statusFromLabel(label: string): TaskStatus {
  const l = label.toLowerCase();
  if (/(done|complete|closed|shipped|archived)/.test(l)) return "done";
  if (/(progress|doing|started|review|active)/.test(l)) return "doing";
  return "todo";
}

function detectStatus(props: PageObjectResponse["properties"]): TaskStatus {
  const entries = Object.entries(props);
  for (const [, p] of entries) {
    if (p.type === "status" && p.status) return statusFromLabel(p.status.name);
  }
  for (const [name, p] of entries) {
    if (p.type === "select" && p.select && /status|state/i.test(name)) {
      return statusFromLabel(p.select.name);
    }
  }
  for (const [name, p] of entries) {
    if (p.type === "checkbox" && /done|complete|checked/i.test(name)) {
      return p.checkbox ? "done" : "todo";
    }
  }
  for (const [, p] of entries) {
    if (p.type === "checkbox") return p.checkbox ? "done" : "todo";
  }
  return "todo";
}

function detectDeadline(props: PageObjectResponse["properties"]): Date | null {
  for (const p of Object.values(props) as PageProperty[]) {
    if (p.type === "date" && p.date?.start) {
      const d = new Date(p.date.start);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * Pull recently-edited Notion pages into `Document`, and — if a database whose
 * title looks like a task/todo list exists — mirror its rows into `Task`.
 * Per-item failures are logged and skipped. Returns the number of Document
 * upserts performed. Never throws.
 */
export async function syncNotion(userId: string): Promise<number> {
  let notion: Awaited<ReturnType<typeof getNotionClient>>;
  try {
    notion = await getNotionClient(userId);
  } catch (err) {
    if (err instanceof NotionConnectionError) return 0;
    console.error("[notion/sync] could not build client", err);
    return 0;
  }

  const db = scopedDb(userId);
  let upserts = 0;

  /* ---------------------- (1) recently-edited pages --------------------- */
  try {
    const res = await notion.search({
      sort: { timestamp: "last_edited_time", direction: "descending" },
      page_size: MAX_DOCS,
    });
    const pages = res.results.filter(isFullPage).slice(0, MAX_DOCS);
    for (const page of pages) {
      try {
        let content: string | null = null;
        try {
          content = (await getPage(userId, page.id)).content.slice(0, MAX_CONTENT_CHARS);
        } catch (err) {
          console.error("[notion/sync] content fetch failed", page.id, err);
        }
        await db.document.upsert({
          where: {
            userId_provider_externalId: {
              userId,
              provider: "notion",
              externalId: page.id,
            },
          },
          create: {
            userId,
            provider: "notion",
            externalId: page.id,
            title: propTitle(page.properties),
            url: page.url,
            content,
            updatedAt: new Date(page.last_edited_time),
          },
          update: {
            title: propTitle(page.properties),
            url: page.url,
            content,
            updatedAt: new Date(page.last_edited_time),
          },
        });
        upserts += 1;
      } catch (err) {
        console.error("[notion/sync] skipping page", page.id, err);
      }
    }
  } catch (err) {
    console.error("[notion/sync] page search failed", err);
  }

  /* ------------------------- (2) task database ------------------------- */
  try {
    const dbList = await notion.search({
      filter: { property: "object", value: "database" },
      page_size: 100,
    });
    const taskDb = dbList.results.find((d) => {
      if (d.object !== "database" || !("title" in d)) return false;
      const title = richTextToPlain(d.title as RichTextItemResponse[]).toLowerCase();
      return title.includes("task") || title.includes("todo");
    });

    if (taskDb) {
      const rows = await notion.databases.query({
        database_id: taskDb.id,
        page_size: MAX_TASKS,
      });
      const taskPages = rows.results.filter(isFullPage).slice(0, MAX_TASKS);

      await db.task.deleteMany({ where: { source: "notion" } });
      for (const page of taskPages) {
        try {
          await db.task.create({
            data: {
              userId,
              title: propTitle(page.properties),
              status: detectStatus(page.properties),
              priority: "MEDIUM",
              deadline: detectDeadline(page.properties),
              source: "notion",
            },
          });
        } catch (err) {
          console.error("[notion/sync] skipping task row", page.id, err);
        }
      }
    }
  } catch (err) {
    console.error("[notion/sync] task database sync failed", err);
  }

  /* --------------------------- lastSyncAt ---------------------------- */
  try {
    await prisma.connection.updateMany({
      where: { userId, provider: "notion" },
      data: { lastSyncAt: new Date() },
    });
  } catch (err) {
    console.error("[notion/sync] failed to update lastSyncAt", err);
  }

  return upserts;
}

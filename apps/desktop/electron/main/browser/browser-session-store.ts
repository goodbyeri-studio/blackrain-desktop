import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { BrowserRouteScope } from "../../shared/browser-tabs";
import { BROWSER_PARTITION } from "./browser-policy";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const StoredBrowserTabV1Schema = z.object({
  browserTabId: identifierSchema,
  threadId: identifierSchema,
  routeKey: identifierSchema,
  url: z
    .string()
    .max(4096)
    .refine((value) => {
      if (value === "about:blank") return true;
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "Browser session URL 只允许 http(s) 或 about:blank"),
  title: z.string().max(1024),
  viewGeneration: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  touchedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

const StoredNavigationEntrySchema = z.object({
  url: z
    .string()
    .max(4096)
    .refine(isRestorableUrl, "Browser navigation entry 只允许 http(s) 或 about:blank"),
  title: z.string().max(1024),
});

const StoredBrowserTabSchema = StoredBrowserTabV1Schema.extend({
  origin: z.enum(["user", "agent", "popup", "restored"]),
  claim: z.object({
    controlOwner: z.enum(["user", "agent"]),
    turnId: identifierSchema.nullable(),
  }),
  handoff: z.boolean(),
  deliverable: z.boolean(),
  navigationEntries: z.array(StoredNavigationEntrySchema).max(128),
  activeNavigationIndex: z.number().int().min(-1).max(127),
  restorePolicy: z.literal("reload"),
  profileId: z.literal(BROWSER_PARTITION),
});

const BrowserSessionFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  tabs: z.array(StoredBrowserTabV1Schema).max(256),
});

const BrowserSessionFileSchema = z.object({
  schemaVersion: z.literal(2),
  tabs: z.array(StoredBrowserTabSchema).max(256),
});

export type StoredBrowserTab = z.infer<typeof StoredBrowserTabSchema>;

export class BrowserSessionStore {
  readonly #filePath?: string;
  readonly #tabs = new Map<string, StoredBrowserTab>();

  constructor(filePath?: string) {
    this.#filePath = filePath;
    if (!filePath) return;
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const parsed = parseSessionFile(raw);
      for (const tab of parsed.tabs) {
        this.#tabs.set(tab.browserTabId, tab);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Browser session state 无法读取，将从空状态启动");
      }
    }
  }

  list(scope: BrowserRouteScope): StoredBrowserTab[] {
    return [...this.#tabs.values()]
      .filter(
        (tab) =>
          tab.threadId === scope.threadId && tab.routeKey === scope.routeKey,
      )
      .sort((left, right) => left.touchedAt - right.touchedAt);
  }

  upsert(tab: Omit<StoredBrowserTab, "touchedAt">): void {
    this.#tabs.set(tab.browserTabId, { ...tab, touchedAt: Date.now() });
    if (this.#tabs.size > 256) {
      const oldest = [...this.#tabs.values()].sort(
        (left, right) => left.touchedAt - right.touchedAt,
      )[0];
      if (oldest) this.#tabs.delete(oldest.browserTabId);
    }
    this.#flush();
  }

  remove(browserTabId: string): void {
    if (!this.#tabs.delete(browserTabId)) return;
    this.#flush();
  }

  #flush(): void {
    if (!this.#filePath) return;
    mkdirSync(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({ schemaVersion: 2, tabs: [...this.#tabs.values()] }),
      "utf8",
    );
    renameSync(temporaryPath, this.#filePath);
  }
}

function parseSessionFile(value: unknown): z.infer<typeof BrowserSessionFileSchema> {
  const current = BrowserSessionFileSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = BrowserSessionFileV1Schema.parse(value);
  return {
    schemaVersion: 2,
    tabs: legacy.tabs.map((tab) => ({
      ...tab,
      origin: "restored" as const,
      claim: { controlOwner: "user" as const, turnId: null },
      handoff: false,
      deliverable: false,
      navigationEntries: [{ url: tab.url, title: tab.title }],
      activeNavigationIndex: 0,
      restorePolicy: "reload" as const,
      profileId: BROWSER_PARTITION,
    })),
  };
}

function isRestorableUrl(value: string): boolean {
  if (value === "about:blank") return true;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

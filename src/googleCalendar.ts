import { createHash } from "node:crypto";
import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { DateTime } from "luxon";
import { categories, type CategoryId } from "./categories.js";
import type { CollectedSource } from "./collect.js";
import { eventDescription, eventSummary } from "./format.js";
import { sourceById } from "./sources/index.js";
import { TIME_ZONE, type CalEvent, type Source, type SyncWindow } from "./types.js";

/** Marks events this tool owns, so it never touches anything added by hand. */
export const APP_TAG = "phl-urbanism-events";

export type GoogleEvent = calendar_v3.Schema$Event;

export type SyncReport = {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  errors: string[];
};

export type SyncOptions = {
  dryRun?: boolean;
  log?: (line: string) => void;
  /** For tests: a client to use instead of the one built from the environment. */
  client?: calendar_v3.Calendar;
  /** For tests: calendar IDs to use instead of those in src/categories.ts. */
  calendarIds?: Partial<Record<CategoryId, string>>;
};

export function hasGoogleCredentials(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

/**
 * Reads the service-account key from GOOGLE_SERVICE_ACCOUNT_KEY, as raw JSON or
 * base64. Tolerates common paste slips (surrounding quotes or whitespace, or the
 * "GOOGLE_SERVICE_ACCOUNT_KEY=" prefix), and never includes the key in errors.
 */
function serviceAccountCredentials(): { client_email: string; private_key: string } {
  let value = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").trim();
  value = value.replace(/^GOOGLE_SERVICE_ACCOUNT_KEY=/, "").replace(/^(['"])(.*)\1$/s, "$2").trim();
  if (!value) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set (see .env.example).");

  const json = value.startsWith("{") ? value : Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(json);
  } catch {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_KEY is not a valid service-account key: it should be the key file's JSON or that JSON base64-encoded (got ${value.length} characters).`,
    );
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is JSON but not a service-account key (no client_email or private_key).");
  }
  return credentials as { client_email: string; private_key: string };
}

export function googleClientFromEnv(): calendar_v3.Calendar {
  const googleAuth = new auth.GoogleAuth({
    credentials: serviceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  return calendar({ version: "v3", auth: googleAuth });
}

function keyOf(sourceId: string, uid: string): string {
  return `${sourceId}\u0000${uid}`;
}

function toGoogleEvent(source: Source, event: CalEvent): GoogleEvent {
  const body: GoogleEvent = {
    summary: eventSummary(source, event),
    location: event.location ?? "",
    description: eventDescription(source, event),
    start: event.allDay
      ? { date: event.start.toISODate()! }
      : { dateTime: event.start.toISO({ suppressMilliseconds: true })!, timeZone: TIME_ZONE },
    end: event.allDay
      ? { date: event.end.toISODate()! }
      : { dateTime: event.end.toISO({ suppressMilliseconds: true })!, timeZone: TIME_ZONE },
    ...(event.url?.startsWith("http") ? { source: { title: source.name, url: event.url } } : {}),
  };
  const alsoListedBy = (event.alsoListedBy ?? []).join(",");
  // The hash lets later runs skip events that have not changed.
  const hash = createHash("sha1").update(JSON.stringify([body, alsoListedBy])).digest("hex");
  body.extendedProperties = { private: { app: APP_TAG, source: source.id, uid: event.uid, alsoListedBy, hash } };
  return body;
}

function startOf(event: GoogleEvent): DateTime | null {
  const value = event.start?.dateTime ?? event.start?.date;
  if (!value) return null;
  const parsed = DateTime.fromISO(value, { zone: TIME_ZONE });
  return parsed.isValid ? parsed : null;
}

/** Every event this tool created in a calendar that ends after `from`. */
export async function listManagedEvents(client: calendar_v3.Calendar, calendarId: string, from: DateTime) {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const response = await client.events.list({
      calendarId,
      privateExtendedProperty: [`app=${APP_TAG}`],
      timeMin: from.toISO()!,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: false,
      maxResults: 2500,
      pageToken,
    });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return events;
}

/**
 * Retries rate limits and server errors with backoff. Google reports Calendar
 * rate limits as 403 "rateLimitExceeded" / "Rate Limit Exceeded", so the reason
 * and message are checked as well as the status.
 */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error: any) {
      const status = Number(error?.status ?? error?.code ?? error?.response?.status);
      const reasons = [
        ...(error?.errors ?? []),
        ...(error?.response?.data?.error?.errors ?? []),
      ].map((e: { reason?: string }) => e?.reason ?? "");
      const rateLimited = /rate ?limit|quota|usageLimits/i.test([error?.message, ...reasons].join(" "));
      const retryable = status === 429 || status >= 500 || rateLimited;
      if (!retryable || attempt >= 6) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000 + Math.random() * 500));
    }
  }
}

// Google throttles bursts of writes to one calendar, so writes go two at a time.
async function runPool(tasks: (() => Promise<void>)[], concurrency = 2) {
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(workers);
}

/**
 * Makes each category's calendar match its sources' events: creates new ones,
 * updates changed ones, and deletes ones a source no longer lists. Only events
 * tagged as ours are touched, and a source that failed to fetch keeps its
 * existing events. Moving a source to another category removes its events from
 * the old calendar.
 */
export async function syncToCalendars(
  collected: CollectedSource[],
  window: SyncWindow,
  options: SyncOptions = {},
): Promise<SyncReport> {
  const log = options.log ?? (() => {});
  const client = options.client ?? googleClientFromEnv();
  const report: SyncReport = { created: 0, updated: 0, deleted: 0, unchanged: 0, errors: [] };
  const tasks: (() => Promise<void>)[] = [];

  for (const category of categories) {
    const inCategory = collected.filter((c) => c.source.category === category.id);
    const calendarId = options.calendarIds?.[category.id] ?? category.calendarId;
    if (!calendarId) {
      if (inCategory.length > 0) report.errors.push(`No calendar ID set for "${category.name}" in src/categories.ts`);
      continue;
    }

    let existingEvents: GoogleEvent[];
    try {
      existingEvents = await withRetry(() => listManagedEvents(client, calendarId, window.from));
    } catch (error: any) {
      report.errors.push(`${category.name}: could not read calendar: ${error?.message ?? error}`);
      continue;
    }
    const existing = new Map<string, GoogleEvent[]>();
    for (const event of existingEvents) {
      const props = event.extendedProperties?.private ?? {};
      if (!props.source || !props.uid) continue;
      const key = keyOf(props.source, props.uid);
      existing.set(key, [...(existing.get(key) ?? []), event]);
    }

    const attempt = (label: string, run: () => Promise<unknown>, onSuccess: () => void) => {
      tasks.push(async () => {
        if (options.dryRun) {
          log(`[dry run] ${category.name}: ${label}`);
          onSuccess();
          return;
        }
        try {
          await withRetry(run);
          onSuccess();
        } catch (error: any) {
          report.errors.push(`${category.name}: ${label}: ${error?.message ?? error}`);
        }
      });
    };
    const remove = (event: GoogleEvent, why: string) =>
      attempt(
        `delete ${why} "${event.summary}"`,
        () => client.events.delete({ calendarId, eventId: event.id! }),
        () => report.deleted++,
      );

    for (const result of inCategory) {
      if (!result.ok) continue;
      const { source, events, coverage } = result;
      const wanted = new Set<string>();

      for (const event of events) {
        const key = keyOf(source.id, event.uid);
        wanted.add(key);
        const body = toGoogleEvent(source, event);
        const [current, ...extras] = existing.get(key) ?? [];
        for (const extra of extras) remove(extra, "duplicate");

        if (!current) {
          attempt(`create "${body.summary}"`, () => client.events.insert({ calendarId, requestBody: body }), () =>
            report.created++,
          );
        } else if (current.extendedProperties?.private?.hash !== body.extendedProperties!.private!.hash) {
          attempt(
            `update "${body.summary}"`,
            () => client.events.update({ calendarId, eventId: current.id!, requestBody: body }),
            () => report.updated++,
          );
        } else {
          report.unchanged++;
        }
      }

      // Delete this source's events that it no longer lists, but only inside the
      // range its fetch is known to cover.
      for (const [key, events] of existing) {
        if (wanted.has(key) || !key.startsWith(keyOf(source.id, ""))) continue;
        for (const event of events) {
          const start = startOf(event);
          if (start && start >= coverage.from && start <= coverage.to) remove(event, "removed");
        }
      }
    }

    // Events from a source that now belongs to a different category.
    for (const events of existing.values()) {
      for (const event of events) {
        const owner = sourceById(event.extendedProperties?.private?.source ?? "");
        if (owner && owner.category !== category.id) remove(event, "moved");
      }
    }
  }

  await runPool(tasks);
  return report;
}

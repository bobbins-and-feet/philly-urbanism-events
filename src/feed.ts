import { createHash } from "node:crypto";
import ical from "ical-generator";
import { DateTime } from "luxon";
import { categories } from "./categories.js";
import { collect, duplicateKey, syncWindow } from "./collect.js";
import { eventDescription, eventSummary, stripPrefix } from "./format.js";
import { googleClientFromEnv, hasGoogleCredentials, listManagedEvents } from "./googleCalendar.js";
import { sourceById, sources } from "./sources/index.js";
import { TIME_ZONE, type Source } from "./types.js";

/** One event in a custom feed, as served to the feed builder page and to calendar apps. */
export type FeedEvent = {
  id: string;
  sourceId: string;
  sourceName: string;
  /** Other sources that list the same event (see collect()). */
  alsoListedBy: string[];
  /** Title with the "[Source]" prefix, as calendars show it. */
  summary: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  url?: string;
  description?: string;
};

/** Custom feeds include events from up to a day ago. */
function feedStart(): DateTime {
  return DateTime.now().setZone(TIME_ZONE).minus({ days: 1 }).startOf("day");
}

function feedId(sourceId: string, uid: string): string {
  return `${createHash("sha1").update(`${sourceId}\u0000${uid}`).digest("hex")}@phl-urbanism-events`;
}

/** Reads events back out of the category calendars the sync keeps up to date. */
async function fromGoogle(selected: Source[]): Promise<FeedEvent[]> {
  const client = googleClientFromEnv();
  const needed = categories.filter((c) => selected.some((s) => s.category === c.id));

  const perCategory = await Promise.all(
    needed.map(async (category) => {
      if (!category.calendarId) throw new Error(`No calendar ID set for "${category.name}"`);
      return listManagedEvents(client, category.calendarId, feedStart());
    }),
  );

  const events: FeedEvent[] = [];
  for (const event of perCategory.flat()) {
    const props = event.extendedProperties?.private ?? {};
    const source = props.source ? sourceById(props.source) : undefined;
    if (!source || !props.uid) continue;
    const allDay = Boolean(event.start?.date);
    const start = event.start?.dateTime ?? event.start?.date;
    const end = event.end?.dateTime ?? event.end?.date ?? start;
    if (!start || !end) continue;

    events.push({
      id: feedId(source.id, props.uid),
      sourceId: source.id,
      sourceName: source.name,
      alsoListedBy: (props.alsoListedBy ?? "").split(",").filter(Boolean),
      summary: event.summary ?? "",
      title: stripPrefix(event.summary ?? ""),
      // Dates of all-day events are calendar dates, not instants.
      start: allDay ? start : DateTime.fromISO(start, { setZone: true }).setZone(TIME_ZONE).toISO()!,
      end: allDay ? end : DateTime.fromISO(end, { setZone: true }).setZone(TIME_ZONE).toISO()!,
      allDay,
      location: event.location || undefined,
      url: event.source?.url ?? undefined,
      description: event.description ?? undefined,
    });
  }
  return events;
}

let liveCache: { at: number; events: FeedEvent[] } | undefined;

/** Without Google credentials (local development), fetches every source directly. */
async function fromSources(selected: Source[]): Promise<FeedEvent[]> {
  if (!liveCache || Date.now() - liveCache.at > 10 * 60_000) {
    const collected = await collect(syncWindow());
    const events: FeedEvent[] = [];
    for (const result of collected) {
      if (!result.ok) continue;
      for (const event of result.events) {
        events.push({
          id: feedId(result.source.id, event.uid),
          sourceId: result.source.id,
          sourceName: result.source.name,
          alsoListedBy: event.alsoListedBy ?? [],
          summary: eventSummary(result.source, event),
          title: event.title,
          start: event.allDay ? event.start.toISODate()! : event.start.toISO()!,
          end: event.allDay ? event.end.toISODate()! : event.end.toISO()!,
          allDay: event.allDay,
          location: event.location,
          url: event.url,
          description: eventDescription(result.source, event),
        });
      }
    }
    liveCache = { at: Date.now(), events };
  }
  return liveCache.events;
}

function startOf(event: FeedEvent): DateTime {
  return event.allDay ? DateTime.fromISO(event.start, { zone: TIME_ZONE }) : DateTime.fromISO(event.start);
}

/**
 * Events for the chosen sources, soonest first. An event counts if any source
 * that lists it was chosen. Events listed in more than one category calendar
 * appear once, keeping the copy from the source highest in src/sources/index.ts.
 */
export async function loadFeedEvents(selected: Source[]): Promise<FeedEvent[]> {
  const all = hasGoogleCredentials() ? await fromGoogle(selected) : await fromSources(selected);
  const wanted = new Set(selected.map((s) => s.id));
  const priority = (e: FeedEvent) => sources.findIndex((s) => s.id === e.sourceId);

  const byKey = new Map<string, FeedEvent>();
  for (const event of all) {
    if (!wanted.has(event.sourceId) && !event.alsoListedBy.some((id) => wanted.has(id))) continue;
    const key = duplicateKey(event.title, startOf(event));
    const current = byKey.get(key);
    if (!current || priority(event) < priority(current)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => startOf(a).toMillis() - startOf(b).toMillis());
}

export function toICalendar(events: FeedEvent[], name: string): string {
  const calendar = ical({
    name,
    prodId: { company: "Philadelphia Urbanism Events", product: "custom-feed", language: "EN" },
    // Asks calendar apps to refresh every 6 hours; most decide for themselves.
    ttl: 6 * 60 * 60,
  });
  for (const event of events) {
    calendar.createEvent({
      id: event.id,
      summary: event.summary,
      start: event.allDay ? DateTime.fromISO(event.start, { zone: TIME_ZONE }) : DateTime.fromISO(event.start),
      end: event.allDay ? DateTime.fromISO(event.end, { zone: TIME_ZONE }) : DateTime.fromISO(event.end),
      allDay: event.allDay,
      location: event.location ?? null,
      description: event.description ?? null,
      url: event.url ?? null,
    });
  }
  return calendar.toString();
}

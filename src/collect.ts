import { DateTime } from "luxon";
import { sources as allSources } from "./sources/index.js";
import { TIME_ZONE, type CalEvent, type Source, type SyncWindow } from "./types.js";

/** How far ahead to sync. */
const DAYS_AHEAD = 180;

export type CollectedSource =
  | { source: Source; ok: true; events: CalEvent[]; coverage: SyncWindow; duplicatesDropped: number }
  | { source: Source; ok: false; error: string };

export function syncWindow(now = DateTime.now()): SyncWindow {
  const from = now.setZone(TIME_ZONE).startOf("day");
  return { from, to: from.plus({ days: DAYS_AHEAD }) };
}

/** Lowercased title without punctuation or notes like "(non-PBA event)". */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\bphilly\b/g, "philadelphia")
    .replace(/[^a-z0-9]+/g, "");
}

/** Two events with the same key are treated as the same event. */
export function duplicateKey(title: string, start: DateTime): string {
  return `${start.toUTC().toISO()}|${titleKey(title)}`;
}

/**
 * Fetches every source. A failing source is reported, not thrown, so one broken
 * site never stops the others from syncing.
 *
 * When two sources in the same category list the same event (same start and
 * title), the earlier source in the list keeps it and the other is recorded in
 * its alsoListedBy, so custom feeds can still include it for either source.
 * Duplicates across categories are kept, so each category calendar is complete.
 */
export async function collect(window: SyncWindow, sources: Source[] = allSources): Promise<CollectedSource[]> {
  const settled = await Promise.allSettled(sources.map((source) => source.fetchEvents(window)));
  const seen = new Map<string, { event: CalEvent; sourceId: string }>();

  return settled.map((result, i): CollectedSource => {
    const source = sources[i];
    if (result.status === "rejected") {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return { source, ok: false, error };
    }

    const kept: CalEvent[] = [];
    for (const event of result.value.events) {
      const key = `${source.category}|${duplicateKey(event.title, event.start)}`;
      const original = seen.get(key);
      if (original) {
        const listed = original.event.alsoListedBy ?? [];
        if (original.sourceId !== source.id && !listed.includes(source.id)) {
          original.event.alsoListedBy = [...listed, source.id];
        }
        continue;
      }
      seen.set(key, { event, sourceId: source.id });
      kept.push(event);
    }
    return {
      source,
      ok: true,
      events: kept,
      coverage: result.value.coverage,
      duplicatesDropped: result.value.events.length - kept.length,
    };
  });
}

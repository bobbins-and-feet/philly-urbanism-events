import { collect, syncWindow } from "./collect.js";
import { syncToCalendars, type SyncOptions, type SyncReport } from "./googleCalendar.js";

export type RunSummary = {
  window: { from: string; to: string };
  sources: { id: string; ok: boolean; events?: number; duplicatesDropped?: number; error?: string }[];
  calendar: SyncReport;
};

/** Fetches every source and syncs the results to the category calendars. */
export async function runSync(options: SyncOptions = {}): Promise<RunSummary> {
  const window = syncWindow();
  const collected = await collect(window);
  const calendar = await syncToCalendars(collected, window, options);

  return {
    window: { from: window.from.toISODate()!, to: window.to.toISODate()! },
    sources: collected.map((c) =>
      c.ok
        ? { id: c.source.id, ok: true, events: c.events.length, duplicatesDropped: c.duplicatesDropped }
        : { id: c.source.id, ok: false, error: c.error },
    ),
    calendar,
  };
}

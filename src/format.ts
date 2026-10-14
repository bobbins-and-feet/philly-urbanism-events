import type { CalEvent, Source } from "./types.js";

const MAX_DESCRIPTION = 8000;

/** Event title as shown in calendars, e.g. "[SEPTA] SEPTA Board Regular Meeting". */
export function eventSummary(source: Source, event: CalEvent): string {
  return `[${source.shortName}] ${event.title}`;
}

export function eventDescription(source: Source, event: CalEvent): string {
  return [event.description, event.url && `More info: ${event.url}`, `Source: ${source.name}`]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_DESCRIPTION);
}

/** Removes the "[Source] " prefix from a summary. */
export function stripPrefix(summary: string): string {
  return summary.replace(/^\[[^\]]*\]\s*/, "");
}

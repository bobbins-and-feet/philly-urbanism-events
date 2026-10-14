import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import type { CalEvent, SyncWindow } from "./types.js";

/** Decodes HTML entities, strips tags and tidies whitespace. */
export function plainText(html: string | undefined): string {
  if (!html) return "";
  const $ = cheerio.load(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"));
  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Coverage for a source that lists upcoming events but may cut off early: it is
 * complete from the start of the window through the day of its last event.
 */
export function coverageThroughLastEvent(events: CalEvent[], window: SyncWindow): SyncWindow {
  if (events.length === 0) return { from: window.from, to: window.from };
  const last = DateTime.max(...events.map((e) => e.start))!;
  return { from: window.from, to: DateTime.min(last.endOf("day"), window.to) };
}

export function inWindow(event: CalEvent, window: SyncWindow): boolean {
  return event.end > window.from && event.start < window.to;
}

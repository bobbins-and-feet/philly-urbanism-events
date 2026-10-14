import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { coverageThroughLastEvent, inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// A NationBuilder site. The events page lists upcoming events across a few pages
// (/events?page=2). Note the bare domain doesn't resolve; www. is required.
const SITE = "https://www.transitforwardphilly.org";
const MAX_PAGES = 5;

function parsePage(html: string): CalEvent[] {
  const $ = cheerio.load(html);
  const events: CalEvent[] = [];

  $(".event-item").each((_, item) => {
    const el = $(item);
    const day = el.find(".event-day").text().trim();
    const [monthYear, time] = el
      .find(".event-date span")
      .map((__, span) => $(span).text().trim())
      .get();
    const links = el.find(".event-title a");
    const href = links.first().attr("href");
    const title = links.first().text().trim();
    // The second link reads " — Venue".
    const location = links.eq(1).text().replace(/^[\s ]*[—–-][\s ]*/, "").trim();
    if (!href || !title || !day || !monthYear) return;

    const start = DateTime.fromFormat(`${day} ${monthYear} ${time ?? ""}`.trim(), "d MMMM, yyyy hh:mm a", {
      zone: TIME_ZONE,
    });
    if (!start.isValid) return;

    events.push({
      uid: href,
      title,
      start,
      end: start.plus({ hours: 2 }),
      allDay: false,
      location: location || undefined,
      url: new URL(href, SITE).toString(),
    });
  });

  return events;
}

export const transitForward: SourceAdapter = {
  id: "transit-forward",
  name: "Transit Forward Philadelphia",
  shortName: "Transit Forward",
  async fetchEvents(window) {
    const byUid = new Map<string, CalEvent>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const found = parsePage(await fetchText(`${SITE}/events?page=${page}`));
      if (found.length === 0) break;
      const before = byUid.size;
      for (const event of found) byUid.set(event.uid, event);
      // NationBuilder repeats the last page for out-of-range page numbers.
      if (byUid.size === before) break;
    }

    const events = [...byUid.values()].filter((e) => inWindow(e, window));
    return { events, coverage: coverageThroughLastEvent(events, window) };
  },
};

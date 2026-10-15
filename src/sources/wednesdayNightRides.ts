import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { coverageThroughLastEvent, inWindow, plainText } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// Wednesday Night Rides, a biweekly social ride. Their Jekyll site has an Atom
// feed with one post per ride, titled "2026-10-14 | Southwest Bikeways" and
// posted a few days before. Each ride's page lists the details as
// "<strong>Start:</strong> …<br>" lines, which is where the time and place are.
// The feed only holds the last 10 posts, so coverage stops at the last ride.
const FEED_URL = "https://www.wednightrides.org/feed.xml";

/** Their usual start when a post doesn't say: meet at 7pm. */
const DEFAULT_START = { hour: 19, minute: 0 };

type Entry = { title?: string | { "#text": string }; link?: { href?: string } | { href?: string }[] };

function text(value: Entry["title"]): string {
  return typeof value === "object" && value ? value["#text"] : (value ?? "");
}

function href(link: Entry["link"]): string | undefined {
  return (Array.isArray(link) ? link[0] : link)?.href;
}

/** The "Label: value" lines in a ride page's header. */
function rideDetails(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const header = $(".article-header").html() ?? "";
  const details: Record<string, string> = {};
  // Each detail starts at a <strong> label and runs to the next line break.
  for (const segment of header.split(/<strong>/i).slice(1)) {
    const match = /^([A-Za-z ]+):\s*(.+)$/s.exec(plainText(segment.split(/<br\s*\/?>/i)[0]));
    if (match) details[match[1].trim().toLowerCase()] = match[2].replace(/\s+/g, " ").replace(/\.$/, "").trim();
  }
  return details;
}

/** "Meet at 7pm, roll at 7:10pm" -> the first time mentioned. */
function startTime(time: string | undefined): { hour: number; minute: number } {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(time ?? "");
  if (!match) return DEFAULT_START;
  const hour = (Number(match[1]) % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return { hour, minute: Number(match[2] ?? 0) };
}

export const wednesdayNightRides: SourceAdapter = {
  id: "wednesday-night-rides",
  name: "Wednesday Night Rides",
  shortName: "WNR",
  // Indego and the Bicycle Coalition list upcoming rides before WNR posts details.
  seriesTitles: ["Wednesday Night Rides"],
  async fetchEvents(window) {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", isArray: (name) => name === "entry" });
    const entries: Entry[] = parser.parse(await fetchText(FEED_URL))?.feed?.entry ?? [];

    const rides = entries
      .map((entry) => {
        const match = /^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/.exec(plainText(text(entry.title)));
        const url = href(entry.link);
        return match && url ? { date: match[1], name: match[2].trim(), url } : null;
      })
      .filter((ride): ride is { date: string; name: string; url: string } => ride !== null)
      // Only open the pages of rides that haven't happened yet.
      .filter((ride) => DateTime.fromISO(ride.date, { zone: TIME_ZONE }).endOf("day") >= window.from);

    const events: CalEvent[] = [];
    for (const ride of rides) {
      const details = rideDetails(await fetchText(ride.url));
      const start = DateTime.fromISO(ride.date, { zone: TIME_ZONE }).set({ ...startTime(details.time), second: 0 });
      if (!start.isValid) continue;

      const description = [
        details.start && details.end && `From ${details.start} to ${details.end}.`,
        details.time,
        details.length && `Length: ${details.length}.`,
        details["level of difficulty"] && `Difficulty: ${details["level of difficulty"]}.`,
        "Free, all are welcome. Bring lights for evening rides.",
      ]
        .filter(Boolean)
        .join("\n");

      const event: CalEvent = {
        uid: ride.url,
        title: `Wednesday Night Rides: ${ride.name}`,
        // Indego and the Bicycle Coalition list these as plain "Wednesday Night
        // Rides", so match on that to treat them as the same event.
        matchTitle: "Wednesday Night Rides",
        start,
        end: start.plus({ hours: 2 }),
        allDay: false,
        location: details.start,
        url: ride.url,
        description,
      };
      if (inWindow(event, window)) events.push(event);
    }

    return { events, coverage: coverageThroughLastEvent(events, window) };
  },
};

import { XMLParser } from "fast-xml-parser";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { coverageThroughLastEvent, inWindow, plainText } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// The site runs the Modern Events Calendar WordPress plugin. Its RSS feed carries
// structured mec:* dates but only lists the next 10 occurrences, and ignores paging,
// so coverage stops at the last listed event.
const FEED_URL = "https://bicyclecoalition.org/events/feed/";

type FeedItem = {
  title?: string;
  link?: string;
  guid?: string | { "#text": string };
  description?: string;
  "mec:startDate"?: string;
  "mec:startHour"?: string;
  "mec:endDate"?: string;
  "mec:endHour"?: string;
  "mec:location"?: string;
  "mec:category"?: string;
};

function at(date: string, hour: string | undefined): DateTime | null {
  if (!hour?.trim()) return null;
  const parsed = DateTime.fromFormat(`${date} ${hour.trim().toUpperCase()}`, "yyyy-MM-dd h:mm a", { zone: TIME_ZONE });
  return parsed.isValid ? parsed : null;
}

export const bicycleCoalition: SourceAdapter = {
  id: "bicycle-coalition",
  name: "Bicycle Coalition of Greater Philadelphia",
  shortName: "Bike Coalition",
  async fetchEvents(window) {
    const xml = await fetchText(FEED_URL);
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (name) => name === "item" });
    const items: FeedItem[] = parser.parse(xml)?.rss?.channel?.item ?? [];
    const events: CalEvent[] = [];

    for (const item of items) {
      const startDate = item["mec:startDate"];
      if (!startDate || !item.link) continue;
      const endDate = item["mec:endDate"] || startDate;

      const timedStart = at(startDate, item["mec:startHour"]);
      let start: DateTime;
      let end: DateTime;
      let allDay = false;
      if (timedStart) {
        start = timedStart;
        end = at(endDate, item["mec:endHour"]) ?? start.plus({ hours: 2 });
        if (end <= start) end = start.plus({ hours: 2 });
      } else {
        allDay = true;
        start = DateTime.fromISO(startDate, { zone: TIME_ZONE });
        end = DateTime.fromISO(endDate, { zone: TIME_ZONE }).plus({ days: 1 });
      }
      if (!start.isValid) continue;

      const description = plainText(item.description).replace(/\s*\[…\]\s*$/, "…");
      const category = item["mec:category"]?.trim();
      const event: CalEvent = {
        // Repeating events share one link, so the date is part of the ID.
        uid: `${item.link}@${startDate}`,
        title: plainText(item.title) || "(untitled event)",
        start,
        end,
        allDay,
        location: plainText(item["mec:location"]) || undefined,
        url: item.link,
        description: [description, category && `Categories: ${category}`].filter(Boolean).join("\n\n") || undefined,
      };
      if (inWindow(event, window)) events.push(event);
    }

    return { events, coverage: coverageThroughLastEvent(events, window) };
  },
};

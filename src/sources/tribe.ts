import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow, plainText } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// Sites running The Events Calendar (WordPress) expose a REST API that returns
// every event in a date range. Its .ics export only covers one page of the list,
// so the API is the more complete option.

type TribeVenue = { venue?: string; address?: string; city?: string; state?: string; stateprovince?: string };

export type TribeEvent = {
  id: number;
  url: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  timezone?: string;
  venue?: TribeVenue | unknown[];
  categories?: { name: string }[];
};

type TribeResponse = { events?: TribeEvent[]; total_pages?: number };

/** Some sites are set to a UTC offset but enter local times, so fall back to Philadelphia time. */
function zoneFor(timezone: string | undefined): string {
  return timezone && DateTime.now().setZone(timezone).isValid && !/^UTC/i.test(timezone) ? timezone : TIME_ZONE;
}

function venueOf(event: TribeEvent): TribeVenue {
  return event.venue && !Array.isArray(event.venue) ? (event.venue as TribeVenue) : {};
}

export function tribeSource(options: {
  id: string;
  name: string;
  shortName: string;
  /** Site root, e.g. "https://www.rideindego.com". */
  siteUrl: string;
  /** Return false to skip an event, e.g. one outside Philadelphia. */
  include?: (event: TribeEvent) => boolean;
}): SourceAdapter {
  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    async fetchEvents(window) {
      const raw: TribeEvent[] = [];
      for (let page = 1, totalPages = 1; page <= totalPages && page <= 20; page++) {
        const url = new URL("/wp-json/tribe/events/v1/events", options.siteUrl);
        url.searchParams.set("per_page", "50");
        url.searchParams.set("page", String(page));
        url.searchParams.set("start_date", window.from.toFormat("yyyy-MM-dd HH:mm:ss"));
        url.searchParams.set("end_date", window.to.toFormat("yyyy-MM-dd HH:mm:ss"));
        const text = await fetchText(url.toString(), { Accept: "application/json" });
        // Some sites put an HTML comment before the JSON.
        const body: TribeResponse = JSON.parse(text.slice(text.indexOf("{")));
        raw.push(...(body.events ?? []));
        totalPages = body.total_pages ?? 1;
      }

      const events: CalEvent[] = [];
      for (const item of raw) {
        if (options.include && !options.include(item)) continue;
        const zone = zoneFor(item.timezone);
        let start = DateTime.fromSQL(item.start_date, { zone });
        let end = DateTime.fromSQL(item.end_date, { zone });
        if (!start.isValid) continue;
        if (item.all_day) {
          start = start.startOf("day");
          end = (end.isValid ? end : start).startOf("day").plus({ days: 1 });
        } else if (!end.isValid || end <= start) {
          end = start.plus({ hours: 1 });
        }

        const venue = venueOf(item);
        const location = [venue.venue, venue.address, venue.city].map((part) => plainText(part)).filter(Boolean);
        const event: CalEvent = {
          uid: String(item.id),
          title: plainText(item.title) || "(untitled event)",
          start: start.setZone(TIME_ZONE),
          end: end.setZone(TIME_ZONE),
          allDay: item.all_day,
          location: [...new Set(location)].join(", ") || undefined,
          url: item.url,
          description: plainText(item.description) || undefined,
        };
        if (inWindow(event, window)) events.push(event);
      }

      return { events, coverage: window };
    },
  };
}

/** True when an event's venue is in Philadelphia, for statewide organizations. */
export function inPhiladelphia(event: TribeEvent): boolean {
  return /philadelphia/i.test(venueOf(event).city ?? "");
}

/**
 * Center City District's calendar is mostly daily Dilworth Park programming
 * (sponsored happy hours, the holiday market, trivia). This keeps everything
 * else, such as Open Streets.
 */
export function notAtDilworthPark(event: TribeEvent): boolean {
  const atDilworth = /dilworth/i.test(venueOf(event).venue ?? "");
  const tagged = (event.categories ?? []).some((c) => /dilworth park/i.test(c.name));
  return !atDilworth && !tagged;
}

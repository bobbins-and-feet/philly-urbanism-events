import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { BROWSER_HEADERS, fetchText } from "../http.js";
import { coverageThroughLastEvent, inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// www.septa.org is a JavaScript app; the event pages are served by the WordPress
// site behind it at wwww.septa.org (four w's). That server returns 403 unless the
// request looks like it comes from a browser.
const EVENTS_URL = "https://wwww.septa.org/events/";

export const septa: SourceAdapter = {
  id: "septa",
  name: "SEPTA",
  shortName: "SEPTA",
  async fetchEvents(window) {
    const $ = cheerio.load(await fetchText(EVENTS_URL, BROWSER_HEADERS));
    const events: CalEvent[] = [];

    $("ul.event-list li a").each((_, link) => {
      const anchor = $(link);
      const href = anchor.attr("href");
      const datetime = anchor.find("time").attr("datetime");
      if (!href || !datetime) return;

      const start = DateTime.fromISO(datetime).setZone(TIME_ZONE);
      if (!start.isValid) return;
      anchor.find("strong").remove();
      const title = anchor.text().trim();

      const event: CalEvent = {
        uid: new URL(href).pathname,
        title: title || "(untitled event)",
        start,
        end: start.plus({ hours: 2 }),
        allDay: false,
        url: href,
      };
      if (inWindow(event, window)) events.push(event);
    });

    return { events, coverage: coverageThroughLastEvent(events, window) };
  },
};

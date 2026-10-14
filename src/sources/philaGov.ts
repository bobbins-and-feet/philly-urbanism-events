import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { coverageThroughLastEvent, inWindow, plainText } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// phila.gov department pages show an "Events" list from the Simple Calendar
// WordPress plugin, rendered on the server with schema.org markup. The list only
// shows the next few events, so coverage stops at the last one.
export function philaGovCalendar(options: { id: string; name: string; shortName: string; pageUrl: string }): SourceAdapter {
  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    async fetchEvents(window) {
      const $ = cheerio.load(await fetchText(options.pageUrl));
      const byId = new Map<string, CalEvent>();

      $("li.simcal-event").each((_, item) => {
        const li = $(item);
        const id = li.find("[data-open]").first().attr("data-open");
        const title = li.find(".simcal-event-title").first().text().trim();
        const startIso = li.find("[itemprop=startDate]").first().attr("content");
        const endIso = li.find("[itemprop=endDate]").first().attr("content");
        if (!id || !title || !startIso) return;

        const start = DateTime.fromISO(startIso, { setZone: true }).setZone(TIME_ZONE);
        if (!start.isValid) return;
        // An event with no times is shown with a date only.
        const allDay = li.find(".simcal-event-start-time").length === 0;
        let end = endIso ? DateTime.fromISO(endIso, { setZone: true }).setZone(TIME_ZONE) : start;
        if (allDay) end = (end.isValid && end > start ? end : start).startOf("day").plus({ days: 1 });
        else if (!end.isValid || end <= start) end = start.plus({ hours: 1 });

        const event: CalEvent = {
          uid: id,
          title,
          start: allDay ? start.startOf("day") : start,
          end,
          allDay,
          location: li.find("[itemprop=location] meta[itemprop=address]").first().attr("content")?.trim() || undefined,
          url: `${options.pageUrl}#${id}`,
          description: plainText(li.find(".simcal-event-description").first().html() ?? "") || undefined,
        };
        if (inWindow(event, window)) byId.set(id, event);
      });

      const events = [...byId.values()];
      return { events, coverage: coverageThroughLastEvent(events, window) };
    },
  };
}

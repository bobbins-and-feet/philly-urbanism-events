import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// The events page at dvrpc.org/stay-connected/events loads this JSON endpoint.
// "combined" includes DVRPC's own meetings and partner events.
const API = "https://www.dvrpc.org/dvrpc-calendar/events-api";

type DvrpcEvent = {
  Title: string;
  StartDate: string;
  EndDate?: string;
  StartTime?: string;
  EndTime?: string;
  Info?: string;
};

export const dvrpc: SourceAdapter = {
  id: "dvrpc",
  name: "Delaware Valley Regional Planning Commission",
  shortName: "DVRPC",
  async fetchEvents(window) {
    const url = new URL(API);
    url.searchParams.set("calendar", "combined");
    url.searchParams.set("timeMin", window.from.toISODate()!);
    url.searchParams.set("timeMax", window.to.toISODate()!);
    const body = JSON.parse(await fetchText(url.toString(), { Accept: "application/json" }));
    if (body.success === false) throw new Error("DVRPC events API reported failure");

    const events: CalEvent[] = [];
    for (const item of (body.events ?? []) as DvrpcEvent[]) {
      if (!item.Title || !item.StartDate) continue;
      if (/offices? closed/i.test(item.Title)) continue;

      const endDate = item.EndDate || item.StartDate;
      const allDay = !item.StartTime;
      let start: DateTime;
      let end: DateTime;
      if (allDay) {
        start = DateTime.fromISO(item.StartDate, { zone: TIME_ZONE });
        end = DateTime.fromISO(endDate, { zone: TIME_ZONE }).plus({ days: 1 });
      } else {
        start = DateTime.fromISO(`${item.StartDate}T${item.StartTime}`, { zone: TIME_ZONE });
        end = item.EndTime
          ? DateTime.fromISO(`${endDate}T${item.EndTime}`, { zone: TIME_ZONE })
          : start.plus({ hours: 1 });
        if (!end.isValid || end <= start) end = start.plus({ hours: 1 });
      }
      if (!start.isValid) continue;

      const event: CalEvent = {
        // The API has no event IDs, so the date and title identify an event.
        uid: `${item.StartDate}|${item.Title}`,
        title: item.Title.trim(),
        start,
        end,
        allDay,
        url: item.Info?.startsWith("http") ? item.Info : "https://www.dvrpc.org/stay-connected/events",
      };
      if (inWindow(event, window)) events.push(event);
    }

    return { events, coverage: window };
  },
};

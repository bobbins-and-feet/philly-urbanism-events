import ical, { type ParameterValue, type VEvent } from "node-ical";
import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow, plainText } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

function value(v: ParameterValue | undefined): string {
  if (v === undefined || v === null) return "";
  return typeof v === "string" ? v : String(v.val ?? "");
}

/** node-ical builds date-only values as local midnight, so read the local date parts. */
function fullDay(d: Date): DateTime {
  return DateTime.fromObject(
    { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    { zone: TIME_ZONE },
  );
}

/** A source that already publishes an iCalendar (.ics) feed. */
export function icsSource(options: { id: string; name: string; shortName: string; url: string }): SourceAdapter {
  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    async fetchEvents(window) {
      const parsed = ical.sync.parseICS(await fetchText(options.url));
      const events: CalEvent[] = [];

      for (const component of Object.values(parsed)) {
        if (!component || component.type !== "VEVENT") continue;
        const vevent = component as VEvent;
        if (vevent.status === "CANCELLED") continue;

        const instances = ical.expandRecurringEvent(vevent, {
          from: window.from.toJSDate(),
          to: window.to.toJSDate(),
          expandOngoing: true,
        });

        for (const instance of instances) {
          const source = instance.event;
          if (source.status === "CANCELLED") continue;

          const start = instance.isFullDay
            ? fullDay(instance.start)
            : DateTime.fromJSDate(instance.start).setZone(TIME_ZONE);
          let end = instance.isFullDay
            ? fullDay(instance.end)
            : DateTime.fromJSDate(instance.end).setZone(TIME_ZONE);
          if (end <= start) end = instance.isFullDay ? start.plus({ days: 1 }) : start.plus({ hours: 1 });

          const event: CalEvent = {
            // Every instance of a repeating event shares a UID, so add its start.
            uid: instance.isRecurring ? `${vevent.uid}@${start.toUTC().toISO()}` : vevent.uid,
            title: value(instance.summary) || "(untitled event)",
            start,
            end,
            allDay: instance.isFullDay,
            location: value(source.location) || undefined,
            url: value(source.url as ParameterValue | undefined) || undefined,
            description: plainText(value(source.description)) || undefined,
          };
          if (inWindow(event, window)) events.push(event);
        }
      }

      // A full feed is authoritative for the whole window.
      return { events, coverage: window };
    },
  };
}

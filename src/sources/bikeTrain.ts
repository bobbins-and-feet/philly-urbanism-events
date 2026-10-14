import { DateTime } from "luxon";
import { fetchText } from "../http.js";
import { inWindow } from "../text.js";
import { TIME_ZONE, type CalEvent, type SourceAdapter } from "../types.js";

// phillybiketrain.org loads its schedule from this tracker API. Several routes
// run on the same mornings, so they become one calendar event per day, with
// each route listed in the description.
const API = "https://tracker-2-production.up.railway.app/api/rides";
const SITE = "https://www.phillybiketrain.org";

type Ride = {
  id: string;
  date: string;
  status?: string;
  route_name?: string;
  route_slug?: string;
  departure_time?: string;
  is_official?: boolean;
};

export const bikeTrain: SourceAdapter = {
  id: "philly-bike-train",
  name: "Philly Bike Train",
  shortName: "Bike Train",
  async fetchEvents(window) {
    const url = new URL(API);
    url.searchParams.set("from_date", window.from.toISODate()!);
    url.searchParams.set("days", String(Math.ceil(window.to.diff(window.from, "days").days)));
    url.searchParams.set("limit", "500");
    const body = JSON.parse(await fetchText(url.toString(), { Accept: "application/json" }));
    if (body.success === false) throw new Error("Bike Train API reported failure");

    // Only the organizers' own routes; anyone can publish a one-off ride.
    const rides = ((body.data ?? []) as Ride[]).filter(
      (r) => r.is_official && r.departure_time && !/cancel/i.test(r.status ?? ""),
    );

    const byDay = new Map<string, Ride[]>();
    for (const ride of rides) {
      // Dates come as UTC midnight of the local ride date.
      const day = ride.date.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), ride]);
    }

    const events: CalEvent[] = [];
    for (const [day, dayRides] of byDay) {
      const departures = dayRides
        .map((ride) => ({ ride, at: DateTime.fromISO(`${day}T${ride.departure_time}`, { zone: TIME_ZONE }) }))
        .filter((d) => d.at.isValid)
        .sort((a, b) => a.at.toMillis() - b.at.toMillis() || (a.ride.route_name ?? "").localeCompare(b.ride.route_name ?? ""));
      if (departures.length === 0) continue;

      const start = departures[0].at;
      const routes = departures.map(
        ({ ride, at }) =>
          `• ${at.toFormat("h:mm a")}: ${ride.route_name ?? "Route"}${ride.route_slug ? ` (${SITE}/${ride.route_slug})` : ""}`,
      );
      const event: CalEvent = {
        uid: day,
        title: departures.length === 1 ? `Philly Bike Train: ${departures[0].ride.route_name}` : "Philly Bike Train",
        start,
        end: DateTime.max(...departures.map((d) => d.at))!.plus({ minutes: 45 }),
        allDay: false,
        url: SITE,
        description: `Group bike commutes. Join at the start or anywhere along the route.\n\n${routes.join("\n")}`,
      };
      if (inWindow(event, window)) events.push(event);
    }

    return { events, coverage: window };
  },
};

import type { CategoryId } from "../categories.js";
import type { Source, SourceAdapter } from "../types.js";
import { bicycleCoalition } from "./bicycleCoalition.js";
import { bikeTrain } from "./bikeTrain.js";
import { cityCouncil } from "./cityCouncil.js";
import { dvrpc } from "./dvrpc.js";
import { icsSource } from "./ics.js";
import { philaGovCalendar } from "./philaGov.js";
import { railPark } from "./railPark.js";
import { septa } from "./septa.js";
import { transitForward } from "./transitForward.js";
import { inPhiladelphia, notAtDilworthPark, tribeSource } from "./tribe.js";

function listed(category: CategoryId, homepage: string, adapter: SourceAdapter): Source {
  return { ...adapter, category, homepage };
}

/**
 * Every source to sync. Order sets priority when two sources list the same event:
 * the organizer's own listing is kept over a copy on an aggregator, so groups
 * come first, then agencies, then sites that collect other groups' events.
 * Order also sets how sources are listed in the feed builder.
 */
export const sources: Source[] = [
  // Advocacy groups
  listed(
    "advocacy",
    "https://www.5thsqadvocacy.org/",
    icsSource({
      id: "5th-square-advocacy",
      name: "5th Square Advocacy",
      shortName: "5th Square",
      url: "https://calendar.google.com/calendar/ical/c63d0ae0e83964f70de6fe485c1c064f0f5f4aefd2c335b684aaadf6b4409a92%40group.calendar.google.com/public/basic.ics",
    }),
  ),
  listed(
    "advocacy",
    "https://bikeaction.org/",
    icsSource({
      id: "philly-bike-action",
      name: "Philly Bike Action",
      shortName: "PBA",
      url: "https://bikeaction.org/events/calendar/all/",
    }),
  ),
  listed("advocacy", "https://www.transitforwardphilly.org/", transitForward),
  listed(
    "advocacy",
    "https://cleanair.org/",
    tribeSource({
      id: "clean-air-council",
      name: "Clean Air Council",
      shortName: "Clean Air Council",
      siteUrl: "https://cleanair.org",
      // The Council works statewide; keep Philadelphia events only.
      include: inPhiladelphia,
    }),
  ),
  listed("rides", "https://www.phillybiketrain.org/", bikeTrain),
  listed("public-space", "https://www.therailpark.org/", railPark),

  // Government and agencies
  listed("government", "https://phila.legistar.com/Calendar.aspx", cityCouncil),
  listed(
    "government",
    "https://www.phila.gov/departments/philadelphia-city-planning-commission/",
    philaGovCalendar({
      id: "city-planning-commission",
      name: "Philadelphia City Planning Commission",
      shortName: "City Planning",
      pageUrl: "https://www.phila.gov/departments/philadelphia-city-planning-commission/",
    }),
  ),
  listed(
    "government",
    "https://www.phila.gov/departments/office-of-transportation-and-infrastructure-systems/",
    philaGovCalendar({
      id: "otis",
      name: "Office of Transportation and Infrastructure Systems",
      shortName: "OTIS",
      pageUrl: "https://www.phila.gov/departments/office-of-transportation-and-infrastructure-systems/",
    }),
  ),
  listed("government", "https://www.septa.org/events/", septa),
  listed("government", "https://www.dvrpc.org/stay-connected/events", dvrpc),

  // Sites that also list other groups' events
  listed(
    "public-space",
    "https://centercityphila.org/",
    tribeSource({
      id: "center-city-district",
      name: "Center City District",
      shortName: "Center City District",
      siteUrl: "https://centercityphila.org",
      // Remove this line to include the Dilworth Park programming too.
      include: notAtDilworthPark,
    }),
  ),
  listed(
    "rides",
    "https://www.rideindego.com/",
    tribeSource({
      id: "indego",
      name: "Indego",
      shortName: "Indego",
      siteUrl: "https://www.rideindego.com",
    }),
  ),
  listed("rides", "https://bicyclecoalition.org/", bicycleCoalition),
];

export function sourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

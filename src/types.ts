import type { DateTime } from "luxon";
import type { CategoryId } from "./categories.js";

export const TIME_ZONE = "America/New_York";

/** One event, normalized from whatever shape its source publishes. */
export type CalEvent = {
  /** Stable ID within its source; used to match the event on later runs. */
  uid: string;
  title: string;
  start: DateTime;
  end: DateTime;
  allDay: boolean;
  location?: string;
  url?: string;
  description?: string;
  /**
   * Title to use when checking for the same event listed by another source, if
   * it differs from the title shown (e.g. "Wednesday Night Rides" for
   * "Wednesday Night Rides: Southwest Bikeways").
   */
  matchTitle?: string;
  /** Other sources in the same category that list this event; set by collect(). */
  alsoListedBy?: string[];
};

/** The date range the sync looks at. */
export type SyncWindow = { from: DateTime; to: DateTime };

export type SourceResult = {
  events: CalEvent[];
  /**
   * The range this fetch is known to be complete for. Calendar events from this
   * source inside the range that are no longer listed get deleted; anything
   * outside it is left alone (e.g. a feed that only shows the next 10 events).
   */
  coverage: SyncWindow;
};

/** What an adapter in src/sources/ provides. */
export type SourceAdapter = {
  id: string;
  name: string;
  /** Prefix shown in event titles, e.g. "[SEPTA]". */
  shortName: string;
  fetchEvents(window: SyncWindow): Promise<SourceResult>;
};

/** An adapter as listed in src/sources/index.ts. */
export type Source = SourceAdapter & {
  category: CategoryId;
  /** The organization's website, linked from the feed builder. */
  homepage: string;
};

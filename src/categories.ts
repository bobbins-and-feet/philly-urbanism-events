/**
 * Each category gets its own Google Calendar, so people can subscribe to and
 * toggle the kinds of events they care about.
 *
 * To set one up: create the calendar in the shared Google account, share it with
 * the service account ("Make changes to events"), make it public, and paste its
 * Calendar ID below. Calendar IDs aren't secret: they appear in public subscribe
 * links. A category without an ID is skipped by the sync and reported as an error.
 */
export type CategoryId = "advocacy" | "government" | "rides" | "public-space";

export type Category = {
  id: CategoryId;
  name: string;
  description: string;
  calendarId: string;
};

export const categories: Category[] = [
  {
    id: "advocacy",
    name: "Advocacy groups",
    description: "Meetings, actions and socials from Philadelphia's urbanist and transit advocacy groups.",
    calendarId: "f0d99d0d70c446e566f0159d668a9c68b2abf93ba8392f390a37296d474d7ea2@group.calendar.google.com",
  },
  {
    id: "government",
    name: "Government & agencies",
    description: "City Council hearings, planning meetings, SEPTA board meetings and regional planning.",
    calendarId: "8b549ab816788da9a3f9ea3b69352cb7c10207a78eebe78dbaa39c4ce5277569@group.calendar.google.com",
  },
  {
    id: "rides",
    name: "Rides & bike events",
    description: "Group rides, bike trains and cycling events.",
    calendarId: "5c292cf6b4321eaed28c7b69cf51ecadefb416bbc60c5dffac13c8a8a4dd82e0@group.calendar.google.com",
  },
  {
    id: "public-space",
    name: "Parks & public space",
    description: "Programming in parks, trails and open streets.",
    calendarId: "17a57fbd063d48427b7afc626acc0800295625befe679ebcd541360409ce53ca@group.calendar.google.com",
  },
];

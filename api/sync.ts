import { runSync } from "../src/run.js";

// Called daily by the cron job in vercel.json. Vercel sends the project's
// CRON_SECRET as a bearer token, which keeps anyone else from triggering it.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runSync();
    const failed = summary.sources.some((s) => !s.ok) || summary.calendar.errors.length > 0;
    console.log(JSON.stringify(summary));
    // A 500 makes partial failures show up in Vercel's logs and cron history.
    return Response.json(summary, { status: failed ? 500 : 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

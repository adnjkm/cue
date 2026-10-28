import { taskList } from "@/lib/ai/server/run";

/** Every task with its profile and example, which scripts/check-nemotron.mjs posts. */
export async function GET() {
  return Response.json({ tasks: await taskList() }, { headers: { "cache-control": "no-store" } });
}

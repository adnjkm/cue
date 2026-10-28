import { createHash } from "node:crypto";
import { runTask } from "@/lib/ai/server/run";

export const maxDuration = 300;

export async function POST(req: Request, { params }: RouteContext<"/api/ai/[task]">) {
  const { task } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return runTask(task, body, {
    signal: req.signal,
    clientKey: createHash("sha256").update(ip).digest("hex").slice(0, 16),
    origin: req.headers.get("origin"),
    host: req.headers.get("host") ?? "",
  });
}

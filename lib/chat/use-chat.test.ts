import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { threadKey, type BlockId, type EpochMs, type MessageId } from "@/lib/domain";
import { appendMessage } from "./use-chat";

const thread = threadKey.session("review.evt_sample_csc148_l08.2" as BlockId);
const other = threadKey.session("review.evt_sample_mat137_thu.1" as BlockId);
const TUE_1038 = Date.parse("2026-10-27T10:38:00-04:00");
const TUE_1039 = Date.parse("2026-10-27T10:39:00-04:00");
const MON_0900 = Date.parse("2026-10-26T09:00:00-04:00");
const message = (id: string, text: string) => ({ id: id as MessageId, thread, courseId: null, role: "user" as const, text, citations: [] });
const order = async () => (await db.messages.where("[thread+at]").between([thread, Dexie.minKey], [thread, Dexie.maxKey]).toArray()).map((m) => [m.text, m.at]);

beforeEach(async () => {
  await db.messages.clear();
  await db.messages.bulkPut([
    { ...message("m1", "Seeded question"), at: TUE_1038 as EpochMs },
    { ...message("m2", "Seeded answer"), role: "assistant", at: TUE_1039 as EpochMs },
  ]);
});

describe("appendMessage", () => {
  it("stamps a question asked before the seeded thread's times after its newest row", async () => {
    await appendMessage(message("m3", "Asked on Monday"), MON_0900);
    await appendMessage({ ...message("m4", "Reply"), role: "assistant" }, MON_0900 + 5_000);
    expect(await order()).toEqual([
      ["Seeded question", TUE_1038],
      ["Seeded answer", TUE_1039],
      ["Asked on Monday", TUE_1039 + 1],
      ["Reply", TUE_1039 + 2],
    ]);
  });

  it("keeps now when it is already after the newest row, and ignores other threads", async () => {
    await db.messages.put({ ...message("x1", "Other thread"), thread: other, at: (TUE_1039 + 10 * 60_000) as EpochMs });
    const row = await appendMessage(message("m3", "Asked at 10:43"), TUE_1039 + 4 * 60_000);
    expect(row.at).toBe(TUE_1039 + 4 * 60_000);
  });
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { EpochMs, MicroUsd } from "@/lib/domain";
import { jsonTask, listTask, streamTask, type AnyTask } from "../define";
import { ItemSplitter } from "../json";
import { decodeLines, type WireLine } from "../wire";
import { UpstreamError, type Backend, type ChatRequest, type StreamDelta } from "./backend";
import { MemoryLedger } from "./ledger";
import { runTask, type RunDeps } from "./run";
import { MemoryThrottle } from "./throttle";

const registry: Record<string, AnyTask> = {
  "t.json": jsonTask({
    profile: "chat",
    maxTokens: 100,
    input: z.object({ q: z.string() }),
    output: z.object({ answer: z.enum(["A", "B"]) }),
    prompt: ({ q }) => ({ system: "sys", user: q }),
    example: { q: "x" },
    mock: () => ({ answer: "A" as const }),
  }),
  "t.list": listTask({
    profile: "chat",
    maxTokens: 100,
    maxItems: 3,
    input: z.object({}),
    item: z.object({ n: z.number() }),
    prompt: () => ({ system: "sys", user: "u" }),
    example: {},
    mock: () => [{ n: 1 }],
  }),
  "t.stream": streamTask({
    profile: "chat",
    maxTokens: 100,
    input: z.object({}),
    prompt: () => ({ system: "sys", user: "u" }),
    example: {},
    mock: async function* () {
      yield { type: "text" as const, delta: "hi" };
    },
  }),
};

type Step = { error: UpstreamError; tookMs?: number } | { content: string; tookMs?: number } | { deltas: StreamDelta[]; failAfter?: number };

function harness(steps: Step[], env: Record<string, string> = { NEBIUS_API_KEY: "k", SPEND_CAP_USD: "30" }) {
  let clock = 0;
  const calls: ChatRequest[] = [];
  const sleeps: number[] = [];
  const ledger = new MemoryLedger();
  const next = (req: ChatRequest) => {
    calls.push(req);
    const step = steps.shift();
    if (!step) throw new Error("no more scripted steps");
    if ("tookMs" in step && step.tookMs) clock += step.tookMs;
    return step;
  };
  const backend: Backend = {
    async complete(req) {
      const step = next(req);
      if ("error" in step) throw step.error;
      if ("content" in step) return { content: step.content, usage: { prompt_tokens: 10, completion_tokens: 5 } };
      throw new Error("scripted a stream for complete()");
    },
    async stream(req) {
      const step = next(req);
      if ("error" in step) throw step.error;
      if (!("deltas" in step)) throw new Error("scripted complete() for a stream");
      return (async function* () {
        for (const [i, d] of step.deltas.entries()) {
          if (step.failAfter !== undefined && i === step.failAfter) throw new UpstreamError("upstream dropped", 502);
          yield d;
        }
      })();
    },
    async embed() {
      throw new Error("not used");
    },
  };
  const deps: RunDeps = {
    env,
    registry,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ledger: () => ledger,
    throttle: new MemoryThrottle(),
    backend: () => backend,
  };
  const run = (name: string, body: unknown, origin: string | null = null) => runTask(name, body, { signal: new AbortController().signal, clientKey: "c", origin, host: "cue.test" }, deps);
  return { run, calls, sleeps, ledger, advance: (ms: number) => (clock += ms) };
}

async function lines(res: Response): Promise<WireLine[]> {
  const out: WireLine[] = [];
  for await (const l of decodeLines(res.body!)) out.push(l);
  return out;
}

describe("runTask", () => {
  it("validates, then answers JSON tasks and settles each attempt to real usage", async () => {
    const h = harness([{ content: '{"answer":"B"}' }]);
    const res = await h.run("t.json", { q: "hello" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ answer: "B" });
    expect(await h.ledger.status(0 as EpochMs)).toEqual({ spent: 25, held: 0, calls: 1 });
    expect(h.calls[0].prompt.system).toContain('"answer"');
  });

  it("refuses cross-origin, unknown tasks and bad input", async () => {
    const h = harness([]);
    expect((await h.run("t.json", { q: "x" }, "https://evil.example")).status).toBe(403);
    expect((await h.run("t.nope", {})).status).toBe(404);
    const bad = await h.run("t.json", { q: 3 });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { kind: string } }).error.kind).toBe("bad_input");
  });

  it("retries 429 honouring Retry-After up to 20 s, reserving per attempt", async () => {
    const h = harness([{ error: new UpstreamError("slow down", 429, 45_000) }, { error: new UpstreamError("oops", 503) }, { content: '{"answer":"A"}' }]);
    const res = await h.run("t.json", { q: "x" });
    expect(await res.json()).toEqual({ answer: "A" });
    expect(h.sleeps).toEqual([20_000, 2000]);
    expect((await h.ledger.status(0 as EpochMs)).calls).toBe(3);
  });

  it("stops retrying when 30 s or less of the shared deadline remain", async () => {
    const h = harness([{ error: new UpstreamError("down", 503), tookMs: 255_000 }, { content: '{"answer":"A"}' }]);
    const res = await h.run("t.json", { q: "x" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { kind: string } }).error.kind).toBe("upstream");
    expect(h.calls).toHaveLength(1);
  });

  it("repairs invalid JSON once, then reports bad_output", async () => {
    const ok = harness([{ content: '{"answer":"C"}' }, { content: '{"answer":"A"}' }]);
    expect(await (await ok.run("t.json", { q: "x" })).json()).toEqual({ answer: "A" });
    expect(ok.calls[1].extra?.[1].content).toContain("did not match the schema");
    const bad = harness([{ content: "" }, { content: "nope" }]);
    const res = await bad.run("t.json", { q: "x" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { kind: string } }).error.kind).toBe("bad_output");
  });

  it("refuses with budget when the reservation would cross the cap", async () => {
    const h = harness([{ content: '{"answer":"A"}' }], { NEBIUS_API_KEY: "k", SPEND_CAP_USD: "0.0001" });
    const res = await h.run("t.json", { q: "x" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { kind: "budget", message: "The spending cap is reached.", capUsd: 0.0001 } });
  });

  it("fails closed when the cap is not a number", async () => {
    const h = harness([], { NEBIUS_API_KEY: "k", SPEND_CAP_USD: "$30" });
    expect((await h.run("t.json", { q: "x" })).status).toBe(402);
  });

  it("streams list items as they complete, dropping invalid ones", async () => {
    const h = harness([{ deltas: [{ text: '{"items":[{"n":1},' }, { text: '{"n":"bad"},{"n"' }, { text: ":3}]}" }, { usage: { prompt_tokens: 1, completion_tokens: 1 } }] }]);
    expect(await lines(await h.run("t.list", {}))).toEqual([{ t: "item", v: { n: 1 } }, { t: "item", v: { n: 3 } }, { t: "done", dropped: 1 }]);
  });

  it("retries a stream only before its first byte, never after", async () => {
    const before = harness([{ error: new UpstreamError("busy", 503) }, { deltas: [{ thinking: "hmm " }, { text: "Hello" }, { text: " there" }] }]);
    expect(await lines(await before.run("t.stream", {}))).toEqual([{ t: "thinking", d: "hmm " }, { t: "text", d: "Hello" }, { t: "text", d: " there" }, { t: "done" }]);
    const after = harness([{ deltas: [{ text: "Hel" }, { text: "lo" }], failAfter: 1 }]);
    const out = await lines(await after.run("t.stream", {}));
    expect(out[0]).toEqual({ t: "text", d: "Hel" });
    expect(out[1]).toMatchObject({ t: "error", error: { kind: "upstream" } });
    expect(after.calls).toHaveLength(1);
  });

  it("serves mocks with the real protocol and skips the ledger", async () => {
    const h = harness([], { CUE_AI: "mock" });
    expect(await (await h.run("t.json", { q: "x" })).json()).toEqual({ answer: "A" });
    expect(await lines(await h.run("t.stream", {}))).toEqual([{ t: "text", d: "hi" }, { t: "done" }]);
    expect(await h.ledger.status(0 as EpochMs)).toEqual({ spent: 0 as MicroUsd, held: 0, calls: 0 });
  });
});

describe("ItemSplitter", () => {
  it("emits each array element once it closes, whatever the chunking", () => {
    const text = '{"items": [{"a":"x]},{"}, {"b":[1,2,{"c":"\\"}"}]}, 3, "s,t"], "after": 1}';
    for (const size of [1, 2, 5, 9, 100]) {
      const s = new ItemSplitter();
      const out: string[] = [];
      for (let i = 0; i < text.length; i += size) out.push(...s.push(text.slice(i, i + size)));
      expect(out.map((o) => JSON.parse(o))).toEqual([{ a: "x]},{" }, { b: [1, 2, { c: '"}' }] }, 3, "s,t"]);
    }
  });
});

describe("response_format schemas", () => {
  it("drop keywords Token Factory's grammar rejects", async () => {
    const { jsonSchemaOf } = await import("./run");
    const schema = JSON.stringify(jsonSchemaOf(z.object({ whyNot: z.record(z.string(), z.string()) })));
    expect(schema).not.toContain("propertyNames");
    expect(schema).not.toContain("$schema");
  });
});

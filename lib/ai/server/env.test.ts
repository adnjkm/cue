import { describe, expect, it } from "vitest";
import { aiModeFromEnv, capFromEnv } from "./env";

describe("capFromEnv", () => {
  it("defaults to $30 and accepts plain positive numbers", () => {
    expect(capFromEnv({})).toBe(30_000_000);
    expect(capFromEnv({ SPEND_CAP_USD: "12.5" })).toBe(12_500_000);
  });
  it("fails closed on anything else", () => {
    for (const v of ["$30", "30usd", "-1", "0", "abc", "1e3", "NaN", "Infinity"]) expect(capFromEnv({ SPEND_CAP_USD: v }), v).toBeNull();
  });
});

describe("aiModeFromEnv", () => {
  it("picks mock, Token Factory, OpenRouter, then mock outside production", () => {
    expect(aiModeFromEnv({ CUE_AI: "mock", NEBIUS_API_KEY: "k" })).toBe("mock");
    expect(aiModeFromEnv({ CUE_AI: "mock", VERCEL_ENV: "production", NEBIUS_API_KEY: "k" })).toBe("token-factory");
    expect(aiModeFromEnv({ NEBIUS_API_KEY: "k", LLM_API_KEY: "o" })).toBe("token-factory");
    expect(aiModeFromEnv({ LLM_API_KEY: "o" })).toBe("openrouter");
    expect(aiModeFromEnv({ NODE_ENV: "development" })).toBe("mock");
    expect(aiModeFromEnv({ NODE_ENV: "production" })).toEqual({ error: "missing_key" });
  });
});

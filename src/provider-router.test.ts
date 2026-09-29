import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const router = require("../electron/provider-router.cjs") as {
  upstreamUrl(baseUrl: string, requestUrl: string): URL;
  recordAttempt(runtime: any, routing: any, providerId: string, ok: boolean, status: number | null): void;
  circuitAvailable(health: any, routing: any): boolean;
};

const routing = {
  failureThreshold: 4,
  successThreshold: 2,
  errorRateThreshold: 60,
  minimumRequests: 5,
  recoverySeconds: 0,
};

describe("provider router", () => {
  it("joins versioned upstream URLs without duplicating /v1", () => {
    expect(router.upstreamUrl("https://api.example.test/v1", "/v1/responses?x=1").toString())
      .toBe("https://api.example.test/v1/responses?x=1");
  });

  it("opens on error rate and requires the configured successful probes to recover", () => {
    const runtime = { health: new Map() };
    for (const ok of [true, false, true, false, false]) {
      router.recordAttempt(runtime, routing, "fixture", ok, ok ? 200 : 500);
    }
    const health = runtime.health.get("fixture");
    expect(health.state).toBe("open");
    expect(router.circuitAvailable(health, routing)).toBe(true);
    expect(health.state).toBe("half_open");
    router.recordAttempt(runtime, routing, "fixture", true, 200);
    expect(health.state).toBe("half_open");
    router.recordAttempt(runtime, routing, "fixture", true, 200);
    expect(health.state).toBe("closed");
  });
});

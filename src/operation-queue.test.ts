import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createKeyedSerialQueue, createSerialQueue } = require(
  "../electron/operation-queue.cjs",
) as {
  createSerialQueue(): { run<T>(task: () => Promise<T>): Promise<T> };
  createKeyedSerialQueue(): {
    run<T>(key: string, task: () => Promise<T>): Promise<T>;
    size(): number;
  };
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("operation queues", () => {
  it("serializes store mutations in submission order", async () => {
    const queue = createSerialQueue();
    const events: string[] = [];

    const first = queue.run(async () => {
      events.push("first:start");
      await wait(20);
      events.push("first:end");
    });
    const second = queue.run(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.all([first, second]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("continues after a rejected store mutation", async () => {
    const queue = createSerialQueue();
    const failed = queue.run(async () => {
      throw new Error("expected");
    });
    const next = queue.run(async () => "completed");

    await expect(failed).rejects.toThrow("expected");
    await expect(next).resolves.toBe("completed");
  });

  it("serializes the same account while allowing different accounts to run", async () => {
    const queue = createKeyedSerialQueue();
    const events: string[] = [];

    const firstA = queue.run("a", async () => {
      events.push("a1:start");
      await wait(20);
      events.push("a1:end");
    });
    const secondA = queue.run("a", async () => events.push("a2"));
    const firstB = queue.run("b", async () => events.push("b1"));

    await Promise.all([firstA, secondA, firstB]);
    expect(events.indexOf("b1")).toBeLessThan(events.indexOf("a1:end"));
    expect(events.indexOf("a2")).toBeGreaterThan(events.indexOf("a1:end"));
    await wait(0);
    expect(queue.size()).toBe(0);
  });
});

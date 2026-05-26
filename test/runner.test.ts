import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { run } from "../src/runner.js";
import { rollup, toMarkdown } from "../src/rollup.js";
import type { OtlpExport } from "../src/rollup.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = (name: string): string => readFileSync(`${here}/../fixtures/${name}`, "utf8");

function inputs(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return { input: "fixtures/spans.json", bucket: "day", ...over };
}

describe("rollup", () => {
  it("groups by (date, provider, model)", () => {
    const r = rollup(JSON.parse(fixture("spans.json")) as OtlpExport);
    expect(r.rows).toHaveLength(2);
    expect(r.totals.spans).toBe(2);
    expect(r.totals.costUSD).toBeCloseTo(0.0696, 4);
  });

  it("returns empty totals on an empty envelope", () => {
    const r = rollup({});
    expect(r.rows).toEqual([]);
    expect(r.totals.spans).toBe(0);
  });

  it("respects bucket=month", () => {
    const r = rollup(JSON.parse(fixture("spans.json")) as OtlpExport, "month");
    for (const row of r.rows) expect(row.date).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("toMarkdown", () => {
  it("emits a table with totals", () => {
    const md = toMarkdown(rollup(JSON.parse(fixture("spans.json")) as OtlpExport));
    expect(md).toContain("**Total:**");
    expect(md).toContain("gpt-4o-mini");
  });
  it("handles the empty case", () => {
    expect(toMarkdown(rollup({}))).toContain("No GenAI spans found");
  });
});

describe("run", () => {
  it("emits the rollup table and exits 0 by default", async () => {
    const writes: string[] = [];
    const r = await run({
      inputs: inputs(),
      readFile: (p) => (p.endsWith("spans.json") ? fixture("spans.json") : "{}"),
      write: (line) => writes.push(line)
    });
    expect(r.exitCode).toBe(0);
    expect(r.report.totals.spans).toBe(2);
    expect(writes.join("\n")).toContain("**Total:**");
  });

  it("fails when total spend exceeds fail-over-usd", async () => {
    const writes: string[] = [];
    const r = await run({
      inputs: inputs({ fail_over_usd: "0.01" }),
      readFile: () => fixture("spans.json"),
      write: (line) => writes.push(line)
    });
    expect(r.exitCode).toBe(1);
    expect(writes.join("\n")).toContain("::error::Total spend");
  });

  it("does NOT fail when total spend stays under fail-over-usd", async () => {
    const r = await run({
      inputs: inputs({ fail_over_usd: "10" }),
      readFile: () => fixture("spans.json"),
      write: () => undefined
    });
    expect(r.exitCode).toBe(0);
  });

  it("posts a PR comment when comment-on-pr=true and event payload has a number", async () => {
    const poster = vi.fn(async () => undefined);
    const r = await run({
      inputs: inputs({ comment_on_pr: "true", github_token: "ghs_test" }),
      GITHUB_REPOSITORY: "mizcausevic-dev/llm-cost-rollup-action",
      GITHUB_EVENT_PATH: "fixtures/event-pr.json",
      readFile: (p) => fixture(p.split("/").pop() ?? p),
      postComment: poster,
      write: () => undefined
    });
    expect(r.exitCode).toBe(0);
    expect(r.commentPosted).toBe(true);
    expect(poster).toHaveBeenCalledOnce();
    const arg = poster.mock.calls[0][0];
    expect(arg.issueNumber).toBe(42);
    expect(arg.body).toContain("LLM cost rollup");
  });

  it("auto-posts only when GITHUB_EVENT_NAME=pull_request", async () => {
    const poster = vi.fn(async () => undefined);
    const r = await run({
      inputs: inputs({ comment_on_pr: "auto", github_token: "ghs_test" }),
      GITHUB_EVENT_NAME: "push",
      GITHUB_REPOSITORY: "mizcausevic-dev/llm-cost-rollup-action",
      GITHUB_EVENT_PATH: "fixtures/event-pr.json",
      readFile: () => fixture("spans.json"),
      postComment: poster,
      write: () => undefined
    });
    expect(poster).not.toHaveBeenCalled();
    expect(r.commentPosted).toBe(false);
  });

  it("records 'no github-token provided' reason when comment requested without token", async () => {
    const r = await run({
      inputs: inputs({ comment_on_pr: "true", github_token: "" }),
      GITHUB_REPOSITORY: "mizcausevic-dev/llm-cost-rollup-action",
      GITHUB_EVENT_PATH: "fixtures/event-pr.json",
      readFile: () => fixture("spans.json"),
      write: () => undefined
    });
    expect(r.commentPosted).toBe(false);
    expect(r.reason).toBe("no github-token provided");
  });

  it("throws on missing required input", async () => {
    await expect(run({ inputs: {}, readFile: () => "{}" })).rejects.toThrow(/input "input" is required/);
  });

  it("throws on invalid bucket enum", async () => {
    await expect(run({ inputs: inputs({ bucket: "year" }), readFile: () => "{}" })).rejects.toThrow(/bucket/);
  });

  it("throws on negative fail-over-usd", async () => {
    await expect(run({ inputs: inputs({ fail_over_usd: "-1" }), readFile: () => "{}" })).rejects.toThrow(
      /fail-over-usd/
    );
  });

  it("writes outputs to $GITHUB_OUTPUT when set", async () => {
    const tmp = `${process.cwd()}/test/.gh-output-${process.pid}`;
    const { writeFileSync, readFileSync: readFs, unlinkSync } = await import("node:fs");
    writeFileSync(tmp, "");
    try {
      await run({
        inputs: inputs(),
        GITHUB_OUTPUT: tmp,
        readFile: () => fixture("spans.json"),
        write: () => undefined
      });
      const body = readFs(tmp, "utf8");
      expect(body).toContain("spans=2");
      expect(body).toContain("total-cost-usd=");
      expect(body).toContain("rows=");
    } finally {
      unlinkSync(tmp);
    }
  });

  it("returns reason='no GITHUB_EVENT_PATH' when wantsComment but path missing", async () => {
    const r = await run({
      inputs: inputs({ comment_on_pr: "true", github_token: "ghs_test" }),
      GITHUB_REPOSITORY: "x/y",
      readFile: () => fixture("spans.json"),
      write: () => undefined
    });
    expect(r.reason).toBe("no GITHUB_EVENT_PATH");
  });

  it("returns reason='no GITHUB_REPOSITORY' when wantsComment but repo missing", async () => {
    const r = await run({
      inputs: inputs({ comment_on_pr: "true", github_token: "ghs_test" }),
      GITHUB_EVENT_PATH: "fixtures/event-pr.json",
      readFile: (p) => fixture(p.split("/").pop() ?? p),
      write: () => undefined
    });
    expect(r.reason).toBe("no GITHUB_REPOSITORY");
  });

  it("returns reason='no PR number in event payload' when event has no number", async () => {
    const r = await run({
      inputs: inputs({ comment_on_pr: "true", github_token: "ghs_test" }),
      GITHUB_REPOSITORY: "x/y",
      GITHUB_EVENT_PATH: "fixtures/event-nopr.json",
      readFile: (p) => {
        if (p.endsWith("event-nopr.json")) return "{}";
        return fixture(p.split("/").pop() ?? p);
      },
      write: () => undefined
    });
    expect(r.reason).toBe("no PR number in event payload");
  });
});

describe("rollup edge cases", () => {
  it("falls back to 'unknown' provider/model when attrs missing", () => {
    const env: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  startTimeUnixNano: "1747958400000000000",
                  attributes: [
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "10" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "5" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 0.001 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const r = rollup(env);
    expect(r.rows[0].provider).toBe("unknown");
    expect(r.rows[0].model).toBe("unknown");
  });

  it("uses current date when startTimeUnixNano is missing", () => {
    const env: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
                    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 0.0001 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const r = rollup(env);
    expect(r.rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("prefers gen_ai.response.model over request.model", () => {
    const env: OtlpExport = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  startTimeUnixNano: "1747958400000000000",
                  attributes: [
                    { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
                    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
                    { key: "gen_ai.response.model", value: { stringValue: "gpt-4o-2024-11-20" } },
                    { key: "gen_ai.usage.input_tokens", value: { intValue: "10" } },
                    { key: "gen_ai.usage.output_tokens", value: { intValue: "5" } },
                    { key: "gen_ai.usage.cost", value: { doubleValue: 0.0001 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    expect(rollup(env).rows[0].model).toBe("gpt-4o-2024-11-20");
  });
});

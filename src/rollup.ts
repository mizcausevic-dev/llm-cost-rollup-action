// Inline copy of the minimal otel-genai-rollup logic (smaller surface, no peer-dep step).
// Upstream: https://github.com/mizcausevic-dev/otel-genai-rollup

export type OtlpAttrValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };

export interface OtlpSpan {
  name?: string;
  kind?: number;
  startTimeUnixNano?: string;
  attributes?: Array<{ key: string; value: OtlpAttrValue }>;
}

export interface OtlpExport {
  resourceSpans?: Array<{
    scopeSpans?: Array<{
      spans?: OtlpSpan[];
    }>;
  }>;
}

export interface RollupRow {
  date: string;
  provider: string;
  model: string;
  spans: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  allUnpriced: boolean;
}

export interface RollupReport {
  spans: number;
  rows: RollupRow[];
  totals: { spans: number; inputTokens: number; outputTokens: number; costUSD: number };
}

export type Bucket = "day" | "month" | "all";

function strAttr(m: Map<string, OtlpAttrValue>, key: string): string | undefined {
  const v = m.get(key);
  return v && "stringValue" in v ? v.stringValue : undefined;
}
function numAttr(m: Map<string, OtlpAttrValue>, key: string): number | undefined {
  const v = m.get(key);
  if (!v) return undefined;
  if ("doubleValue" in v) return v.doubleValue;
  if ("intValue" in v) return Number(v.intValue);
  return undefined;
}
function boolAttr(m: Map<string, OtlpAttrValue>, key: string): boolean | undefined {
  const v = m.get(key);
  return v && "boolValue" in v ? v.boolValue : undefined;
}

function formatBucket(iso: string, bucket: Bucket): string {
  if (bucket === "all") return "all";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (bucket === "month") return `${y}-${m}`;
  return `${y}-${m}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function rollup(input: OtlpExport, bucket: Bucket = "day"): RollupReport {
  const groups = new Map<string, RollupRow>();
  let total = 0;

  for (const rs of input.resourceSpans ?? []) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        const attrs = new Map((span.attributes ?? []).map((a) => [a.key, a.value]));
        const provider = strAttr(attrs, "gen_ai.provider.name") ?? "unknown";
        const model =
          strAttr(attrs, "gen_ai.response.model") ?? strAttr(attrs, "gen_ai.request.model") ?? "unknown";
        const inputTokens = numAttr(attrs, "gen_ai.usage.input_tokens") ?? 0;
        const outputTokens = numAttr(attrs, "gen_ai.usage.output_tokens") ?? 0;
        const cost = numAttr(attrs, "gen_ai.usage.cost");
        const unpriced = boolAttr(attrs, "gen_ai.usage.cost_unpriced") ?? false;
        if (cost === undefined && !unpriced && inputTokens === 0 && outputTokens === 0) continue;
        total += 1;

        const iso = span.startTimeUnixNano
          ? new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toISOString()
          : new Date().toISOString();
        const date = formatBucket(iso, bucket);
        const key = `${date} ${provider} ${model}`;

        let row = groups.get(key);
        if (!row) {
          row = {
            date,
            provider,
            model,
            spans: 0,
            inputTokens: 0,
            outputTokens: 0,
            costUSD: 0,
            allUnpriced: true
          };
          groups.set(key, row);
        }
        row.spans += 1;
        row.inputTokens += inputTokens;
        row.outputTokens += outputTokens;
        row.costUSD += cost ?? 0;
        if (!unpriced) row.allUnpriced = false;
      }
    }
  }

  const rows = [...groups.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.model.localeCompare(b.model);
  });

  const totals = rows.reduce(
    (acc, r) => ({
      spans: acc.spans + r.spans,
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      costUSD: acc.costUSD + r.costUSD
    }),
    { spans: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 }
  );
  return { spans: total, rows, totals };
}

export function toMarkdown(report: RollupReport): string {
  if (report.rows.length === 0) {
    return `_No GenAI spans found._\n\nTotal: \`$0.00\``;
  }
  const lines: string[] = [];
  lines.push(`| date | provider | model | spans | input tokens | output tokens | cost (USD) |`);
  lines.push(`|---|---|---|---:|---:|---:|---:|`);
  for (const r of report.rows) {
    const c = r.allUnpriced ? "—" : `$${r.costUSD.toFixed(r.costUSD < 1 ? 4 : 2)}`;
    lines.push(`| ${r.date} | ${r.provider} | ${r.model} | ${r.spans} | ${r.inputTokens} | ${r.outputTokens} | ${c} |`);
  }
  lines.push(``);
  lines.push(
    `**Total:** ${report.totals.spans} spans · ${report.totals.inputTokens} input tokens · ${report.totals.outputTokens} output tokens · $${report.totals.costUSD.toFixed(report.totals.costUSD < 1 ? 4 : 2)}`
  );
  return lines.join("\n");
}

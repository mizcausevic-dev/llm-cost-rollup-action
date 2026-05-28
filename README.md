# llm-cost-rollup-action

GitHub Action that reads **OpenTelemetry GenAI cost-annotated spans** from a workflow artifact, aggregates spend by `(date, provider, model)`, and posts a Markdown summary as a PR comment. Optionally fails the run when total spend exceeds a USD budget.

Composes with [`otel-genai-rollup`](https://github.com/mizcausevic-dev/otel-genai-rollup) (the standalone library/CLI) and [`llm-cost-budget-operator`](https://github.com/mizcausevic-dev/llm-cost-budget-operator) (the K8s side of the same pipeline).

> Status: v0.1.0 — Node 20 runner. AGPL-3.0-or-later.

## Usage

```yaml
- uses: actions/checkout@v4

# … your nightly LLM eval / pipeline that produces an OTLP/JSON file …

- uses: mizcausevic-dev/llm-cost-rollup-action@v0.1.0
  with:
    input: ./artifacts/spans.json
    bucket: day                       # day | month | all
    fail-over-usd: "5.00"             # optional spend ceiling
    comment-on-pr: auto               # auto | true | false
```

The action writes the Markdown table to the workflow log, exposes outputs (`total-cost-usd`, `spans`, `rows`), and — when running on a `pull_request` event with the default `${{ github.token }}` — posts the same table as a PR comment.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `input` | yes | — | Path to the OTLP/JSON file containing cost-annotated GenAI spans. |
| `bucket` | no | `day` | Group rows by `day`, `month`, or `all`. |
| `comment-on-pr` | no | `auto` | Post the Markdown table as a PR comment. `auto` = post only on `pull_request` events. |
| `fail-over-usd` | no | — | Spending ceiling in USD. Action fails the run when total cost exceeds this. |
| `github-token` | no | `${{ github.token }}` | Token used to post the PR comment. |

## Outputs

| Output | Description |
|---|---|
| `total-cost-usd` | Total accumulated spend across the rollup. |
| `spans` | Number of spans processed. |
| `rows` | JSON array of rollup rows (one per `(date, provider, model)` triple). |

## What it reads

The action expects each GenAI span to carry the OTel GenAI semantic conventions plus the cost extension attributes emitted by `llm-cost-span-exporter`:

| Attribute | Used for |
|---|---|
| `gen_ai.provider.name` | group key |
| `gen_ai.response.model` / `gen_ai.request.model` | group key (response preferred) |
| `gen_ai.usage.input_tokens` / `output_tokens` | summed per group |
| `gen_ai.usage.cost` | summed per group |
| `gen_ai.usage.cost_unpriced` | row-level "—" marker |
| `span.startTimeUnixNano` | UTC date bucket |

Spans with no cost signal whatsoever are skipped.

## Pipeline

```
agent-trace-normalizer ─▶ llm-cost-span-exporter ─▶ artifact (OTLP/JSON)
                                                       └─▶ llm-cost-rollup-action ─▶ PR comment + fail-on-budget
                                                       └─▶ otel-genai-rollup (CLI) ─▶ k8s ConfigMap
                                                       └─▶ llm-cost-budget-operator ─▶ K8s budget posture
```

## Develop

```
npm install
npm run lint && npm run typecheck && npm run coverage && npm run build
npm run demo
```

The action's runtime entry is `dist/index.js` — built artifacts are committed so consumers can pin to a SHA or tag without running a build step.

## License

[AGPL-3.0-or-later](LICENSE)

## Part of the Kinetic Gain Suite

Operator surface in the [Kinetic Gain Suite](https://suite.kineticgain.com/) — a portfolio of buyer-readable control planes spanning security posture, compliance evidence, data-platform governance, FinOps, and operator workflows. See the suite index for related surfaces. Apex: [kineticgain.com](https://kineticgain.com/).

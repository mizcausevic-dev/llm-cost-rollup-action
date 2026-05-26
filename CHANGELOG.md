# Changelog

## v0.1.0 — 2026-05-27

- Initial release: GitHub Action that reads OTel GenAI cost-annotated spans from a workflow artifact, aggregates spend by `(date, provider, model)`, posts a Markdown summary as a PR comment, optionally fails when total spend > USD budget.
- Inputs: `input`, `bucket` (day/month/all), `comment-on-pr` (auto/true/false), `fail-over-usd`, `github-token`.
- Outputs: `total-cost-usd`, `spans`, `rows`.
- Auto-detection of PR context — posts comment only on `pull_request` events when `comment-on-pr=auto`.
- Inline rollup logic (no peer-dep on `otel-genai-rollup`) for self-contained Action distribution. `dist/index.js` is built and committed so consumers can pin to a SHA or tag without a build step.
- Composes with `otel-genai-rollup` (sibling library/CLI) and `llm-cost-budget-operator` (K8s budget enforcement).
- Node 20 runner, AGPL-3.0-or-later, Dependabot.

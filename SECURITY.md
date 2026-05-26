# Security Policy

`llm-cost-rollup-action` runs inside GitHub Actions runners as a Node 20 action. It reads a JSON file from the workspace, aggregates spend, optionally posts a PR comment via the GitHub REST API, and writes outputs to `$GITHUB_OUTPUT`. No remote fetch of code, no execution of user-supplied scripts.

The `github-token` input is used only to POST a single PR comment with the rollup Markdown. The token is never logged.

The input file may include trace metadata that's sensitive (model names, token counts, prompt content if your exporter records it). The action's PR comment includes only aggregate token counts and cost — never prompt or completion text — but treat the input file itself as sensitive in your workspace.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/llm-cost-rollup-action/security/advisories/new)

Do not file public issues for security reports.

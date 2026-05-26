import { readFileSync } from "node:fs";

import { rollup, toMarkdown } from "../src/rollup.js";
import type { OtlpExport } from "../src/rollup.js";

const payload = JSON.parse(readFileSync("fixtures/spans.json", "utf8")) as OtlpExport;
const report = rollup(payload);
console.log(toMarkdown(report));
console.log(``);
console.log(`spans=${report.totals.spans}`);
console.log(`total-cost-usd=${report.totals.costUSD.toFixed(4)}`);

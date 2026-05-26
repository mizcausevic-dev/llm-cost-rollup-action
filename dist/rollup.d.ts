export type OtlpAttrValue = {
    stringValue: string;
} | {
    intValue: string;
} | {
    doubleValue: number;
} | {
    boolValue: boolean;
};
export interface OtlpSpan {
    name?: string;
    kind?: number;
    startTimeUnixNano?: string;
    attributes?: Array<{
        key: string;
        value: OtlpAttrValue;
    }>;
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
    totals: {
        spans: number;
        inputTokens: number;
        outputTokens: number;
        costUSD: number;
    };
}
export type Bucket = "day" | "month" | "all";
export declare function rollup(input: OtlpExport, bucket?: Bucket): RollupReport;
export declare function toMarkdown(report: RollupReport): string;

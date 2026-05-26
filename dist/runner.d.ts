import { type RollupReport } from "./rollup.js";
export interface RunnerEnv {
    /** GitHub Actions inputs prefixed with INPUT_ (uppercase, dashes replaced by underscores). */
    inputs: Record<string, string | undefined>;
    /** GitHub Actions context paths. */
    GITHUB_OUTPUT?: string;
    GITHUB_EVENT_NAME?: string;
    GITHUB_REPOSITORY?: string;
    GITHUB_EVENT_PATH?: string;
    /** Where to read the OTLP/JSON from (defaults to fs). */
    readFile?: (path: string) => string;
    /** Posts a PR comment via GitHub API. Stubbed for tests. */
    postComment?: (args: {
        token: string;
        repo: string;
        issueNumber: number;
        body: string;
    }) => Promise<void>;
    /** Stream to write output annotations (defaults to process.stdout). */
    write?: (line: string) => void;
}
export interface RunnerResult {
    exitCode: 0 | 1;
    report: RollupReport;
    commentPosted: boolean;
    reason?: string;
}
export declare function run(env: RunnerEnv): Promise<RunnerResult>;

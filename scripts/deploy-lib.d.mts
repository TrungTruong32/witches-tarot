export declare const SITE: string;
export declare const SCOPE: string;
export interface CheckResult { ok: boolean; msg: string; protected?: boolean }
export function loadEnv(file?: string): Record<string, string>;
export function makeMask(secrets: (string | undefined)[]): (t: string) => string;
export function vercelArgs(cmd: string[], o: { prod: boolean; token?: string }): string[];
export function parseDeployUrl(out: string): string | null;
export function readBuiltVersion(html: string): string | null;
export function versionError(v: string | null): string | null;
export function checkDeployment(
  site: string,
  expectedVersion: string,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  opts?: { preview?: boolean },
): Promise<CheckResult[]>;
export function builtIndexHtml(): { file: string; html: string } | null;
export function runDeploy(o: {
  prod: boolean;
  argv: string[];
  branchError: (branch: string, argv: string[]) => string | null;
}): Promise<{ url: string; version: string; results: CheckResult[] }>;

export declare const SITE: string;
export declare const SCOPE: string;
export declare const VERCEL_CLI: string;
export interface CheckResult { ok: boolean; msg: string; protected?: boolean; warn?: boolean }
export function tokenError(token: string | undefined): string | null;
export function previewExitCode(results: CheckResult[]): 0 | 1 | 2;
export function loadEnv(file?: string): Record<string, string>;
export function makeMask(secrets: (string | undefined)[]): (t: string) => string;
export function vercelArgs(cmd: string[], o: { prod: boolean }): string[];
export function parseDeployUrl(out: string): string | null;
export function readBuiltVersion(html: string): string | null;
export function versionError(v: string | null): string | null;
export function checkDeployment(
  site: string,
  expectedVersion: string | null,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  opts?: { preview?: boolean; bypass?: string },
): Promise<CheckResult[]>;
export function buildEnvArgs(version: string): string[];
export function isProtected(r: { status: number; headers: { get(name: string): string | null } }): boolean;
export function runDeploy(o: {
  prod: boolean;
  argv: string[];
  branchError: (branch: string, argv: string[]) => string | null;
}): Promise<{ url: string; version: string; results: CheckResult[] }>;

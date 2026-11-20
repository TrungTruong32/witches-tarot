import type { Server } from 'node:http';
export interface VercelConfig {
  buildCommand?: string;
  outputDirectory?: string;
  framework?: string | null;
  rewrites?: { source: string; destination: string }[];
  redirects?: { source: string; destination: string; permanent?: boolean }[];
  headers?: { source: string; headers: { key: string; value: string }[] }[];
  [k: string]: unknown;
}
export declare function sourceToRegExp(source: string): RegExp;
export declare function matchesSource(source: string, path: string): boolean;
export declare function headersFor(config: VercelConfig, path: string): Record<string, string>;
export declare function rewriteFor(config: VercelConfig, path: string): string | null;
export declare function redirectFor(config: VercelConfig, path: string): { source: string; destination: string; permanent?: boolean } | null;
export declare function readVercelConfig(file?: string): VercelConfig;
export declare function serveDist(
  root: string,
  port?: number,
  config?: VercelConfig,
): Promise<{ server: Server; site: { root: string; hits: string[] } }>;

export function precacheList(dist: string): string[];
export function swVersion(dist: string, list: string[]): string;
export function buildSw(dist: string, entry?: string): Promise<{ version: string; assets: string[] }>;

export interface PrecacheLists { app: string[]; data: string[] }
export function precacheLists(dist: string): PrecacheLists;
export function cacheNames(dist: string, lists: PrecacheLists): { app: string; data: string };
export function buildSw(dist: string, entry?: string): Promise<{ app: string; data: string; lists: PrecacheLists }>;

export const CARD_BACK_KEYS: readonly string[];
export function cardBackSvg(k: string): string;
export function cardBackCss(k: string): string;
export const CARD_BACK_NAMES: Record<string, [string, string]>;
export function normalizeCardBack(saved: string | null): string;

// Nạp /sky.json (sao, đường chòm sao, tên sao, chòm sao) — một lần, dùng chung cho nền sao & bản đồ sao.

export interface SkyData {
  stars: [number, number, number][];
  lines: [string, [number, number][]][];
  names: [number, number, string][];
  consts: [number, number, string, string][];
}

let cached: Promise<SkyData> | null = null;

export function loadSky(f: typeof fetch = fetch): Promise<SkyData> {
  if (cached) return cached;
  const p: Promise<SkyData> = f('/sky.json')
    .then((r) => {
      if (!r.ok) throw new Error('sky.json ' + r.status);
      return r.json() as Promise<SkyData>;
    })
    .catch((e: unknown) => {
      if (cached === p) cached = null; // lỗi → lần gọi sau thử lại
      throw e;
    });
  cached = p;
  return p;
}

export function resetSkyForTests(): void {
  cached = null;
}

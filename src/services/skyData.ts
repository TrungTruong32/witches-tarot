// Nạp /sky.json (sao, đường chòm sao, tên sao, chòm sao) — một lần, dùng chung cho nền sao & bản đồ sao.
// onSkyLoaded: engine nào cũng biết khi một lượt nạp (của bất kỳ ai) thành công — vd. nền đang lỗi về sao trang trí
// sẽ chuyển sang bầu trời thật khi bản đồ sao tải lại được.

export interface SkyData {
  stars: [number, number, number][];
  lines: [string, [number, number][]][];
  names: [number, number, string][];
  consts: [number, number, string, string][];
}

let cached: Promise<SkyData> | null = null;
const listeners = new Set<(d: SkyData) => void>();

/** Đăng ký nhận dữ liệu khi sky.json nạp xong (lượt sau thành công). Trả hàm huỷ đăng ký. */
export function onSkyLoaded(cb: (d: SkyData) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function loadSky(f: typeof fetch = fetch): Promise<SkyData> {
  if (cached) return cached;
  const p: Promise<SkyData> = f('/sky.json')
    .then((r) => {
      if (!r.ok) throw new Error('sky.json ' + r.status);
      return r.json() as Promise<SkyData>;
    })
    .then((d) => {
      for (const cb of [...listeners]) {
        try { cb(d); } catch (e) { console.error(e); }   // một bên nghe lỗi không làm hỏng lượt nạp của bên khác
      }
      return d;
    })
    .catch((e: unknown) => {
      if (cached === p) cached = null; // lỗi → lần gọi sau thử lại
      throw e;
    });
  cached = p;
  return p;
}

/** Chỉ cho test: quên bộ nhớ đệm và mọi bên nghe. */
export function resetForTests(): void {
  cached = null;
  listeners.clear();
}

// Hộp "Cài đặt AI": chọn provider (tab đang sáng lúc bấm Lưu), nhập key/URL/model, tải danh sách model, gọi thử.
// Markup theo bản cũ L1156–1265; hành vi theo L3024–3363. Trạng thái form chỉ ghi xuống khi bấm Lưu.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { ModalOverlay } from '../../components/Overlay';
import { useT } from '../../i18n/useT';
import { providerChain } from '../../services/ai/chat';
import { GEMINI_PREFERRED, listModels, orderModels, providerLabel, RECOMMENDED, testModel } from '../../services/ai/models';
import { AiError, ollamaIsLocal } from '../../services/ai/providers';
import { DEFAULT_AI_SETTINGS, type AiSettings as Settings, type BYOKProvider } from '../../services/storage';

const PROVIDERS: { id: BYOKProvider; tab: string; label: string }[] = [
  { id: 'gemini', tab: 'provGemini', label: 'Gemini' },
  { id: 'beeknoee', tab: 'provBeeknoee', label: 'Beeknoee' },
  { id: 'zenmux', tab: 'provZenmux', label: 'ZenMux' },
  { id: 'ollama', tab: 'provOllama', label: 'Ollama' },
];

/** Dòng trạng thái mặc định dưới ô Model (chữ của bản cũ). */
const DEFAULT_STATUS: Record<BYOKProvider, ReactNode> = {
  gemini: '“Tải danh sách” để lấy model + xác thực key. “Thử model đang chọn” gọi thật để chắc chắn model dùng được (ListModels có thể liệt kê cả model không gọi được).',
  beeknoee: 'VD: deepseek-chat, gpt-5, claude-sonnet-4-6. Bấm “Tải danh sách” để lấy model & xác thực key.',
  zenmux: 'VD: z-ai/glm-4.7-flash-free. Bấm “Tải danh sách” để lấy model & xác thực key.',
  ollama: <>Ollama chạy trên máy bạn. Để trang HTTPS gọi được, khởi động Ollama với <code>OLLAMA_ORIGINS=*</code>. Bấm “Tải model đã cài” để lấy danh sách.</>,
};

type Form = Settings & { freeAi: boolean };
const toForm = (s: Settings): Form => ({ ...s, freeAi: s.freeAi !== false, autoFallback: s.autoFallback !== false });
const MODEL_KEY = { gemini: 'geminiModel', beeknoee: 'beeknoeeModel', zenmux: 'zenmuxModel', ollama: 'ollamaModel' } as const;
/** Phần tên trong id nút của bản cũ (loadGeminiModels, testZenmuxModel…). */
const ID_PART: Record<BYOKProvider, string> = { gemini: 'Gemini', beeknoee: 'Beeknoee', zenmux: 'Zenmux', ollama: 'Ollama' };

/** Lỗi kiểm tra đầu vào (thiếu key/model) — hiện nguyên câu, không kèm gợi ý mạng/CORS. */
const isValidation = (e: unknown) => e instanceof AiError && e.status === undefined;
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AiSettings() {
  const { t, lang } = useT();
  const open = useApp(s => s.overlay === 'ai');
  const close = useApp(s => s.closeOverlay);
  const save = useApp(s => s.saveAiSettings);
  const [form, setForm] = useState<Form>(() => toForm(useApp.getState().aiSettings));
  // Mỗi lần mở là một "phiên"; kết quả tải/thử model của phiên cũ (trả về muộn) bị bỏ qua
  const session = useRef(0);
  const [tab, setTab] = useState<BYOKProvider>(form.provider);
  const [status, setStatus] = useState<Partial<Record<BYOKProvider, ReactNode>>>({});
  const [lists, setLists] = useState<Record<BYOKProvider, string[]>>({ gemini: [], beeknoee: [], zenmux: [], ollama: [] });
  const [saved, setSaved] = useState('');

  // Mỗi lần mở: đọc lại cài đặt đã lưu, gợi ý sẵn model khuyến nghị, xoá trạng thái cũ
  useEffect(() => {
    if (!open) return;
    session.current++;
    const s = toForm(useApp.getState().aiSettings);
    setForm(s);
    setTab(s.provider);
    setStatus({});
    setSaved('');
    setLists(l => ({
      ...l,
      beeknoee: l.beeknoee.length ? l.beeknoee : RECOMMENDED.beeknoee,
      zenmux: l.zenmux.length ? l.zenmux : RECOMMENDED.zenmux,
    }));
  }, [open]);

  const set = <K extends keyof Form>(k: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const say = (p: BYOKProvider, text: ReactNode) => setStatus(st => ({ ...st, [p]: text }));
  /** Đánh dấu phiên lúc bắt đầu một tác vụ bất đồng bộ; hàm trả về cho biết hộp còn ở đúng phiên đó không. */
  const current = () => {
    const at = session.current;
    return () => at === session.current;
  };

  const load = async (p: BYOKProvider) => {
    const live = current();
    say(p, p === 'ollama' ? 'Đang tải danh sách model từ Ollama…' : 'Đang kiểm tra key và tải danh sách model…');
    try {
      const models = await listModels(p, form);
      if (!live()) return;
      if (!models.length) {
        say(p, p === 'gemini' ? '⚠️ Key hợp lệ nhưng không có model hỗ trợ generateContent.'
          : p === 'ollama' ? '⚠️ Không có model nào. Local: "ollama pull <model>". Cloud: gõ tay tên model (vd gpt-oss:120b-cloud).'
            : '⚠️ Key hợp lệ nhưng không lấy được model nào.');
        return;
      }
      const ordered = orderModels(models, p === 'gemini' ? GEMINI_PREFERRED : p === 'ollama' ? [] : RECOMMENDED[p]);
      setLists(l => ({ ...l, [p]: ordered }));
      const key = MODEL_KEY[p];
      const savedModel = useApp.getState().aiSettings[key];
      setForm(f => ({ ...f, [key]: savedModel && ordered.includes(savedModel) ? savedModel : f[key].trim() ? f[key] : ordered[0] ?? '' }));
      say(p, p === 'gemini' ? `✓ Key hợp lệ — ${models.length} model dùng được (model khuyến nghị ở đầu danh sách). Chọn model rồi bấm Lưu.`
        : p === 'ollama' ? `✓ Kết nối OK — ${models.length} model. Chọn model rồi bấm Lưu.`
          : `✓ Key hợp lệ — ${models.length} model. Chọn model rồi bấm Lưu.`);
    } catch (e) {
      if (!live()) return;
      if (isValidation(e)) return say(p, '⚠️ ' + msgOf(e));
      if (p === 'ollama') {
        const base = (form.ollamaUrl.trim() || DEFAULT_AI_SETTINGS.ollamaUrl).replace(/\/$/, '');
        return say(p, ollamaIsLocal(base)
          ? '⚠️ Không kết nối được Ollama tại ' + base + '. Kiểm tra Ollama đang chạy và OLLAMA_ORIGINS=*.'
          : '⚠️ Không tải được danh sách (Cloud có thể không hỗ trợ /api/tags — cứ gõ tay tên model, vd gpt-oss:120b-cloud).');
      }
      const suffix = p === 'beeknoee' ? ' (có thể do CORS nếu Beeknoee chặn gọi từ trình duyệt).' : p === 'zenmux' ? ' (kiểm tra key hoặc base URL).' : '';
      say(p, '⚠️ ' + msgOf(e) + suffix);
    }
  };

  const test = async (p: BYOKProvider) => {
    const model = form[MODEL_KEY[p]].trim();
    const live = current();
    try {
      const pending = testModel(p, form);
      say(p, '🧪 Đang thử gọi thật model “' + model + '”' + (p === 'beeknoee' || p === 'zenmux' ? ' (stream)…' : '…'));
      await pending;
      if (!live()) return;
      say(p, '✓ Model “' + model + '” GỌI ĐƯỢC. Bấm Lưu để dùng.');
    } catch (e) {
      if (!live()) return;
      if (isValidation(e)) return say(p, '⚠️ ' + msgOf(e));
      say(p, '✗ “' + model + '” không gọi được: ' + msgOf(e) + (p === 'gemini' ? ' — chọn model khác rồi Thử lại.' : ''));
    }
  };

  const onSave = () => {
    const tr = (v: string) => v.trim();
    const url = (v: string, d: string) => (tr(v) || d).replace(/\/$/, '');
    const s: Form = {
      provider: tab,
      geminiKey: tr(form.geminiKey),
      geminiModel: tr(form.geminiModel) || DEFAULT_AI_SETTINGS.geminiModel,
      beeknoeeKey: tr(form.beeknoeeKey),
      beeknoeeModel: tr(form.beeknoeeModel),
      beeknoeeUrl: url(form.beeknoeeUrl, DEFAULT_AI_SETTINGS.beeknoeeUrl),
      zenmuxKey: tr(form.zenmuxKey),
      zenmuxModel: tr(form.zenmuxModel),
      zenmuxUrl: url(form.zenmuxUrl, DEFAULT_AI_SETTINGS.zenmuxUrl),
      ollamaUrl: url(form.ollamaUrl, DEFAULT_AI_SETTINGS.ollamaUrl),
      ollamaModel: tr(form.ollamaModel) || DEFAULT_AI_SETTINGS.ollamaModel,
      ollamaKey: tr(form.ollamaKey),
      autoFallback: form.autoFallback,
      freeAi: form.freeAi,
    };
    save(s);
    setForm(s);
    const chain = providerChain(s);
    const label = (p: Parameters<typeof providerLabel>[0]) => providerLabel(p, s, lang);
    setSaved('✓ Đã lưu. Provider đang dùng: ' + label(s.provider) + (chain.length > 1 ? ' · Dự phòng: ' + chain.slice(1).map(label).join(' → ') : ''));
  };

  const shown = (p: BYOKProvider) => ({ display: tab === p ? 'block' : 'none' });
  const modelRow = (p: BYOKProvider, placeholder: string, loadText: string) => (
    <div className="model-row">
      <input id={MODEL_KEY[p]} list={MODEL_KEY[p] + 'List'} type="text" placeholder={placeholder} autoComplete="off" value={form[MODEL_KEY[p]]} onChange={set(MODEL_KEY[p])} />
      <datalist id={MODEL_KEY[p] + 'List'}>{lists[p].map(m => <option key={m} value={m} />)}</datalist>
      <button type="button" id={'load' + ID_PART[p] + 'Models'} onClick={() => void load(p)}>{loadText}</button>
      <button type="button" id={'test' + ID_PART[p] + 'Model'} onClick={() => void test(p)}>🧪 Thử model đang chọn</button>
    </div>
  );
  const statusOf = (p: BYOKProvider) => (
    <div className="hint" id={MODEL_KEY[p] + 'Status'}>{status[p] ?? DEFAULT_STATUS[p]}</div>
  );

  return (
    <ModalOverlay id="settingsOverlay" open={open} onClose={close}>
      <h2>{t('set.title')}</h2>
      <div className="provider-toggle">
        {PROVIDERS.map(p => (
          <button key={p.id} id={p.tab} data-provider={p.id} className={tab === p.id ? 'on' : undefined} onClick={() => setTab(p.id)}>{p.label}</button>
        ))}
      </div>
      <div className="hint" style={{ margin: '-8px 0 14px' }}>
        Provider có <strong>tab đang sáng</strong> lúc bấm Lưu sẽ được dùng để diễn giải. Mọi key (Gemini, Beeknoee, ZenMux) đều được lưu cùng lúc — đổi provider chỉ cần mở lại, chọn tab khác, rồi Lưu.
      </div>

      <div id="geminiFields" style={shown('gemini')}>
        <div className="field">
          <label htmlFor="geminiKey">Gemini API key</label>
          <input id="geminiKey" type="password" placeholder="AIza..." autoComplete="off" value={form.geminiKey} onChange={set('geminiKey')} />
          <div className="hint"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener">👉 Lấy API key tại đây</a>. Key chỉ lưu trong trình duyệt của bạn (localStorage), không gửi đi đâu ngoài Google.</div>
        </div>
        <div className="field">
          <label htmlFor="geminiModel">Model</label>
          {modelRow('gemini', 'Chọn hoặc gõ model', '🔄 Tải danh sách')}
          {statusOf('gemini')}
        </div>
      </div>

      <div id="beeknoeeFields" style={shown('beeknoee')}>
        <div className="field">
          <label htmlFor="beeknoeeKey">Beeknoee API key</label>
          <input id="beeknoeeKey" type="password" placeholder="sk-bee-..." autoComplete="off" value={form.beeknoeeKey} onChange={set('beeknoeeKey')} />
          <div className="hint"><a href="https://platform.beeknoee.com/?ref=BEE-0E6F67" target="_blank" rel="noreferrer noopener">👉 Lấy API key tại đây</a>. Key chỉ lưu trong trình duyệt của bạn (localStorage).</div>
        </div>
        <div className="field">
          <label htmlFor="beeknoeeUrl">Base URL</label>
          <input id="beeknoeeUrl" type="text" placeholder="https://platform.beeknoee.com/api/v1" value={form.beeknoeeUrl} onChange={set('beeknoeeUrl')} />
          <div className="hint">Mặc định <code>https://platform.beeknoee.com/api/v1</code> (chuẩn OpenAI). Chỉ đổi nếu cần.</div>
        </div>
        <div className="field">
          <label htmlFor="beeknoeeModel">Model</label>
          {modelRow('beeknoee', 'Chọn hoặc gõ model', '🔄 Tải danh sách')}
          {statusOf('beeknoee')}
        </div>
      </div>

      <div id="zenmuxFields" style={shown('zenmux')}>
        <div className="field">
          <label htmlFor="zenmuxKey">ZenMux API key</label>
          <input id="zenmuxKey" type="password" placeholder="..." autoComplete="off" value={form.zenmuxKey} onChange={set('zenmuxKey')} />
          <div className="hint"><a href="https://zenmux.ai/invite/X5TOVI" target="_blank" rel="noreferrer noopener">👉 Lấy API key tại đây</a>. Key chỉ lưu trong trình duyệt của bạn (localStorage).</div>
        </div>
        <div className="field">
          <label htmlFor="zenmuxUrl">Base URL</label>
          <input id="zenmuxUrl" type="text" placeholder="https://zenmux.ai/api/v1" value={form.zenmuxUrl} onChange={set('zenmuxUrl')} />
          <div className="hint">Mặc định <code>https://zenmux.ai/api/v1</code> (chuẩn OpenAI). Chỉ đổi nếu cần.</div>
        </div>
        <div className="field">
          <label htmlFor="zenmuxModel">Model</label>
          {modelRow('zenmux', 'Chọn hoặc gõ model (vd z-ai/glm-4.7-flash-free)', '🔄 Tải danh sách')}
          {statusOf('zenmux')}
        </div>
      </div>

      <div id="ollamaFields" style={shown('ollama')}>
        <div className="field">
          <label htmlFor="ollamaUrl">Ollama base URL</label>
          <input id="ollamaUrl" type="text" placeholder="http://localhost:11434" value={form.ollamaUrl} onChange={set('ollamaUrl')} />
          <div className="hint">Local: <code>http://localhost:11434</code> (cần <code>OLLAMA_ORIGINS=*</code>). Cloud: <code>https://ollama.com</code> (điền API key bên dưới; app tự gọi qua proxy nên chạy được cả trên web).</div>
        </div>
        <div className="field">
          <label htmlFor="ollamaKey">API key (chỉ khi dùng Ollama Cloud)</label>
          <input id="ollamaKey" type="password" placeholder="để trống nếu chạy local" autoComplete="off" value={form.ollamaKey} onChange={set('ollamaKey')} />
          <div className="hint"><a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer noopener">👉 Lấy API key tại đây</a> (ollama.com → Settings → Keys). Key chỉ lưu trong trình duyệt của bạn.</div>
        </div>
        <div className="field">
          <label htmlFor="ollamaModel">Model</label>
          {modelRow('ollama', 'Chọn hoặc gõ model', '🔄 Tải model đã cài')}
          {statusOf('ollama')}
        </div>
      </div>

      <div className="field">
        <label className="chk-row"><input type="checkbox" id="freeAi" checked={form.freeAi} onChange={set('freeAi')} /> <span>{t('set.freeAi')}</span></label>
        <div className="hint">{t('set.freeAi.hint')}</div>
      </div>
      <div className="field">
        <label className="chk-row"><input type="checkbox" id="autoFallback" checked={form.autoFallback} onChange={set('autoFallback')} /> <span>{t('set.fallback')}</span></label>
        <div className="hint">{t('set.fallback.hint')}</div>
      </div>

      <div className="saved-note" id="savedNote">{saved}</div>
      <div className="modal-actions">
        <button id="closeSettings" onClick={close}>{t('set.close')}</button>
        <button className="btn-primary" id="saveSettings" onClick={onSave}>{t('set.save')}</button>
      </div>
    </ModalOverlay>
  );
}

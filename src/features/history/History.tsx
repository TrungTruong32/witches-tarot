// Màn "Lịch sử" (/nhat-ky): danh sách, tìm kiếm, tải lại, xoá, ghi chú, xuất/nhập sao lưu. Theo bản cũ L1077–1092, L4380–4552.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATH_BY_MODE } from '../../app/modes';
import { exportStamp, importSummary, journalJson, journalMarkdown, mergeImport, readingHaystack } from '../../core/journal';
import type { Reading } from '../../core/types';
import { useT } from '../../i18n/useT';
import { addReading, allReadings, clearReadings, deleteReading } from '../../services/idb';
import { allDailyNotes, dailyNoteKey, getStr, setStr } from '../../services/storage';
import { forgetAllReadings, forgetReading } from '../reading/interpret';
import { useReading } from '../reading/readingStore';
import { loadReading } from '../reading/share';
import { HistoryItem } from './HistoryItem';

/** downloadText (L4458): Blob + <a download>, thu hồi URL sau 2 giây. */
function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const readText = (f: File): Promise<string> =>
  typeof f.text === 'function'
    ? f.text()
    : new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsText(f);
      });

async function safeAll(): Promise<Reading[]> {
  try { return await allReadings(); } catch { return []; } // như bản cũ: lỗi IDB → rỗng
}

export function History() {
  const { t, lang, pick } = useT();
  const navigate = useNavigate();
  const [items, setItems] = useState<Reading[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const alive = useRef(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    const list = await safeAll();
    if (alive.current && my === seq.current) setItems(list.sort((a, b) => b.ts - a.ts));
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, [refresh]);

  const onSearch = (v: string) => {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(v.trim().toLowerCase()), 200);
  };

  const shown = useMemo(() => (query ? items.filter(it => readingHaystack(it).includes(query)) : items), [items, query]);

  // Bản ghi đang mở ở màn Trải bài bị xoá → bỏ gắn (ô ghi chú ở đó tự ẩn khi không còn id)
  const forgetCurrent = (id?: number) => {
    const st = useReading.getState();
    if (st.current && (id == null || st.current.id === id)) st.setCurrent(null);
  };

  const onDelete = async (it: Reading) => {
    if (!confirm(pick({ vi: 'Xóa lượt trải bài này?', en: 'Delete this reading?' }))) return;
    const undo = forgetReading(it.id); // ghi chú / hỏi-tiếp đang dở không được ghi lại bản ghi đã xoá
    try { await deleteReading(it.id as number); } catch (e) { undo(); alert(pick({ vi: 'Xóa thất bại: ', en: 'Delete failed: ' }) + (e instanceof Error ? e.message : String(e))); await refresh(); return; }
    forgetCurrent(it.id);
    await refresh();
  };
  const onClear = async () => {
    if (!confirm(pick({ vi: 'Xóa toàn bộ lịch sử trải bài trên trình duyệt này?', en: 'Delete ALL reading history in this browser?' }))) return;
    const undo = forgetAllReadings();
    try { await clearReadings(); } catch (e) { undo(); alert(pick({ vi: 'Xóa thất bại: ', en: 'Delete failed: ' }) + (e instanceof Error ? e.message : String(e))); await refresh(); return; }
    forgetCurrent();
    await refresh();
  };
  const onNote = (it: Reading, value: string) => setItems(l => l.map(x => (x.id === it.id ? { ...x, note: value } : x)));

  const exportJson = async () => {
    downloadText('tarot-journal-' + exportStamp() + '.json', journalJson(await safeAll(), allDailyNotes()), 'application/json');
  };
  const exportMd = async () => {
    downloadText('tarot-journal-' + exportStamp() + '.md', journalMarkdown(await safeAll(), allDailyNotes(), lang), 'text/markdown');
  };

  const importFile = async (file: File) => {
    let data: unknown;
    try { data = JSON.parse(await readText(file)); } catch { alert(pick({ vi: 'File không phải JSON hợp lệ.', en: 'Not a valid JSON file.' })); return; }
    try {
      const m = mergeImport(await safeAll(), data, allDailyNotes());
      if (!m.valid) { alert(pick({ vi: 'File này không phải bản sao lưu nhật ký Witches Tarot.', en: 'This file is not a Witches Tarot journal backup.' })); return; }
      let added = 0;
      let skipped = m.skipped;
      for (const r of m.add) {
        try { await addReading(r); added++; } catch { skipped++; }
      }
      let notes = 0;
      for (const d in m.notes) {
        if (!getStr(dailyNoteKey(d), '')) { setStr(dailyNoteKey(d), m.notes[d] as string); notes++; }
      }
      alert(importSummary(added, notes, skipped, lang));
    } catch (e) {
      alert(pick({ vi: 'Nhập thất bại: ', en: 'Import failed: ' }) + (e instanceof Error ? e.message : String(e)));
    }
    await refresh();
  };

  return (
    <div className="panel">
      <div className="hist-head">
        <h3 style={{ margin: 0 }}>{t('hist.head')}</h3>
        <button id="clearHistory" style={items.length ? undefined : { display: 'none' }} onClick={onClear}>{t('hist.clear')}</button>
      </div>
      <div className="hist-tools">
        <input id="histSearch" type="search" placeholder={t('hist.search.ph')} value={search} onChange={e => onSearch(e.target.value)} />
        <button id="exportJson" title={pick({ vi: 'Sao lưu toàn bộ nhật ký (khôi phục được bằng Nhập)', en: 'Back up the whole journal (restore with Import)' })} onClick={exportJson}>{t('hist.exportJson')}</button>
        <button id="exportMd" title={pick({ vi: 'Xuất nhật ký dạng văn bản dễ đọc', en: 'Export the journal as readable text' })} onClick={exportMd}>{t('hist.exportMd')}</button>
        <button id="importJson" title={pick({ vi: 'Nhập lại file sao lưu JSON', en: 'Import a JSON backup file' })} onClick={() => fileRef.current?.click()}>{t('hist.import')}</button>
        <input
          id="journalImportFile" ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
        />
      </div>
      <div id="historyList">
        {!items.length ? (
          <div className="hist-empty">{pick({ vi: 'Chưa có lượt trải bài nào được lưu. Vào “Trải bài AI”, bấm Diễn giải là tự lưu.', en: 'No readings saved yet. Go to “AI Reading” and tap Interpret — it saves automatically.' })}</div>
        ) : !shown.length ? (
          <div className="hist-empty">{pick({ vi: 'Không có lượt trải bài nào khớp từ khóa.', en: 'No reading matches your search.' })}</div>
        ) : (
          shown.map(it => (
            <HistoryItem key={it.id} item={it} onNote={onNote} onDelete={onDelete}
              onLoad={r => { loadReading(r); navigate(PATH_BY_MODE.reading); }} />
          ))
        )}
      </div>
    </div>
  );
}

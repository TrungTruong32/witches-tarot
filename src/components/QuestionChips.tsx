// Chip câu hỏi mẫu (.q-chips) dùng chung cho Trải bài AI và Yes/No. Như applyLang của bản cũ (L1447):
// data-q = câu theo ngôn ngữ hiện tại, data-qen = câu tiếng Anh; bấm chip → điền câu theo ngôn ngữ hiện tại.
import type { I18nKey } from '../i18n/vi';
import { useT } from '../i18n/useT';
import { IconLabel, type IconName } from './Icon';

export interface QuestionChip {
  /** Khoá i18n của nhãn chip. */
  k: I18nKey;
  ico: IconName;
  /** Câu hỏi tiếng Việt / tiếng Anh. */
  q: string;
  qen: string;
}

export function QuestionChips({ chips, onPick, id }: { chips: readonly QuestionChip[]; onPick(question: string): void; id?: string }) {
  const { t, pick } = useT();
  return (
    <div className="q-chips" id={id}>
      {chips.map(c => {
        const q = pick({ vi: c.q, en: c.qen });
        return (
          <button key={c.k} type="button" className="qchip" data-ico={c.ico} data-q={q} data-qen={c.qen} onClick={() => onPick(q)}>
            <IconLabel icon={c.ico} text={t(c.k)} />
          </button>
        );
      })}
    </div>
  );
}

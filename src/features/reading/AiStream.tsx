// Khung lời giải AI đang stream — vẽ đúng DOM mà streamInto của bản cũ (L3669) ghi vào phần tử đích:
// spinner "Đang kết nối…" → suy nghĩ trực tiếp (.thinking) → gập vào <details class="think-box"> khi có chữ đầu tiên →
// markdown; .fallback-note khi đã chuyển provider; .ai-hint cho kết quả rỗng / lỗi.
// HTML dựng thành một chuỗi như bản cũ: mọi chữ từ AI đi qua escapeHtml / renderMarkdown (renderMarkdown escape trước).
import { forwardRef } from 'react';
import { escapeHtml, renderMarkdown } from '../../core/markdown';
import type { Lang } from '../../core/types';
import type { StreamView } from './interpret';

const SPINNER = '<span class="spinner"></span> ';

function noticeHtml(v: StreamView, lang: Lang): string {
  if (!v.switched) return '';
  const msg = lang === 'en' ? '⏳ The AI is busy — switching to a backup…' : '⏳ AI đang bận — đang chuyển sang máy dự phòng…';
  return '<div class="fallback-note">' + escapeHtml(msg) + '</div>';
}

/** Nội dung HTML của khung + có gắn lớp .ai-hint hay không. */
export function streamHtml(v: StreamView, lang: Lang): { html: string; hint: boolean } {
  switch (v.status) {
    case 'connecting':
      // Lần kết nối đầu: chữ cố định tiếng Việt như bản cũ; sau khi chuyển provider thì theo ngôn ngữ
      return { html: noticeHtml(v, lang) + SPINNER + (v.switched && lang === 'en' ? 'Connecting…' : 'Đang kết nối…'), hint: false };
    case 'thinking':
      return {
        html: noticeHtml(v, lang) + '<div class="thinking">' + SPINNER + '☿︎ Đang suy nghĩ…\n\n' + escapeHtml(v.reasoning) + '</div>',
        hint: false,
      };
    case 'streaming':
    case 'done': {
      let html = renderMarkdown(v.text);
      if (v.reasoning) {
        html = '<details class="think-box"><summary>☿︎ Quá trình suy nghĩ của AI</summary><div class="thinking">' + escapeHtml(v.reasoning) + '</div></details>' + html;
      }
      return { html: noticeHtml(v, lang) + html, hint: false };
    }
    case 'empty':
      return {
        html: escapeHtml(v.reasoning
          ? '(AI đã suy nghĩ nhưng chưa kịp xuất câu trả lời — có thể hết hạn mức token. Thử lại hoặc chọn model khác.)'
          : '(AI không trả về nội dung nào.)'),
        hint: true,
      };
    case 'error':
      return { html: noticeHtml(v, lang) + escapeHtml(v.error ?? ''), hint: true };
  }
}

export interface AiStreamProps {
  view: StreamView;
  lang: Lang;
  className: string;
  id?: string;
}

/** Một khung trả lời (lời giải chính #aiOutput hoặc một .chat-a hỏi tiếp). */
export const AiStream = forwardRef<HTMLDivElement, AiStreamProps>(function AiStream({ view, lang, className, id }, ref) {
  const { html, hint } = streamHtml(view, lang);
  return <div ref={ref} id={id} className={className + (hint ? ' ai-hint' : '')} dangerouslySetInnerHTML={{ __html: html }} />;
});

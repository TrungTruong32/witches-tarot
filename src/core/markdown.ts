// Markdown tối giản → HTML cho lời giải AI. ESCAPE TRƯỚC, nên chữ AI trả về không thể chèn thẻ HTML.

export function escapeHtml(str: unknown): string {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(src: string): string {
  let s = escapeHtml(src);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>'); // inline code
  s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>'); // **bold**
  s = s.replace(/__([^\n]+?)__/g, '<strong>$1</strong>'); // __bold__
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<em>$2</em>'); // *italic*
  s = s.replace(/^\s{0,3}#{1,6}\s*(.+)$/gm, '<strong>$1</strong>'); // # heading → dòng đậm
  s = s.replace(/^\s*[-*]\s+(.+)$/gm, '• $1'); // gạch đầu dòng
  s = s.replace(/\n/g, '<br>'); // giữ xuống dòng
  return s;
}

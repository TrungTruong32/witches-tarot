// Ô chọn bộ bài — mọi ô (thanh chung, Tra cứu, Trải bài) dùng chung một bộ đang chọn trong store.
import { useApp, useDeckOrGuess, useDecksOrStatic } from '../app/store';

export function DeckSelect({ id, ...rest }: { id: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  // DB đang nạp: hiện sẵn danh sách bộ cố định + bộ sẽ được chọn → ô không đổi bề rộng khi DB về
  const decks = useDecksOrStatic();
  const deck = useDeckOrGuess();
  const setDeck = useApp(s => s.setDeck);
  return (
    <select id={id} value={deck ?? ''} onChange={e => setDeck(e.target.value)} {...rest}>
      {decks.map(d => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}

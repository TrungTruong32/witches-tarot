// Ô chọn bộ bài — mọi ô (thanh chung, Tra cứu, Trải bài) dùng chung một bộ đang chọn trong store.
import { useApp } from '../app/store';

export function DeckSelect({ id, ...rest }: { id: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const decks = useApp(s => s.decks);
  const deck = useApp(s => s.deck);
  const setDeck = useApp(s => s.setDeck);
  return (
    <select id={id} value={deck ?? ''} onChange={e => setDeck(e.target.value)} {...rest}>
      {decks.map(d => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}

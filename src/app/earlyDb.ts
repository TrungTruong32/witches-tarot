// Import ĐẦU TIÊN của main.tsx: route của app (không phải trang mở đầu "/") bắt đầu tải chunk sql.js + wasm + tarot.db
// ngay khi module chạy — trước cả lúc React dựng cây và boot() được gọi. Trang mở đầu vẫn hoãn DB tới sau lần vẽ đầu
// (shouldDeferBoot / scheduleBoot), nên ở đó file này không làm gì.
import { startCardsDbDownload } from '../services/cardsDb';
import { shouldDeferBoot } from './boot';

if (typeof window !== 'undefined' && !shouldDeferBoot(window.location)) startCardsDbDownload();

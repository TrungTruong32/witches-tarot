// Một lần: dựng index.html từ <head> của bản cũ (dòng 1–45, nguyên văn) + script theme chạy trước khi vẽ (dòng 833).
import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('witches_tarot.html', 'utf8').split('\n');
// Favicon data URI cũ có '%' trần (vd cx='50%') — trình duyệt bỏ qua, nhưng Vite giải mã URL và báo lỗi.
// Đổi riêng các '%' không theo sau bởi 2 chữ số hex thành %25 (giải mã ra đúng SVG cũ).
const head = lines
  .slice(0, 45)
  .join('\n')
  .replace(/href="data:image\/svg\+xml,[^"]*"/, m => m.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'));
const themeBoot = lines[832];
if (!head.trimEnd().endsWith('/>') && !head.includes('<head>')) throw new Error('unexpected head');
if (!themeBoot.includes("localStorage.getItem('theme')")) throw new Error('theme bootstrap not on line 833');
writeFileSync('index.html', `${head}
${themeBoot}
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`);
console.log('ok');

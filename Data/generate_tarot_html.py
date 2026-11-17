import json
from pathlib import Path

p = Path('witches_tarot_with_images.json')
data = json.loads(p.read_text(encoding='utf-8'))
output = Path('witches_tarot.html')

html = '''<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Witches Tarot - 78 lá bài</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #1f1b2f; color: #f5f0e9; }
    .page { max-width: 1400px; margin: 0 auto; padding: 24px; }
    header { text-align: center; margin-bottom: 18px; }
    h1 { margin: 0 0 10px; font-size: clamp(2rem, 3vw, 3rem); }
    p { margin: 0; color: #c8c2b4; }
    .controls { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 20px 0; }
    input { width: min(100%, 420px); padding: 12px 14px; border-radius: 10px; border: 1px solid #5b5470; background: #2f2a44; color: #f5f0e9; }
    button { padding: 12px 16px; border-radius: 10px; border: 1px solid #5b5470; background: #3d3563; color: #f5f0e9; cursor: pointer; }
    button:hover { background: #5a4a9b; }
    .layout { display: grid; gap: 18px; grid-template-columns: minmax(260px, 360px) 1fr; }
    .panel { background: rgba(30, 26, 44, 0.95); border: 1px solid #4d4561; border-radius: 18px; padding: 18px; }
    .cards-list { display: grid; gap: 12px; }
    .card-item { cursor: pointer; border: 1px solid transparent; border-radius: 14px; padding: 12px 14px; background: rgba(66, 57, 97, 0.85); transition: transform .15s ease, border-color .15s ease, background .15s ease; text-align: left; }
    .card-item:hover, .card-item.active { background: rgba(111, 90, 193, 0.95); border-color: #b49bff; transform: translateY(-1px); }
    .card-item strong { display: block; font-size: 1rem; margin-bottom: 6px; }
    .card-item span { color: #d1c7b3; font-size: .95rem; }
    .details { display: grid; gap: 14px; }
    .details h2 { margin: 0; font-size: 1.9rem; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: rgba(140, 121, 214, 0.18); color: #f5f0e9; border: 1px solid rgba(180, 155, 255, 0.22); font-size: .95rem; }
    .meta { display: flex; flex-wrap: wrap; gap: 10px; color: #c8c2b4; font-size: .94rem; }
    .meta strong { color: #f5f0e9; }
    .section { background: rgba(33, 28, 47, 0.95); border-radius: 14px; padding: 14px 16px; border: 1px solid #3f3954; }
    .section h3 { margin: 0 0 10px; font-size: 1.1rem; color: #efefef; }
    .section p { margin: 0 0 10px; line-height: 1.7; white-space: pre-wrap; }
    .section p:last-child { margin-bottom: 0; }
    .card-image-wrapper { text-align: center; margin-bottom: 12px; }
    .card-image { max-width: 100%; height: auto; border-radius: 16px; border: 1px solid #5b5470; box-shadow: 0 15px 35px rgba(0,0,0,0.25); }
    .no-results { padding: 18px; text-align: center; color: #e1c1d8; }
    a { color: #d6c6ff; }
    .category-tabs { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 20px 0; }
    .tab-btn { padding: 10px 14px; border-radius: 8px; border: 1px solid #5b5470; background: #3d3563; color: #c8c2b4; cursor: pointer; font-size: .95rem; transition: all .15s ease; }
    .tab-btn:hover { background: #4a4474; border-color: #7a6b9e; }
    .tab-btn.active { background: #6f5ac1; border-color: #b49bff; color: #f5f0e9; }
    @media (max-width: 980px) { .layout { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <h1>Witches Tarot - 78 lá bài</h1>
      <p>Tìm kiếm và chọn thẻ để xem ý nghĩa, từ khóa và nội dung chi tiết.</p>
    </header>
    <div class="controls">
      <input id="searchInput" type="search" placeholder="Tìm kiếm theo số, tên, từ khóa, ý nghĩa..." />
      <button id="clearButton" type="button">Xóa</button>
    </div>
    <div class="category-tabs">
      <button class="tab-btn active" data-category="all">Tất cả (78)</button>
      <button class="tab-btn" data-category="Bo An Chinh">Ẩn Chính (22)</button>
      <button class="tab-btn" data-category="Bo Wands">Wands - Lửa (14)</button>
      <button class="tab-btn" data-category="Bo Cups">Cups - Nước (14)</button>
      <button class="tab-btn" data-category="Bo Swords">Swords - Khí (14)</button>
      <button class="tab-btn" data-category="Bo Pentacles">Pentacles - Đất (14)</button>
    </div>
    <div class="layout">
      <div class="panel">
        <div id="cardsList" class="cards-list"></div>
        <div id="noResults" class="no-results" style="display:none;">Không tìm thấy lá bài nào. Thử sửa lại từ khóa.</div>
      </div>
      <div class="panel">
        <div id="cardDetails" class="details"></div>
      </div>
    </div>
  </div>
  <script>
    const cards = ''' + json.dumps(data, ensure_ascii=False).replace('</script>', '<\/script>') + ''';
    const listEl = document.getElementById('cardsList');
    const detailsEl = document.getElementById('cardDetails');
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearButton');
    const noResults = document.getElementById('noResults');
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    let selectedCategory = 'all';
    let allCards = cards;

    function createCardItem(card) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'card-item';
      item.innerHTML = `<strong>${card.so} - ${card.ten}</strong><span>${card.bo || ''}</span>`;
      item.addEventListener('click', () => selectCard(card, item));
      item.dataset.key = `${card.so} ${card.ten} ${card.bo || ''} ${card.tu_khoa || ''} ${card.y_nghia_xuoi || ''} ${card.nghia_nguoc || ''}`.toLowerCase();
      return item;
    }

    function renderList(cardArray) {
      listEl.innerHTML = '';
      if (!cardArray.length) {
        noResults.style.display = 'block';
        detailsEl.innerHTML = '<div class="section"><h3>Chưa chọn lá bài</h3><p>Hãy thử tìm kiếm khác hoặc xóa bộ lọc.</p></div>';
        return;
      }
      noResults.style.display = 'none';
      cardArray.forEach((card, index) => {
        const item = createCardItem(card);
        listEl.appendChild(item);
        if (index === 0) {
          selectCard(card, item);
        }
      });
    }

    function selectCard(card, itemNode) {
      document.querySelectorAll('.card-item').forEach(el => el.classList.remove('active'));
      if (itemNode) itemNode.classList.add('active');

      detailsEl.innerHTML = `
        ${card.image_url ? `<div class="section card-image-wrapper"><img class="card-image" src="${card.image_url}" alt="${card.ten}" loading="lazy" /></div>` : ''}
        <div class="section">
          <div class="meta"><span class="badge">${card.so}</span><span>${card.bo || ''}</span></div>
          <h2>${card.ten}</h2>
          <div class="meta">
            ${card.url ? `<span><strong>Link:</strong> <a href="${card.url}" target="_blank" rel="noreferrer noopener">Xem trang</a></span>` : ''}
          </div>
        </div>
        ${card.chiem_tinh_hoc ? `<div class="section"><h3>Chiêm tinh học</h3><p>${card.chiem_tinh_hoc}</p></div>` : ''}
        ${card.than_thanh ? `<div class="section"><h3>Thần thánh</h3><p>${card.than_thanh}</p></div>` : ''}
        ${card.tu_khoa ? `<div class="section"><h3>Từ khóa</h3><p>${card.tu_khoa}</p></div>` : ''}
        ${card.y_nghia_xuoi ? `<div class="section"><h3>Ý nghĩa xuôi</h3><p>${card.y_nghia_xuoi}</p></div>` : ''}
        ${card.nghia_nguoc ? `<div class="section"><h3>Ý nghĩa ngược</h3><p>${card.nghia_nguoc}</p></div>` : ''}
        ${card.content ? `<div class="section"><h3>Nội dung đầy đủ</h3><p>${card.content}</p></div>` : ''}
      `;
    }

    function updateFilter() {
      const query = searchInput.value.trim().toLowerCase();
      let filtered = allCards;
      
      if (selectedCategory !== 'all') {
        filtered = filtered.filter(card => card.bo === selectedCategory);
      }
      
      filtered = filtered.filter(card => {
        const text = [card.so, card.ten, card.bo, card.tu_khoa, card.y_nghia_xuoi, card.nghia_nguoc, card.content]
          .filter(Boolean)
          .join(' ').toLowerCase();
        return text.includes(query);
      });
      renderList(filtered);
    }

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCategory = btn.dataset.category;
        searchInput.value = '';
        updateFilter();
      });
    });

    searchInput.addEventListener('input', updateFilter);
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      updateFilter();
      searchInput.focus();
    });

    renderList(allCards);
  </script>
</body>
</html>
'''

output.write_text(html, encoding='utf-8')
print(f'Created {output.resolve()}')

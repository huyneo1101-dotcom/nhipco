---
name: theme-pack
description: >-
  Sinh hoặc mở rộng bộ theme màu bằng CSS custom properties theo đúng khuôn đang dùng ở
  nhipco/CueZen (7 theme: midnight/coffee/court/racing/neon/peach/sage/periwinkle qua
  body.theme-*) và các app anh em. Dùng khi người dùng nói "thêm theme mới", "đổi bảng màu",
  "làm chế độ sáng/tối", "app cần nhiều giao diện".
---

# Skill: Theme Pack

Mỗi app trong hệ sinh thái này tự viết lại 1 bộ theme CSS custom-properties từ đầu, hơi khác
nhau về tên biến. Skill này chuẩn hoá theo bộ biến nhipco đang dùng — khi tạo app mới hoặc thêm
theme cho app cũ, ưu tiên tái dùng đúng tên biến này để sau này dễ copy theme qua lại giữa các
app.

## Bộ biến chuẩn (tối thiểu, lấy từ nhipco `index.html`)
```css
:root{
  --bg:#0a241c; --bg2:#0d2b22;      /* nền gradient: bg2 → bg */
  --card:#103a2e; --card2:#0e3328;  /* nền card, card2 nhạt hơn cho gradient card */
  --line:#1d5743;                   /* viền */
  --text:#eafff5; --muted:#8fc7b2; --soft:#bfe9d6;  /* 3 mức độ đậm nhạt của chữ */
  --gold:#f4c95d; --on-gold:#1a1206; /* màu nhấn chính + màu chữ TRÊN nền nhấn */
  --accent:#34d399; --accent2:#10b981; /* màu nhấn phụ (nút hành động) */
  --warn:#fbbf24; --danger:#f87171; --ok:#34d399;
  --shadow:0 10px 30px rgba(0,0,0,.35);
  --r:18px; /* border-radius chuẩn của card */
}
```
Mỗi theme khác chỉ override các biến màu (giữ nguyên `--r`, và `--shadow` chỉ đổi nếu theme là
nền sáng — theme sáng cần shadow nhạt hơn nhiều, xem `theme-court`/`theme-peach`/`theme-sage`
bên dưới).

## Áp theme qua class trên `<body>`
```css
body.theme-midnight{
  --bg:#0b1020; --bg2:#0e1530; --card:#161f3d; --card2:#131b35;
  --line:#293561; --text:#eaf0ff; --muted:#93a0cf; --soft:#c3cdf2;
  --gold:#9db4ff; --on-gold:#0b1020; --accent:#7c9bff; --accent2:#5d7cf0;
}
body.theme-court{ /* light */
  --bg:#eef4f0; --bg2:#e3ede8; --card:#ffffff; --card2:#f4f8f6;
  --line:#d4e3da; --text:#11302a; --muted:#5b7a70; --soft:#23463d;
  --gold:#0f9d6b; --on-gold:#ffffff; --accent:#10b981; --accent2:#059669;
  --shadow:0 8px 24px rgba(16,60,48,.12);
}
```
- Theme NỀN TỐI: `--shadow` giữ đậm mặc định, `--on-gold` thường là màu tối (chữ tối trên nút
  vàng/sáng).
- Theme NỀN SÁNG (đánh dấu comment `/* light */` cho dễ nhận ra khi đọc lại): PHẢI đổi
  `--shadow` sang nhạt hơn nhiều (`rgba(...,.12)` thay vì `.35`), và `--on-gold` thường là
  `#ffffff` vì nút nhấn ở theme sáng thường đậm màu hơn nền.

## Thêm theme mới — quy trình
1. Hỏi người dùng: theme mới là NỀN TỐI hay NỀN SÁNG, và 1-2 màu chủ đạo mong muốn.
2. Chọn `--bg`/`--bg2` trước (chênh lệch nhẹ, `bg2` là điểm sáng nhất của gradient góc trên).
3. `--card`/`--card2` phải tương phản đủ với `--bg` để card nổi lên nhưng không chói.
4. `--text` tương phản mạnh với `--bg` (đạt AA contrast tối thiểu ~4.5:1) — kiểm tra bằng mắt
   nếu không có công cụ, ưu tiên chênh lệch độ sáng (lightness) > 50% giữa `--text` và `--bg`.
5. `--gold`/`--accent` là 2 màu nhấn khác nhau (không trùng) để phân biệt hành động chính vs phụ.
6. Đặt tên class `body.theme-<ten-tieng-anh-khong-dau>` và thêm vào danh sách theme picker
   trong UI (thường là 1 mảng `THEMES = [...]` trong `index.html`).

## Light/Dark mode riêng biệt (tách khỏi theme màu)
Nếu app cần "Sáng/Tối/Theo máy" NGOÀI bộ theme màu (như just-us đã thêm gần đây), dùng
`data-theme` attribute độc lập với `body.theme-*`:
```js
function applyMode(mode){ // 'light' | 'dark' | 'system'
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode === 'system' ? sys : mode);
  localStorage.setItem('<app>.mode', mode);
}
```
Đây là lớp riêng với bộ theme màu (`body.theme-*`) — 2 hệ thống chồng lên nhau, không thay thế
nhau. Chỉ thêm lớp này nếu người dùng yêu cầu rõ "chế độ sáng/tối/theo máy", đừng tự ý thêm vào
mọi app.

## Sau khi thêm/sửa theme
Chạy `pwa-healthcheck` phần "manifest.json" để xác nhận `theme_color`/`background_color` trong
manifest vẫn khớp (ít nhất) với theme mặc định của app.

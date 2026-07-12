---
name: scaffold-vibe-pwa
description: >-
  Khởi tạo bộ khung app tĩnh một-file kiểu "vibe-coded PWA" (index.html + React/Babel CDN
  + manifest.json + sw.js, không build step) — đúng khuôn đã dùng ở nhipco/CueZen, just-us,
  poolmate, vinha-web, huongdien-work. Dùng khi người dùng nói "tạo app mới", "scaffold app",
  "khởi tạo project PWA", hoặc mở một repo trống muốn bắt đầu theo phong cách cũ.
---

# Skill: Scaffold Vibe PWA

Sinh đủ bộ file khởi điểm cho một app tĩnh một-file, tránh phải gõ lại boilerplate và tránh
lỗi kinh điển đã gặp: khai báo `navigator.serviceWorker.register('sw.js')` nhưng quên tạo
`sw.js` (đã xảy ra ở vinha-web, huongdien-work).

## Khi nào dùng
- Repo trống hoặc gần trống, người dùng muốn bắt đầu một app mới theo phong cách "một file
  index.html, không build, deploy tĩnh".
- KHÔNG dùng nếu người dùng đã chọn rõ một framework có build step (Next.js, Vite...) — đó là
  hướng khác, không phải phong cách của các app này.

## Bước 1 — Hỏi 3 thứ tối thiểu (nếu chưa rõ từ ngữ cảnh)
1. Tên app + tagline ngắn (tiếng Việt, theo đúng phong cách các app hiện có).
2. Có cần Supabase (đăng nhập/đồng bộ mây) ngay từ đầu không? Nếu có → sau bước này chạy tiếp
   skill `supabase-sync`.
3. Theme màu chủ đạo (hex) — nếu không có, dùng placeholder rồi chạy skill `theme-pack` sau.

## Bước 2 — Tạo `manifest.json`
```json
{
  "name": "<Tên đầy đủ> — <tagline>",
  "short_name": "<Tên ngắn>",
  "description": "<Mô tả 1 câu>",
  "lang": "vi",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a241c",
  "theme_color": "#0d2b22",
  "icons": [
    { "src": "./icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

## Bước 3 — Tạo `sw.js` (app-shell offline + network-first cho trang chính)
Đây là chiến lược cache đã dùng thống nhất ở nhipco/just-us/poolmate — copy nguyên, chỉ đổi
`CACHE` const mỗi lần đổi tên app:
```js
const CACHE = '<ten-app-viet-thuong>-v1';
const CORE = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((r) => {
        if (r && r.ok && (url.origin === location.origin || url.host.includes('jsdelivr'))) {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put(req, cp));
        }
        return r;
      }).catch(() => cached)
    )
  );
});
```
**QUAN TRỌNG**: mỗi lần đổi nội dung `index.html` sau này, phải bump số version trong `CACHE`
(vd `v1` → `v2`) nếu muốn client cũ nhận bản mới ngay — nếu không nhớ việc này, dùng skill
`pwa-healthcheck` để kiểm tra trước khi publish.

## Bước 4 — Tạo `index.html` khung
- `<!doctype html>` + `lang="vi"`, viewport có `viewport-fit=cover`, `theme-color`.
- Link `manifest.json`, `icon.svg` (icon + apple-touch-icon), `apple-mobile-web-app-*` meta.
- Script tag React 18 UMD + ReactDOM UMD + `@babel/standalone` qua jsdelivr — **pin version cụ
  thể** (không dùng `@latest`) để tránh app vỡ khi CDN cập nhật breaking. Chỉ thêm
  `@supabase/supabase-js` nếu bước 1 xác nhận cần cloud sync.
- `<style>` dùng biến CSS custom properties `:root{--bg;--bg2;--card;--text;--muted;--gold;
  --accent;...}` — nếu người dùng chưa chốt theme, để placeholder rồi giao cho `theme-pack`.
- `<script type="text/babel">` chứa component App, render bằng `ReactDOM.createRoot`.
- Cuối file: đăng ký service worker có bọc try/catch và check `'serviceWorker' in navigator`.
- Đăng ký `sw.js` PHẢI khớp file thật vừa tạo ở Bước 3 — không được để trống.

## Bước 5 — Icon + file phụ
- `icon.svg` placeholder đơn giản (logo chữ cái đầu trên nền màu theme).
- `.nojekyll` (rỗng) nếu định deploy GitHub Pages.
- `README.md` ngắn: mô tả app + 2 dòng lệnh deploy (xem skill `deploy-static`).

## Bước 6 — Sau khi scaffold xong
Nhắc người dùng chạy tiếp (không tự động chạy nếu chưa được yêu cầu):
- `theme-pack` nếu chưa chốt bảng màu/nhiều theme.
- `supabase-sync` nếu cần đăng nhập/đồng bộ mây.
- `deploy-static` để nối CI/CD.
- `pwa-healthcheck` như bước kiểm tra cuối trước khi commit lần đầu.

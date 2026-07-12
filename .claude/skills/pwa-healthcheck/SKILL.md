---
name: pwa-healthcheck
description: >-
  Kiểm tra sức khoẻ một app PWA một-file (index.html + manifest.json + sw.js) trước khi
  commit/deploy — bắt lỗi thiếu sw.js dù có register, quên bump cache version, manifest sai,
  icon thiếu, CDN không pin version. Dùng khi người dùng nói "kiểm tra app", "review trước khi
  deploy", "app không cập nhật/không offline được", hoặc trước khi push lên GitHub Pages/Netlify.
---

# Skill: PWA Healthcheck

Các app trong hệ sinh thái này (nhipco, just-us, poolmate, vinha-web, huongdien-work, hoc_ai,
diem-tin-the-gioi) đều tự tay viết PWA thay vì dùng generator, nên rất dễ lệch giữa các file.
Đã phát hiện thực tế: **vinha-web** và **huongdien-work** gọi
`navigator.serviceWorker.register('sw.js')` trong `index.html` nhưng repo không có `sw.js`
nào cả — app "âm thầm" mất khả năng offline mà không báo lỗi rõ ràng. Skill này chặn lớp lỗi đó.

## Quy trình kiểm tra (chạy từng mục, báo cáo dạng ✅/⚠️/❌)

### 1. Service worker tồn tại và khớp
```
grep -o "serviceWorker.register([^)]*)" index.html
```
- Nếu có gọi `register(...)` → file đường dẫn đó (thường `sw.js`) **PHẢI** tồn tại trong repo.
  ❌ nếu thiếu — đây là lỗi ưu tiên cao nhất, sửa ngay bằng cách tạo `sw.js` (xem
  `scaffold-vibe-pwa` để lấy template chuẩn) hoặc xoá dòng register nếu app cố tình không cần
  offline.
- Nếu KHÔNG gọi register nhưng `manifest.json` tồn tại → app chỉ "installable" chứ không
  offline-capable, ghi rõ ⚠️ để người dùng biết đó là chủ ý hay thiếu sót.

### 2. Cache version đã bump chưa
```
git diff --stat HEAD~1 -- index.html sw.js 2>/dev/null
grep -o "CACHE = '[^']*'" sw.js
```
- Nếu `index.html` đổi nội dung đáng kể (không chỉ sửa lỗi chính tả) nhưng `CACHE` trong `sw.js`
  giữ nguyên tên/version so với commit trước → ⚠️ user cũ có thể bị kẹt bản cache cũ. Đề xuất
  bump version (`v29` → `v30`, theo đúng cách nhipco đang làm — xem `sw.js` hiện tại của
  nhipco: `const CACHE = 'nhipco-v30'`).

### 3. manifest.json hợp lệ
```
python3 -c "import json,sys; json.load(open('manifest.json'))" && echo OK
```
- Parse JSON hợp lệ.
- `icons[].src` trỏ tới file tồn tại thật trong repo.
- `start_url`/`scope` là đường dẫn tương đối (`./`), không phải absolute path lệch domain deploy
  (đặc biệt quan trọng nếu deploy vào subpath GitHub Pages dạng `user.github.io/repo/`).
- Có `theme_color`/`background_color` khớp với biến CSS `--bg`/`--bg2` trong `index.html` (không
  bắt buộc khớp tuyệt đối nhưng nên gần đúng để splash screen không bị lệch màu).

### 4. CDN pin version nhất quán
```
grep -oE 'cdn\.jsdelivr\.net/npm/[^"]+' index.html
```
- Mỗi thư viện (react, react-dom, @babel/standalone, @supabase/supabase-js, leaflet...) phải có
  version số cụ thể, KHÔNG dùng `@latest`.
- Nếu app có nhiều file HTML (vd vinha-web có `index.html` + `landing.html`) → version phải
  khớp nhau giữa các file, tránh lệch UI do 2 bản React khác nhau.

### 5. Icon/asset tham chiếu có thật
```
grep -oE 'href="\.?/[^"]+"|src="\.?/[^"]+"' index.html manifest.json | grep -v http
```
Đối chiếu từng đường dẫn cục bộ với file thật có trong repo — báo ❌ mọi đường dẫn chết.

### 6. Không commit dữ liệu nhạy cảm
- Nếu app dùng Supabase, kiểm tra không có gì ngoài `SB_URL`/anon `SB_KEY` (public theo thiết
  kế của Supabase) — KHÔNG được có service_role key hay password thật trong `index.html`/log.
- Nếu repo có thư mục `logs/` hoặc backup JSON (như đã thấy bị `.gitignore` ở just-us,
  huongdien-work) → xác nhận `.gitignore` đang chặn đúng, không lỡ commit dữ liệu cá nhân.

## Báo cáo cuối
Liệt kê ngắn gọn theo thứ tự mức độ nghiêm trọng, mỗi dòng 1 mục kèm ✅/⚠️/❌ và cách sửa nếu
❌/⚠️. Không cần liệt lại các mục ✅ dài dòng — chỉ nêu tổng số đã qua.

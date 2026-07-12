---
name: doc-single-file-app
description: >-
  Sinh file CLAUDE.md cho một app tĩnh một-file (index.html khổng lồ + PWA) — ghi lại kiến trúc,
  sơ đồ dữ liệu localStorage, quy ước, và cảnh báo "đừng đọc cả file". Dùng khi mở một repo chưa
  có CLAUDE.md (hiện 7/8 app thiếu), hoặc khi người dùng nói "tạo CLAUDE.md", "tài liệu hoá dự
  án", "ghi chú cho AI".
---

# Skill: Doc Single-File App

7/8 app chưa có CLAUDE.md — mỗi lần mở lại, Claude phải dò lại kiến trúc từ đầu và dễ đọc nhầm
cả file lớn. Skill này tạo 1 CLAUDE.md ngắn gọn, đúng trọng tâm cho kiểu app này (khác app có
build). diem-tin-the-gioi là mẫu tốt đã có sẵn.

## Nguyên tắc: CLAUDE.md phải NGẮN và HÀNH ĐỘNG ĐƯỢC
Không viết văn giới thiệu dài. Chỉ ghi thứ giúp lần sau sửa nhanh & không phá vỡ dữ liệu.

## Bước 1 — Khảo sát nhanh (không đọc cả index.html)
```bash
wc -l index.html                                              # cỡ file → cảnh báo mức nào
grep -oE "localStorage\.(get|set)Item\('[^']+'" index.html | grep -oE "'[^']+'" | sort -u  # các khoá dữ liệu
grep -nE "^(function|const) [A-Z][A-Za-z0-9]+ *[=(]" index.html | head -30   # component chính
grep -oE 'cdn\.jsdelivr\.net/npm/[^"]+' index.html | sort -u  # thư viện + version
grep -c "supabase" index.html                                 # có backend không
ls *.html sw.js manifest.json 2>/dev/null                     # file PWA
```

## Bước 2 — Sinh CLAUDE.md theo khung sau
```markdown
# <Tên app> — <mô tả 1 câu>

App tĩnh một-file: toàn bộ UI + logic + CSS trong `index.html` (~<N> dòng), React 18 + Babel
Standalone qua CDN, KHÔNG build step. Deploy tĩnh (<GitHub Pages / Netlify>).

## Quy tắc làm việc với file này
- **KHÔNG đọc cả `index.html` (~<size>)** — dùng grep định vị rồi Read cửa sổ nhỏ (xem skill
  `bigfile-nav`).
- Sửa xong nội dung đáng kể → **bump `CACHE` trong `sw.js`** (hiện: `<tên-CACHE-hiện-tại>`).
- Không sửa `index.html` gây lỗi cú pháp câm — Babel transpile trong trình duyệt, sai là trắng
  màn hình. Kiểm tra Console sau khi sửa.

## Dữ liệu (localStorage, tiền tố `<tiềntố>.`)
| Khoá | Ý nghĩa | Kiểu |
|---|---|---|
| `<tiềntố>.<...>` | ... | mảng/object |
- SCHEMA_VERSION hiện tại: <n> (xem skill `local-store` khi đổi cấu trúc).
- Đồng bộ Supabase: <có/không>; khoá đồng bộ nằm trong `SYNC_KEYS`.

## Bản đồ component chính
- `App` — <dòng ~>; các tab/màn hình: <liệt kê tên + chức năng 1 dòng>.

## Thư viện (đã pin version)
- react@<ver>, react-dom@<ver>, @babel/standalone@<ver><, supabase-js@<ver>, leaflet@<ver>>.

## Deploy
- <GitHub Pages qua .github/workflows/... / Netlify qua netlify.toml>. Push `main` → tự deploy.
```

## Bước 3 — Điền bằng dữ liệu thật từ Bước 1
Thay mọi `<...>` bằng giá trị grep được. Bảng dữ liệu chỉ cần các khoá CHÍNH (bỏ khoá phụ như
`.theme`, `._syncAt`). Bản đồ component chỉ liệt kê tab/màn hình lớn, không liệt kê mọi hàm.

## Bước 4 — Đặt file + (tuỳ chọn) skill riêng
- Ghi `CLAUDE.md` ở gốc repo.
- Nếu app có QUY TRÌNH vận hành đặc thù (như diem-tin-the-gioi có "quét tin"), cân nhắc tạo thêm
  1 project skill riêng trong `.claude/skills/` của repo đó — nhưng skill hạ tầng dùng chung thì
  đã nằm ở plugin `vibe-pwa-kit`, không lặp lại.

## Không làm quá
- Đừng chép cả đoạn code vào CLAUDE.md — chỉ trỏ số dòng + tên hàm để grep.
- Đừng liệt kê hết mọi khoá/hàm — CLAUDE.md dài quá thì lần sau không ai (kể cả AI) đọc kỹ.

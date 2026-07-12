---
name: deploy-static
description: >-
  Nối CI/CD deploy cho app tĩnh không-build (GitHub Pages qua Actions và/hoặc Netlify qua
  netlify.toml) theo đúng cách đã dùng ở just-us, hoc_ai, diem-tin-the-gioi. Dùng khi người
  dùng nói "deploy app này", "lên GitHub Pages", "thêm Netlify", hoặc khi scaffold xong app mới
  chưa có cách publish. poolmate, huongdien-work, saban-app hiện CHƯA có bước này.
---

# Skill: Deploy Static

App loại này không cần build — publish thẳng thư mục gốc. Vẫn nên dùng Actions thay vì bấm tay
để tránh quên deploy sau khi sửa.

## Bước 1 — Xác nhận target
Hỏi (nếu chưa rõ): chỉ GitHub Pages, chỉ Netlify, hay cả hai (như just-us/hoc_ai — deploy song
song 2 nơi, không xung đột vì đều publish cùng nội dung tĩnh).

## Bước 2 — GitHub Pages via Actions
Tạo `.github/workflows/deploy-pages.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```
- Cần bật Pages → Source: "GitHub Actions" trong Settings của repo (không tự làm được qua git,
  nhắc người dùng bật tay 1 lần nếu là repo mới).
- Tạo file `.nojekyll` rỗng ở gốc repo — bắt buộc, nếu không GitHub Pages sẽ bỏ qua mọi
  file/thư mục bắt đầu bằng `_` hoặc coi `index.html` theo luật Jekyll.

## Bước 3 — Netlify via netlify.toml
Tạo `netlify.toml` ở gốc repo:
```toml
[build]
  publish = "."
  command = ""
```
Không cần build command vì không có build step. Người dùng tự link repo trong Netlify dashboard
1 lần (không có cách làm qua CLI/git thuần), sau đó mọi push vào `main` tự deploy.

## Bước 4 — Kiểm tra trước khi coi là xong
- Chạy nhanh: file `index.html` ở gốc repo (không nằm trong `public/`/`dist/`) — cả 2 target
  đều publish thẳng root.
- Nếu app có gọi `fetch('./manifest.json')` hay asset tương đối khác, xác nhận đường dẫn không
  giả định app nằm ở domain gốc (`/`) — GitHub Pages có thể serve ở subpath
  `username.github.io/repo/`, nên mọi đường dẫn asset PHẢI tương đối (`./`), không tuyệt đối
  (`/manifest.json`).
- Sau khi có workflow, gợi ý chạy `pwa-healthcheck` một lần nữa vì lỗi asset chết dễ chỉ lộ ra
  khi deploy thật lên subpath khác localhost.

## Ghi chú
- KHÔNG tạo cả `vercel.json` trừ khi người dùng yêu cầu cụ thể — hệ app này chưa dùng Vercel ở
  đâu, không cần thêm 1 target thứ 3 mặc định.
- Không cần thêm bước build/test vào workflow vì các app này không có test suite — đừng bịa
  thêm `npm test`/`npm run build` không tồn tại.

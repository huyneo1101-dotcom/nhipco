# CueZen — bạn đồng hành giữ tập trung khi chơi bi-a (tâm lý, kỹ thuật, nhật ký, rèn luyện)

App tĩnh một-file: toàn bộ UI + logic + CSS trong `index.html` (~4.973 dòng), React 18 + Babel Standalone qua CDN, KHÔNG build step. PWA (`manifest.json` + `sw.js`). Deploy tĩnh (host thẳng thư mục gốc, push `main` → live).

## Quy tắc làm việc với file này
- **KHÔNG đọc cả `index.html` (~5.000 dòng)** — dùng grep định vị rồi Read cửa sổ nhỏ (xem skill `bigfile-nav`).
- Sửa nội dung đáng kể → **bump `CACHE` trong `sw.js`** (hiện: `nhipco-v33`).
- Babel transpile trong trình duyệt: lỗi cú pháp là trắng màn hình, không báo terminal. Kiểm tra Console sau khi sửa.

## Dữ liệu (localStorage, tiền tố `nc.`)
Truy cập qua helper `store` (dòng ~798): `store.get(k,def)` / `store.set(k,v)`. Mỗi `set` một khoá `nc.*` tự lên lịch đẩy đồng bộ (`schedulePush`).

| Khoá | Ý nghĩa | Kiểu |
|---|---|---|
| `nc.matches` | Nhật ký trận đấu | mảng |
| `nc.positions` | Thư viện thế bi / vị trí | mảng |
| `nc.mistakes` | Lỗi đã ghi nhận | mảng |
| `nc.training` | Dữ liệu rèn luyện (drill) | mảng/object |
| `nc.plans` / `nc.weekplan` | Kế hoạch tập | mảng/object |
| `nc.ghost` / `nc.ghostTypes` | Ghost game (tự đấu) | object |
| `nc.routine` / `nc.breath` | Quy trình khởi động + thở | object |
| `nc.customcues` `nc.customDrills` `nc.customMistakes` `nc.customProblems` | Nội dung người dùng tự thêm | mảng |
| `nc.knowfav` `nc.knowpin` `nc.knowarchive` `nc.knowrev` | Trạng thái tab Kiến thức | mảng/object |

(Khoá phụ bỏ qua: `nc.theme`, `nc.taborder`, `nc.segorder`, `nc.bpm`, `nc._syncAt`, …)

- Đồng bộ Supabase: **có** (auth email/password + sync bảng theo user). Danh sách khoá đồng bộ nằm trong `SYNC_KEYS` (dòng ~756); sao lưu/xuất-nhập dùng chung danh sách này. Không có SCHEMA_VERSION — migration khi đổi cấu trúc: xem skill `local-store`.

## Bản đồ component chính
- `App` — dòng ~1461. 5 tab (`TAB_DEFS` ~1333, render qua `tabView` ~1351):
  - `pre` 🧘 **Tâm & Thân** → `PreMatch` (Metronome, Breathe, Routine, Cue).
  - `table` 🎱 **Thi đấu** → `AtTable` (LiveTally, DieuBiAdvisor, PositionsView).
  - `log` 📓 **Nhật ký** → `MatchLog` (MatchForm, SummaryView).
  - `train` 📈 **Rèn luyện** → `Training` (DRILLS, PROBLEMS, STRETCHES).
  - `know` 📚 **Kiến thức** → `KnowTab`.
- **Kiến thức**: mảng `KNOWLEDGE` (~3895) là nguồn thật duy nhất. `KnowledgeView` chia **4 mục** qua `secOf`: `tactic` (tag `Chiến thuật`, 22 bài, phẳng) · `tech` (tag `Kỹ thuật`, 24 bài, nhóm con `TECH_SUBCATS`) · `phys` (`Thể trạng`/`Dinh dưỡng`/`Thể lực`, 4 bài) · `psy` (tag `Tâm lý`, 34 bài, nhóm con `PSY_SUBCATS`). Tổng 84 bài.
  - Thêm tag mới thì phải sửa **4 chỗ**: `KNOW_CATS` · `secOf` · nút trong `catbar` · bộ lọc nhánh `phys` (nếu không loại trừ, tag mới bị mục Thể chất nuốt).
  - `KNOW_CARDS` (~4663) tự sinh thẻ ôn luyện từ mọi mục `body` — thêm bài là tab Ôn luyện tự có thẻ, không phải sửa gì.
  - ⚠️ `data/knowledge.js` (178 KB) là **bản chết**, không được `index.html` hay `sw.js` nạp; đừng sửa nó, cũng đừng lấy làm chuẩn.
- Đồng bộ đám mây: `cloudInit`/`cloudPush`/`cloudApply`/`cloudSnap` (~764–791); `Settings` (~1761) chứa auth + backup.
- 9 theme qua `body.theme-*` (midnight/coffee/court/racing/neon/peach/sage/periwinkle/color) — xem skill `theme-pack`.

## Thư viện (đã pin version)
- react@18.2.0, react-dom@18.2.0, @babel/standalone@7.23.6, @supabase/supabase-js@2.45.4 (tất cả qua cdn.jsdelivr.net).

## Deploy
- Tĩnh, không CI (không có `netlify.toml` / `.github/workflows`). Remote `huyneo1101-dotcom/nhipco`; host phục vụ thẳng thư mục gốc, push `main` là cập nhật. Xem skill `deploy-static` nếu muốn nối CI/CD.

## Skills dùng chung
Repo có `.claude/skills/` (13 skill từ plugin vibe-pwa-kit): bigfile-nav, local-store, data-backup, web-push, pwa-healthcheck, scaffold-vibe-pwa, supabase-sync, deploy-static, theme-pack, lock-static-app, doc-single-file-app, smoke-test, supabase-security-audit.

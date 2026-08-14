# ⛔ ĐỌC TRƯỚC KHI SỬA APP — `index.html` LÀ BẢN DỰNG, KHÔNG PHẢI NGUỒN

Từ 10/08/2026 app này không còn bắt điện thoại người dùng tự dịch mã mỗi lần mở.
Việc dịch chuyển sang Mac lúc dựng bản, nên cấu trúc đổi:

| File | Vai trò |
|---|---|
| `nguon/app.jsx` | **mã app — ĐÂY là chỗ sửa** |
| `nguon/khung.html` | phần HTML bao quanh, chỗ chèn mã đánh dấu `<!--@@APP@@-->` |
| `index.html` | **bản dựng, sinh tự động — CẤM sửa tay** |

Sửa xong `nguon/app.jsx` thì dựng lại, nếu không thì bản chạy vẫn là mã cũ:

```bash
python3 /Users/Huy/Claude/HeThong/dungapp/dung.py /Users/Huy/Claude/App/NhipCo
```

**Vì sao phải có dòng cảnh báo này:** sửa thẳng vào `index.html` vẫn chạy được ngay,
không lỗi nào phát ra — nên không có gì báo cho biết là đã sửa nhầm chỗ. Lần dựng kế
tiếp mới nuốt mất bản sửa ấy. Công cụ có chốt: thấy `index.html` lệch với dấu vân tay
của lần dựng trước thì DỪNG và bắt gộp tay, chứ không ghi đè.

---

# CueZen — bạn đồng hành giữ tập trung khi chơi bi-a (tâm lý, kỹ thuật, nhật ký, rèn luyện)

App tĩnh một-file: toàn bộ UI + logic + CSS trong `index.html` (~5.611 dòng), React 18 + Babel Standalone qua CDN, KHÔNG build step. PWA (`manifest.json` + `sw.js`). Deploy tĩnh (host thẳng thư mục gốc, push `main` → live).

## Quy tắc làm việc với file này
- **KHÔNG đọc cả `index.html` (~5.000 dòng)** — dùng grep định vị rồi Read cửa sổ nhỏ (xem skill `bigfile-nav`).
- Sửa nội dung đáng kể → **bump `CACHE` trong `sw.js`** (hiện: `nhipco-v46`).
- Babel transpile trong trình duyệt: lỗi cú pháp là trắng màn hình, không báo terminal. Kiểm tra Console sau khi sửa.
- ⛔ **CẤM viết cỡ chữ bằng `px`** — dùng `rem` (`font-size:0.8125rem` thay `13px`, `style={{fontSize:'0.8125rem'}}` thay `fontSize:13`). Từ 14/08/2026 người dùng chọn được cỡ chữ ở Cài đặt, cơ chế là đổi `font-size` của thẻ `<html>` (14/16/18/20px) nên **chỉ cỡ chữ viết bằng rem mới đổi theo**. Một chỗ viết px vẫn hiện đúng ở cỡ Vừa, không lỗi nào phát ra — mãi tới khi người dùng chọn cỡ khác mới lộ ra là chỗ đó đứng im. Quy đổi: chia cho 16.
  - **Ngoại lệ đúng**: `fontSize=` trong `<svg>` (đơn vị là toạ độ viewBox, không phải cỡ chữ trang) · `font-size:34vw` của đồng hồ bấm giờ toàn màn hình · `html{font-size:16px}` ở đầu `khung.html` (chính là cỡ nền) · chữ mẫu "A" trong nút chọn cỡ chữ (phải bày 4 cỡ cạnh nhau).
  - ⚠️ **Ô nhập trong hàng flex phải có `min-width:0`** — `<input>` mặc định rộng theo 20 ký tự, ở cỡ Lớn/Rất lớn bề rộng tối thiểu ấy đẩy cả hàng tràn ngang ra ngoài màn hình. Đã vấp ở `.editrow input`.
  - Nghiệm thu sau khi thêm giao diện mới: mở app rồi chạy phép soi tràn ngang ở **cả 4 cỡ** (đặt `document.documentElement.style.fontSize` rồi so `scrollWidth` với `clientWidth`).

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

(Khoá phụ bỏ qua: `nc.theme`, `nc.fontsize`, `nc.taborder`, `nc.segorder`, `nc.bpm`, `nc._syncAt`, …)

- Đồng bộ Supabase: **có** (auth email/password + sync bảng theo user). Danh sách khoá đồng bộ nằm trong `SYNC_KEYS` (dòng ~756); sao lưu/xuất-nhập dùng chung danh sách này. Không có SCHEMA_VERSION — migration khi đổi cấu trúc: xem skill `local-store`.

## Bản đồ component chính
- `App` — dòng ~1461. 5 tab (`TAB_DEFS` ~1333, render qua `tabView` ~1351):
  - `pre` 🧘 **Tâm & Thân** → `PreMatch` (Metronome, Breathe, Routine, Cue).
  - `table` 🎱 **Thi đấu** → `AtTable` (LiveTally, DieuBiAdvisor, PositionsView).
  - `log` 📓 **Nhật ký** → `MatchLog` (MatchForm, SummaryView).
  - `train` 📈 **Rèn luyện** → `Training` (DRILLS, PROBLEMS, STRETCHES).
  - `know` 📚 **Kiến thức** → `KnowTab`.
- **Kiến thức**: mảng `KNOWLEDGE` (~3895) là nguồn thật duy nhất. `KnowledgeView` chia **5 mục** qua `secOf`, thứ tự hiển thị trong catbar (Tâm lý đứng đầu, Cơ thủ ngay cạnh — Huy chốt 08/08/2026): `psy` (tag `Tâm lý`, 41 bài, nhóm con `PSY_SUBCATS`, mặc định mở khi vào tab) · `coThu` (tag `Cơ thủ`, 3 bài, **phẳng không nhóm con** — hồ sơ tâm lý cơ thủ đỉnh cao, routine hằng ngày tự thêm) · `tactic` (tag `Chiến thuật`, 22 bài, nhóm con `TAC_SUBCATS`) · `tech` (tag `Kỹ thuật`, 24 bài, nhóm con `TECH_SUBCATS`) · `phys` (`Thể trạng`/`Dinh dưỡng`/`Thể lực`, 17 bài, nhóm con `PHYS_SUBCATS`). Tổng 107 bài.
  - Thêm tag mới thì phải sửa **4 chỗ**: `KNOW_CATS` · `secOf` · nút trong `catbar` · bộ lọc nhánh `phys` (nếu không loại trừ, tag mới bị mục Thể chất nuốt — nhánh `phys` hiện loại trừ `Tâm lý`/`Cơ thủ`/`Chiến thuật`/`Kỹ thuật` qua `secOf`). Thêm tag mới còn phải khai vào `TAG_RIENG` của `do-kien-thuc.py`, nếu không phép đo tính tag đó vào mục Thể chất rồi kêu oan.
  - ⚠️ Thêm bài mới vào **4 mục có nhóm con** thì phải khai key vào `TAC_SUBCATS`/`TECH_SUBCATS`/`PHYS_SUBCATS`/`PSY_SUBCATS`, nếu không bài rơi vào rổ "🗂️ Khác" ở cuối mục. Mục `coThu` KHÔNG có subcats — mọi bài `tag:'Cơ thủ'` tự hiện, không cần khai key ở đâu thêm.
  - `PHYS_SUBCATS` nhóm theo **chủ đề**, không theo tag (một nhóm gộp nhiều tag), khác ba mục kia. Bộ lọc mục `phys` vẫn là "mọi tag ngoài các tag có mục riêng", nên `do-kien-thuc.py` khai `PHYS_SUBCATS` với tag `None` để tag mới chưa khai nhóm con vẫn bị kêu.
  - Nút chọn mục (`catbar` trong `KnowledgeView`) dùng class `catbar wrap` (CSS `.catbar.wrap{flex-wrap:wrap;overflow-x:visible}`) — bấm-để-xuống-dòng, KHÔNG phải dải chip kéo ngang như `catbar` trần (vẫn dùng ở `KnowReview`/Training).
  - Trỏ chéo giữa các bài dùng 3 khuôn hợp lệ: `(Xem "tên BÀI".)` · `(Xem "tên GẠCH" trong "tên BÀI".)` · `(Xem bài tập "tên" ở tab Rèn luyện.)`. Tránh dấu ngoặc đơn bên trong cụm `(Xem …)`. **Khuôn `(Xem "tên BÀI".)` giờ bấm được** — `renderKnowText()` (ngay trước `KnowCard`) dò cụm `"..."` khớp đúng `a.title` một bài đang có (bảng tra `KNOW_TITLE_TO_KEY`), biến thành `<span className="klink">` gọi `navToKnowArticle(key)`: bài đang mở (Đọc) nhận ngay qua `_knowNavListeners` (không remount), bài từ Ôn luyện ép `seg='read'` qua `_setKnowSeg` rồi `KnowledgeView` đọc `_knowNavKey` lúc mount. Cụm không khớp tiêu đề nào (tên gạch đầu dòng, tên bài tập ở tab khác) giữ nguyên chữ thường, không link.
  - `KNOW_CARDS` (~4663) tự sinh thẻ ôn luyện từ mọi mục `body` — thêm bài là tab Ôn luyện tự có thẻ, không phải sửa gì.
  - **Bôi đen một đoạn trong bài → lưu thành câu Nhắc nhở** (từ 14/08/2026). `LuuQuoteBar` (ngay trước `KnowCard`) mắc một listener `selectionchange` ở `document`, `docVungChon()` chỉ nhận vùng chọn nằm trong phần tử mang `data-know-key` — hiện đánh dấu ở `.drillB` của `KnowCard` (Đọc) và thẻ lật của `KnowReview` (Ôn luyện). Câu lưu ra đi vào `nc.customcues` đúng khuôn `Cue` đang đọc, thêm trường `src` (tên bài) hiển thị nhỏ dưới thẻ.
    - **Bài `tag:'Cơ thủ'` thì nhãn câu là TÊN CƠ THỦ**, lấy qua `tenCoThu()`: ưu tiên trường `who` nếu bài có khai, không có thì cắt phần trước dấu hai chấm của `title`. ⚠️ **Routine hằng ngày viết bài mới phải giữ khuôn tiêu đề `Tên: mô tả …`**, đổi khuôn thì quote mất tên người nói mà không lỗi nào phát ra — muốn chắc thì khai thẳng `who:'Tên'` trong bài.
    - Ngưỡng chọn: `QUOTE_NGAN`=12 · `QUOTE_DAI`=500 ký tự, ngoài khoảng đó thanh không hiện (chặn cú chạm nhầm và chặn bôi cả bài). Trùng câu đã có thì báo, không lưu thêm.
    - ⚠️ Chạm vào nút Lưu cũng xoá vùng chọn, nên khi vùng chọn rỗng thanh **chờ 600ms rồi mới ẩn** — bỏ nhịp chờ này là nút bấm không ăn trên điện thoại, mà trên máy tính vẫn chạy tốt nên rất dễ tưởng là xong.
  - ⚠️ `data/knowledge.js` (178 KB) là **bản chết**, không được `index.html` hay `sw.js` nạp; đừng sửa nó, cũng đừng lấy làm chuẩn.
- Đồng bộ đám mây: `cloudInit`/`cloudPush`/`cloudApply`/`cloudSnap` (~764–791); `Settings` (~1761) chứa auth + backup.
- 9 theme qua `body.theme-*` (midnight/coffee/court/racing/neon/peach/sage/periwinkle/color) — xem skill `theme-pack`.
- 4 cỡ chữ qua `FONT_SIZES` + `applyFontSize()` (ngay dưới `applyTheme`), ghi vào `document.documentElement.style.fontSize`. **Không đặt class trên `body`** — `applyTheme()` gán đè nguyên `body.className` nên class cỡ chữ để ở đó sẽ bị xoá mỗi lần đổi theme. Cỡ chữ áp ngay lúc nạp mã (trước khi React vẽ) để không nháy một nhịp cỡ mặc định.

## Thư viện (đã pin version)
- react@18.2.0, react-dom@18.2.0, @babel/standalone@7.23.6, @supabase/supabase-js@2.45.4 (tất cả qua cdn.jsdelivr.net).

## Deploy
- Tĩnh, không CI (không có `netlify.toml` / `.github/workflows`). Remote `huyneo1101-dotcom/nhipco`; host phục vụ thẳng thư mục gốc, push `main` là cập nhật. Xem skill `deploy-static` nếu muốn nối CI/CD.

## Skills dùng chung
Repo có `.claude/skills/` (13 skill từ plugin vibe-pwa-kit): bigfile-nav, local-store, data-backup, web-push, pwa-healthcheck, scaffold-vibe-pwa, supabase-sync, deploy-static, theme-pack, lock-static-app, doc-single-file-app, smoke-test, supabase-security-audit.

## Routine tự động (LaunchAgent) — mục Kiến thức > Tâm lý > "Học từ cơ thủ đỉnh cao"
Huy chốt 08/08/2026: mỗi ngày nghiên cứu thêm cơ thủ mới, mỗi tuần rà bổ sung tin mới vào bài
sẵn có. Cả hai chạy **Sonnet** qua `claude -p` headless (rẻ), phần nghiên cứu/phán xét nội
dung giao subagent `nghien-cuu-tam-ly-co-thu` chạy **Opus** (mục 23 CLAUDE.md gốc).

| | Hằng ngày | Hằng tuần |
|---|---|---|
| LaunchAgent | `com.huy.routine-nghien-cuu-co-thu` (19:00) | `com.huy.routine-tong-hop-kien-thuc-co-thu-tuan` (CN 09:30) |
| Wrapper | `routine-nghien-cuu-co-thu.py` | `routine-tong-hop-kien-thuc-co-thu-tuan.py` |
| SKILL.md | `~/.claude/scheduled-tasks/nghien-cuu-co-thu/` | `~/.claude/scheduled-tasks/tong-hop-kien-thuc-co-thu-tuan/` |
| Việc | Viết bài `psy_pro_*` MỚI cho **03 cơ thủ** lấy từ hàng chờ, gộp một commit | Soát các bài `psy_pro_*` đã có, bổ sung `{h,p}` nếu có tin mới thật, đáng kể |

⚠️ **Giờ chạy 19:00 do Huy chốt 14/08/2026** — mốc cũ 07:15 nằm trong cửa sổ hạn mức 5 giờ mà
mốc quét tin 04:30 đã mở, nên hai việc giành hạn mức của nhau. Đổi giờ thì sửa bảng `BANG_LICH`
trong `HeThong/don-lich-routine.py` rồi chạy `--lam`, đừng sửa thẳng plist.

- **Hàng chờ cơ thủ**: `co-thu-nghien-cuu-hang-cho.json` (cùng thư mục) — `hang_cho` rỗng thì
  routine tự bổ sung cơ thủ mới từ BXH công khai, không dừng. Nạp 08/08/2026: **top 50 Fargo
  Rate** (pool 9 bi, đọc từ `fargorate.com/top-ten-lists`), xếp đúng thứ tự hạng. `hang_cho`
  **luôn giữ đủ 50 người** — mỗi người rời hàng chờ thì routine nối thêm một người theo hạng
  kế tiếp. `hang_cho` là mảng **chuỗi tên thuần**, routine lấy phần tử đầu; đừng đổi sang
  object. Bảng hạng 1-60 (kèm tên đúng như FargoRate viết, quốc gia, rating) nằm ở trường
  `bang_xep_hang_fargorate.bang_hang` cùng file, dùng để tra khi tên tiếng Việt hoá không khớp
  nguồn nước ngoài. ⚠️ Trang FargoRate dựng bảng bằng JS — `WebFetch` trả khung rỗng, phải mở
  bằng trình duyệt (`preview_start` + `get_page_text`).
- **Thiếu tư liệu thì nhảy người kế tiếp, trần 03 người một buổi** (Huy chốt 08/08/2026, đổi
  hẳn cách cũ là dừng tới hôm sau). Hạng Fargo không đi kèm độ phủ truyền thông, nên nhóm hạng
  sau có thể vài người liên tiếp không có phỏng vấn tiếng Anh.
- **Nguồn tư liệu tính cả YouTube Shorts** (Huy chốt 08/08/2026) — kênh giải đấu cắt nhiều đoạn
  hỏi-đáp 30-60 giây, thường là chỗ duy nhất có lời cơ thủ ít xuất hiện truyền thông. Trích dẫn
  từ Shorts hợp lệ nhưng phải ghi rõ là Shorts kèm độ dài. Chỉ được kết luận "không đủ tư liệu"
  sau khi đi hết cả 05 đường tìm nguồn trong `agents/nghien-cuu-tam-ly-co-thu.md`.
- **Rào chắn của routine tự-làm** nằm ở mục cuối `SKILL.md`, canh bằng
  `python3 /Users/Huy/Claude/HeThong/soi-skill-tu-lam.py <SKILL.md>` (mã 0 là đủ rào). Sửa
  SKILL thì chạy lại cổng này trong cùng lượt.
- **Hồ sơ đầy đủ** (nguồn, trích dẫn nguyên văn + dịch) nằm ở file `<Tên>-tam-ly-tu-phong-van.md`
  cùng thư mục — bản tóm tắt trong `index.html` phải khớp với bản đầy đủ này khi có bổ sung.
- Điểm chèn bài mới trong `index.html`: neo `{key:'fitness', tag:'Thể lực', ...}` (chèn NGAY
  TRƯỚC nó). Bài mới đặt `tag:'Cơ thủ'` (từ 08/08/2026, KHÔNG còn `tag:'Tâm lý'`) — mục Cơ thủ
  hiển thị phẳng, không có mảng `keys:[...]` con nào cần khai thêm.
- ⛔ **Cấm bịa trích dẫn** — luật số một trong `nghien-cuu-tam-ly-co-thu.md`. Không đủ tư liệu
  công khai thật thì routine bỏ qua cơ thủ đó, ghi vào `khong_du_tu_lieu`, KHÔNG viết hồ sơ giả.

### ⛔ Phụ đề tự động không phải tiếng Anh: không dùng làm nguồn trích dẫn

Đo 14/08/2026 trên 20 video phỏng vấn cơ thủ Philippines: 12 video có mục phụ đề `fil` nhưng
chỉ **02** là nhận dạng gốc đúng tiếng Filipino, còn lại là bản dịch máy từ ngôn ngữ YouTube
nghe nhầm — video Carlo Biado trả về `lang=id&tlang=fil`, cho ra chữ vô nghĩa kiểu "nasira ang
hubbul ng sonokerep". Bản `vi` hỏng y hệt vì dịch từ chính bản sai đó. Dấu hiệu nhận ra bản
dịch máy: URL phụ đề mang tham số `tlang=`, hoặc khoá ngôn ngữ không có bản `<mã>-orig` đi kèm.

Huy chốt cùng ngày: **không đầu tư thêm vào hướng nguồn tiếng Philippines** — đã thử đường tự
nghe lại bằng `mlx_whisper` và bỏ, vì cỡ model `small` chạy 25 phút vẫn chưa xong một video
23,5 phút trên máy M1 8GB. Cơ thủ không có phỏng vấn tiếng Anh thì cứ xếp `khong_du_tu_lieu`
theo quy trình cũ, đừng dựng lại đường nghe lại.

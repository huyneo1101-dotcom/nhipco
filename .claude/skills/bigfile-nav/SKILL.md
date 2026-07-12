---
name: bigfile-nav
description: >-
  Điều hướng và sửa an toàn file index.html khổng lồ (3.000–8.000 dòng, 0.5–1.1MB) trong các
  app một-file React+Babel không build. Dùng khi mở bất kỳ app nào (nhipco, just-us, poolmate,
  vinha-web, huongdien-work) để sửa/thêm tính năng — tránh đọc cả file, tránh làm vỡ Babel.
  Kích hoạt khi người dùng nói "sửa app", "thêm tính năng", "tìm hàm", "file quá to".
---

# Skill: BigFile Nav

Các app trong hệ sinh thái này nhồi TOÀN BỘ (UI + logic + CSS + dữ liệu) vào 1 `index.html`.
Kích thước thực tế: just-us 7.977 dòng/1.1MB, poolmate 5.795 dòng, nhipco 4.973 dòng, vinha-web
3.989 dòng, huongdien-work 2.895 dòng. Đọc cả file vừa tốn context vừa dễ lạc. Skill này là quy
tắc làm việc với file lớn không build.

## Quy tắc vàng
1. **KHÔNG đọc cả `index.html`.** Luôn `grep -n` để định vị dòng, chỉ Read cửa sổ ±40 dòng
   quanh vị trí cần sửa.
2. **Grep trước, sửa sau.** Xác định đúng 1 vị trí bằng chuỗi duy nhất trước khi Edit.
3. **Sửa theo neo duy nhất.** Edit yêu cầu `old_string` khớp duy nhất — với file lớn, lấy neo
   dài (kèm tên hàm/biến) để không đụng nhầm chỗ khác. Nếu chuỗi lặp, dùng thêm ngữ cảnh dòng
   trên/dưới.
4. **Không build = lỗi cú pháp là lỗi runtime câm.** Babel Standalone transpile trong trình
   duyệt; sai JSX/JS không báo ở terminal mà chỉ trắng màn hình. Sau mỗi sửa lớn, chạy kiểm tra
   cú pháp (xem cuối skill).

## Bản đồ hoá file trước khi sửa
```bash
# 1. Xem cấu trúc tổng thể: các component & hàm top-level
grep -nE "^(function|const) [A-Z][A-Za-z0-9]+ *[=(]" index.html   # component React (PascalCase)
grep -nE "^(function|const) [a-z][A-Za-z0-9]+ *[=(]" index.html   # hàm thường (camelCase)

# 2. Ranh giới các "tab"/màn hình (thường là component lớn)
grep -nE "className=\"(tab|screen|view|page)" index.html | head

# 3. Định vị 1 tính năng theo từ khoá tiếng Việt trên UI
grep -n "Nhật ký\|Luyện tập\|Thống kê" index.html   # ví dụ — thay bằng nhãn thật trên app
```

## Quy trình sửa 1 tính năng
1. `grep -n "<nhãn UI hoặc tên hàm>"` → ra số dòng.
2. Read cửa sổ quanh đó (offset = dòng-20, limit = 60) để hiểu ngữ cảnh + JSX cha.
3. Nếu cần hiểu 1 hàm được gọi, grep tên hàm đó để nhảy tới định nghĩa — KHÔNG cuộn cả file.
4. Edit bằng neo duy nhất. Với JSX: giữ cân bằng thẻ đóng/mở và ngoặc `{}`.
5. Nếu thêm component/hàm mới: chèn NGAY TRƯỚC component `App` chính hoặc cạnh hàm cùng nhóm
   (grep để tìm vị trí nhóm), không nhét bừa cuối file.

## Chèn/đổi CSS
CSS nằm trong 1 khối `<style>` ở `<head>`. Grep tên class hoặc biến (`--gold`, `.card`) để tới
đúng chỗ; thêm rule mới cạnh nhóm liên quan. Biến theme: xem skill `theme-pack`.

## Kiểm tra cú pháp sau khi sửa (không cần trình duyệt)
```bash
# Trích khối JSX/JS trong <script type="text/babel"> và thử transpile bằng babel nếu có node.
# Cách nhẹ nhất không cần cài gì: đếm cân bằng ngoặc trên vùng vừa sửa.
node -e "const s=require('fs').readFileSync('index.html','utf8'); \
  for(const [c,o] of [['(',')'],['{','}'],['[',']']]){ \
  const a=(s.split(c).length-1), b=(s.split(o).length-1); \
  console.log(c,o, a===b?'OK':('LỆCH '+a+' vs '+b)); }"
```
Lệ thuộc đếm ngoặc chỉ bắt lỗi thô; với sửa lớn, tốt nhất mở app thật trên trình duyệt (skill
`run` nếu có, hoặc serve tĩnh) và xem Console. Trắng màn hình + lỗi đỏ trong Console = JSX/JS vỡ.

## Sau khi sửa
- Nếu đổi nội dung đáng kể: nhắc bump `CACHE` trong `sw.js` (xem `pwa-healthcheck`) để client
  nhận bản mới.
- Nếu app có đồng bộ Supabase theo khối `SYNC_KEYS`/tiền tố khoá (vd `nc.`): kiểm tra tính năng
  mới có cần thêm khoá localStorage vào danh sách đồng bộ không (xem `local-store`).

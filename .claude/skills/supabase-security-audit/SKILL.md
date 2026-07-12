---
name: supabase-security-audit
description: >-
  Soát bảo mật phần Supabase của app tĩnh: không lỡ commit service_role/secret key, chỉ dùng
  anon/publishable key, RLS đã bật trên mọi bảng, không commit dump dữ liệu người dùng. Dùng
  trước khi public repo, sau khi thêm/sửa Supabase, hoặc khi người dùng nói "kiểm tra bảo mật",
  "audit supabase", "có lộ key không". Thuần grep — chạy được mọi nơi, không cần mạng.
---

# Skill: Supabase Security Audit

Bạn tự dựng Supabase 3 kiểu khác nhau (tài khoản đầy đủ / ghép cặp mã mời / mã sync) trên nhiều
app, mỗi app tự viết → dễ sót bảo mật. `supabase-sync` mới *nhắc*; skill này *kiểm* thật. Vì repo
là **public**, một lỗi (lộ service_role key, quên bật RLS) là toàn bộ dữ liệu người dùng bị đọc/ghi.

## Kiểm 1 — KHÔNG lộ key bí mật (nghiêm trọng nhất)
```bash
cd <repo>
grep -rnE "service_role|sb_secret_|SUPABASE_SERVICE|serviceRole" . --include=*.html --include=*.js --include=*.json --include=*.sql 2>/dev/null
# JWT service_role thường có payload chứa "role":"service_role" (base64) — quét thô:
grep -rnoE "eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+" . --include=*.html --include=*.js 2>/dev/null | head
```
- ❌ **Bất kỳ** `service_role`/`sb_secret_` nào xuất hiện = SỰ CỐ. Key này bỏ qua RLS, ai có là
  toàn quyền DB. Phải: xoá khỏi code, **rotate key ngay trên Supabase dashboard** (key đã lộ coi
  như cháy vĩnh viễn kể cả sau khi xoá commit, vì git history còn lưu).
- Nếu thấy chuỗi JWT: giải base64 phần payload (`echo <giữa 2 dấu chấm> | base64 -d`) xem `role`.
  `anon` → an toàn (public theo thiết kế). `service_role` → sự cố như trên.

## Kiểm 2 — Chỉ dùng anon / publishable key
```bash
grep -nE "SB_KEY|supabaseKey|createClient\(" <index.html hoặc file chứa client>
```
- ✅ Đúng: key dạng `sb_publishable_...` (mới) hoặc JWT role `anon` (cũ). Cả hai PUBLIC theo thiết
  kế Supabase — lộ ra không sao **miễn RLS đúng** (xem Kiểm 3). Ví dụ nhipco dùng
  `sb_publishable_...` là chuẩn.
- Xác nhận `SB_URL` + `SB_KEY` là thứ DUY NHẤT về Supabase nhúng trong client; không có key thứ 2.

## Kiểm 3 — RLS đã bật trên MỌI bảng
RLS là lớp bảo vệ thật (không phải việc giấu anon key). Supabase **mặc định KHÔNG bật RLS cho
bảng mới** → rất dễ quên, và khi quên thì anon key đọc/ghi được toàn bộ bảng.
```bash
# Nếu repo có tài liệu schema (nên có — xem supabase-sync):
SQL=$(ls docs/supabase-setup.sql supabase*.sql 2>/dev/null | head -1)
if [ -n "$SQL" ]; then
  echo "-- bảng khai báo:"; grep -oE "create table [a-z_.\"]+" "$SQL"
  echo "-- bảng có bật RLS:"; grep -oE "enable row level security" "$SQL" | wc -l
  echo "-- policy khai báo:"; grep -cE "create policy" "$SQL"
fi
```
- Đối chiếu: **số `create table` = số `enable row level security`**, và mỗi bảng có ≥1 `create
  policy`. Thiếu = ⚠️ bảng đó có thể đang mở toang.
- Nếu repo KHÔNG có file SQL: **không kiểm được RLS từ code** (RLS sống ở Supabase, không ở
  client). Báo rõ: "phải kiểm tay trên dashboard → Authentication → Policies; và nên lưu schema
  vào `docs/supabase-setup.sql` (xem `supabase-sync`) để lần sau audit được".
- Đặc thù pattern C (mã sync, như huongdien-work): policy kiểu `using (true)` là CỐ Ý (ai có mã là
  đọc/ghi được) — KHÔNG phải lỗi, nhưng nhắc người dùng: bảo mật = độ khó đoán của mã, chỉ hợp dữ
  liệu không nhạy cảm.

## Kiểm 4 — Không commit dữ liệu người dùng
```bash
git ls-files | grep -iE "backup.*\.json|dump|export.*\.json|\.env"
cat .gitignore 2>/dev/null
```
- ❌ Nếu có file dump/backup JSON dữ liệu thật bị track → gỡ khỏi git (`git rm --cached`) và thêm
  vào `.gitignore`. (just-us, huongdien-work đã chặn đúng bằng `.gitignore` — kiểm để chắc.)
- Không có `.env` hay file chứa secret nào bị commit.

## Báo cáo
Xếp theo mức độ: Kiểm 1 (lộ secret key) ưu tiên tuyệt đối. Mỗi mục ✅/⚠️/❌ + cách sửa. Nếu ❌
Kiểm 1: nhấn mạnh **rotate key ngay**, không chỉ xoá commit. Nếu không có file SQL: nêu rõ RLS
CHƯA kiểm được và cần xác nhận tay trên dashboard.

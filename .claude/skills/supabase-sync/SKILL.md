---
name: supabase-sync
description: >-
  Gắn Supabase (auth + đồng bộ dữ liệu) vào app tĩnh một-file theo 1 trong 3 pattern đã dùng
  trong hệ sinh thái app này (tài khoản email/password đầy đủ như nhipco, ghép cặp bằng mã mời
  như just-us, hoặc đồng bộ bằng mã sync không cần tài khoản như huongdien-work). Dùng khi
  người dùng nói "thêm đăng nhập", "đồng bộ nhiều máy", "lưu lên cloud", "thêm Supabase".
---

# Skill: Supabase Sync

Bạn đã tự phát minh lại 3 kiểu tích hợp Supabase khác nhau ở 3 app khác nhau. Skill này giúp
CHỌN đúng kiểu ngay từ đầu thay vì mỗi app viết lại từ số 0, và cung cấp SQL/RLS mẫu.

## Bước 0 — Chọn pattern (hỏi người dùng nếu chưa rõ)

| Pattern | Dùng khi | Ví dụ đã có | Độ phức tạp |
|---|---|---|---|
| **A. Tài khoản đầy đủ** | App nhiều người dùng độc lập, mỗi người 1 tài khoản, dữ liệu riêng | nhipco (CueZen) | Trung bình |
| **B. Ghép cặp bằng mã mời** | App chỉ dành cho 2 người cụ thể (vd cặp đôi), cần chia sẻ dữ liệu song song | just-us | Cao hơn (RLS 2 chiều) |
| **C. Mã đồng bộ không cần tài khoản** | Chỉ cần backup/đồng bộ nhiều máy của CHÍNH 1 người, không cần đăng nhập thật | huongdien-work | Thấp nhất |

Nếu app chỉ cần 1 người dùng đồng bộ 2-3 thiết bị và không quan tâm bảo mật cao → ưu tiên
**Pattern C** (ít code nhất, không cần trang quên-mật-khẩu/email xác nhận).

## Bước 1 — Tạo project Supabase + biến kết nối
Lấy `Project URL` và `anon public key` từ Settings → API. Cả hai đều PUBLIC theo thiết kế của
Supabase (bảo mật thật nằm ở RLS, không phải ở việc giấu 2 giá trị này) — gắn thẳng vào
`index.html`:
```js
const SB_URL='https://<project-ref>.supabase.co';
const SB_KEY='<anon-public-key>';
let sbc=null;
try{ if(window.supabase&&window.supabase.createClient) sbc=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true}}); }catch(e){}
```
(Đây đúng dòng code nhipco đang dùng ở `index.html` — tái dùng nguyên văn.)

## Pattern A — Tài khoản đầy đủ (theo nhipco)
```js
async function cloudSignIn(email,pass){ const {data,error}=await sbc.auth.signInWithPassword({email,password:pass}); if(error) throw error; return data; }
async function cloudSignUp(email,pass){ const {data,error}=await sbc.auth.signUp({email,password:pass}); if(error) throw error; return data; }
async function cloudSignOut(){ try{ await sbc.auth.signOut(); }catch(e){} localStorage.removeItem('<app>._syncAt'); }
```
Khi mount: gọi `sbc.auth.getSession()` để khôi phục phiên, `sbc.auth.onAuthStateChange(...)` để
theo dõi. Bảng dữ liệu: RLS `USING (auth.uid() = user_id)` cho mọi bảng cá nhân.

## Pattern B — Ghép cặp bằng mã mời (theo just-us)
- Bảng `pairs` (2 `user_id`, `invite_code` random 6-8 ký tự, `paired_at`).
- Khi user A tạo mã mời → lưu `invite_code` chờ user B nhập đúng mã để nối `pair_id`.
- Mọi bảng dữ liệu chia sẻ có cột `pair_id`; RLS:
```sql
create policy "chỉ 2 người trong pair" on <table>
  using (pair_id in (select id from pairs where user_id1 = auth.uid() or user_id2 = auth.uid()));
```
- Cần rõ: 1 pair chỉ tối đa 2 người, chặn người thứ 3 nhập mã mời khi pair đã đủ.

## Pattern C — Mã đồng bộ không cần tài khoản (theo huongdien-work)
Không dùng Supabase Auth thật — chỉ dùng 1 bảng lưu blob JSON theo `sync_code` do người dùng tự
đặt/tạo random:
```sql
create table sync_blobs (
  sync_code text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
-- RLS: cho phép đọc/ghi công khai theo đúng sync_code (bảo mật = độ khó đoán của mã, KHÔNG mạnh
-- bằng RLS theo user thật — CẢNH BÁO rõ với người dùng nếu dữ liệu nhạy cảm).
alter table sync_blobs enable row level security;
create policy "anyone with the code" on sync_blobs for all using (true) with check (true);
```
```js
async function pushSync(code, data){ await sbc.from('sync_blobs').upsert({sync_code:code, data, updated_at:new Date().toISOString()}); }
async function pullSync(code){ const {data}=await sbc.from('sync_blobs').select('data').eq('sync_code',code).maybeSingle(); return data?.data; }
```
**LUÔN cảnh báo người dùng** pattern C không có xác thực thật — ai có mã là đọc/ghi được, chỉ
phù hợp với dữ liệu không nhạy cảm hoặc mã đủ dài/khó đoán.

## Bước cuối — luôn làm bất kể pattern nào
- Bật RLS (`enable row level security`) trên MỌI bảng trước khi đi vào sử dụng thật — mặc định
  Supabase cho bảng mới KHÔNG có RLS, dễ quên.
- Bọc mọi gọi `sbc.*` trong try/catch, không để lỗi mạng làm app tĩnh crash — app phải chạy được
  ở chế độ offline/localStorage-only khi không có mạng hoặc Supabase down.
- Ghi lại schema (bảng + RLS) vào 1 file `docs/supabase-setup.sql` trong repo (như
  diem-tin-the-gioi đã làm) để lần sau setup lại project mới không phải nhớ lại từ đầu.

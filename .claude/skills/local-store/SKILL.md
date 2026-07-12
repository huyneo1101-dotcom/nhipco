---
name: local-store
description: >-
  Chuẩn hoá lớp localStorage cho app một-file: helper get/set an toàn (try/catch + fallback bộ
  nhớ), tiền tố khoá nhất quán, và QUAN TRỌNG NHẤT là versioning + migration để đổi cấu trúc dữ
  liệu mà không mất data người dùng cũ. Dùng khi thêm/đổi trường dữ liệu, gặp lỗi "dữ liệu cũ
  hỏng sau update", hoặc khi người dùng nói "lưu dữ liệu", "đổi cấu trúc data", "migration".
---

# Skill: Local Store

Cả 8 app dùng localStorage rất dày (nhipco 20 chỗ, huongdien-work 14, just-us/diem-tin 10...)
NHƯNG gần như KHÔNG có migration schema. Đây là rủi ro có thật: mỗi khi bạn đổi hình dạng một
mảng/object đã lưu, dữ liệu cũ của người dùng có thể vỡ hoặc bị ghi đè khi app đọc vào. Skill
này khoá lại 2 việc: (1) helper truy cập an toàn, (2) migration có version.

## Phần 1 — Helper get/set an toàn (pattern nhipco đang dùng)
nhipco đã có sẵn helper tốt, tái dùng nguyên tắc này cho mọi app:
```js
let mem = {}; // fallback khi localStorage bị chặn (private mode/quota)
const store = {
  get(k, d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }
             catch(e){ return k in mem ? mem[k] : d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ mem[k]=v; } }
};
```
Nguyên tắc:
- LUÔN bọc try/catch — localStorage ném lỗi khi hết quota hoặc bị chặn.
- LUÔN có giá trị mặc định `d` khi khoá chưa tồn tại.
- **Tiền tố khoá nhất quán** cho từng app (`nc.` ở nhipco, `ju.` ở just-us, `ct.`/`pm.` ở
  poolmate, ` hd.` ở huongdien-work). Giữ đúng tiền tố để đồng bộ Supabase (`SYNC_KEYS`) và
  export/backup lọc đúng khoá.

## Phần 2 — Versioning + migration (phần đang THIẾU)
Thêm 1 khoá version schema và chạy migration MỘT LẦN lúc khởi động, TRƯỚC khi app đọc dữ liệu:
```js
const SCHEMA_VERSION = 3;                 // tăng mỗi lần đổi cấu trúc dữ liệu
const VKEY = 'nc._schema';                // đổi tiền tố theo app

function runMigrations(){
  let v = store.get(VKEY, 0);
  if (v === SCHEMA_VERSION) return;

  // Mỗi bước nâng đúng 1 version, không nhảy cóc — an toàn khi user lâu không mở app.
  if (v < 1){ /* v0→v1: ví dụ đổi 'matches' từ mảng phẳng sang {items:[]} */
    const old = store.get('nc.matches', null);
    if (Array.isArray(old)) store.set('nc.matches', { items: old });
    v = 1;
  }
  if (v < 2){ /* v1→v2: thêm trường mặc định 'note' cho từng drill */
    const d = store.get('nc.customDrills', []);
    store.set('nc.customDrills', d.map(x => ({ note:'', ...x })));
    v = 2;
  }
  if (v < 3){ /* v2→v3: đổi tên khoá cũ */
    const old = store.get('nc.oldKey', null);
    if (old != null){ store.set('nc.newKey', old); localStorage.removeItem('nc.oldKey'); }
    v = 3;
  }

  store.set(VKEY, SCHEMA_VERSION);
}
runMigrations(); // gọi 1 lần, sớm nhất có thể (trước khi render App)
```

## Nguyên tắc migration bắt buộc
- **Idempotent**: chạy 2 lần không hỏng (check kiểu dữ liệu trước khi biến đổi, như
  `Array.isArray(old)` ở trên).
- **Nâng từng bước** (`if v<1`, `if v<2`...), KHÔNG gộp — user mở app sau nhiều tháng có thể ở
  version rất cũ.
- **Không xoá dữ liệu cũ vội**: giữ khoá cũ đến khi chắc chắn đã chuyển xong; chỉ `removeItem`
  ở cuối một bước đã copy thành công.
- **Đồng bộ với cloud**: nếu app dùng Supabase (`cloudApply`/`SYNC_KEYS` như nhipco), chạy
  `runMigrations()` cả SAU khi kéo dữ liệu từ mây về (dữ liệu mây có thể ở version cũ hơn máy).

## Khi thêm 1 khoá localStorage mới cho tính năng mới
1. Đặt tên `<tiềntố>.<tên>` đúng quy ước app.
2. Nếu dữ liệu cần đồng bộ nhiều máy → thêm khoá vào mảng `SYNC_KEYS`/danh sách `cloudHasLocal`.
3. Nếu cần xuất khi backup → đảm bảo khoá nằm trong danh sách `KEYS` của hàm export (xem
   `data-backup`).
4. Nếu cấu trúc có thể đổi về sau → cân nhắc bump `SCHEMA_VERSION` ngay khi hình dạng chưa ổn
   định.

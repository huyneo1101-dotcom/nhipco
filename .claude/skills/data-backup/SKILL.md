---
name: data-backup
description: >-
  Thêm/chuẩn hoá tính năng xuất & nhập dữ liệu (backup/restore JSON) cho app một-file lưu bằng
  localStorage — theo đúng pattern nhipco/just-us đang dùng (Blob + createObjectURL để tải,
  FileReader để nạp lại). Dùng khi người dùng nói "sao lưu dữ liệu", "xuất/nhập dữ liệu",
  "backup", "chuyển dữ liệu sang máy khác", "khôi phục".
---

# Skill: Data Backup

6/8 app (nhipco, just-us, poolmate, vinha-web, huongdien-work, diem-tin) đã tự viết export/import
mỗi app một kiểu. Skill này chốt 1 chuẩn nhất quán, có phiên bản (`version`) để tương thích ngược,
và cảnh báo ghi đè khi khôi phục.

## Định dạng file backup chuẩn (theo nhipco)
```json
{
  "app": "nhipco",
  "version": 1,
  "exportedAt": "2026-07-12",
  "data": { "nc.matches": "...", "nc.training": "...", "...": "..." }
}
```
- `app`: định danh app để nhập nhầm file app khác thì chặn.
- `version`: khớp `SCHEMA_VERSION` (xem `local-store`) — khi nhập file cũ, chạy migration.
- `data`: map khoá→giá trị localStorage (giữ nguyên chuỗi JSON đã stringify).

## Xuất (export) — pattern nhipco lines 1799–1800
```js
function exportData(){
  const KEYS = SYNC_KEYS; // hoặc liệt kê tường minh các khoá cần backup, đúng tiền tố app
  const data = {};
  KEYS.forEach(k => { const v = localStorage.getItem(k); if (v != null) data[k] = v; });
  const dump = { app: 'nhipco', version: SCHEMA_VERSION, exportedAt: todayStr(), data };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nhipco-backup-' + todayStr() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 600);
}
```

## Nhập (import) — pattern nhipco lines 1811–1816
```js
function importData(file){
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (obj.app && obj.app !== 'nhipco'){ alert('File backup của app khác — không nhập.'); return; }
      if (!window.confirm('Khôi phục sẽ GHI ĐÈ dữ liệu hiện tại trên máy này. Tiếp tục?')) return;
      const data = (obj && obj.data) ? obj.data : obj; // chấp nhận cả file cũ dạng phẳng
      Object.keys(data).forEach(k =>
        localStorage.setItem(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k])));
      if (typeof runMigrations === 'function') runMigrations(); // nâng version nếu file cũ
      location.reload();
    } catch(e){ alert('File không hợp lệ: ' + ((e && e.message) || e)); }
  };
  r.readAsText(file);
}
```
Gắn với input file: `<input type="file" accept="application/json" onChange={e=>importData(e.target.files[0])}/>`

## Nguyên tắc bắt buộc
- **LUÔN xác nhận trước khi ghi đè** — khôi phục là thao tác phá huỷ. Dùng `window.confirm` như
  nhipco (dòng 781) đã làm cho luồng đồng bộ.
- **Chặn nhập nhầm app khác** bằng field `app`.
- **Tương thích ngược**: chấp nhận cả file cũ không có bọc `{app,version,data}` (lấy `obj.data ||
  obj`), rồi chạy `runMigrations()`.
- **Chỉ backup khoá thật của app** (đúng tiền tố), đừng dump cả localStorage — tránh lẫn khoá
  của thư viện/khoá `_syncAt`.

## Các kiểu xuất khác đã có trong hệ app (tham khảo, không bắt buộc gộp)
- just-us xuất `.docx` (quy tắc gia đình, lịch sinh hoạt) và `.ics` (sự kiện/sinh nhật) — nếu
  app cần xuất để IN hoặc thêm vào lịch, tái dùng pattern `exportDocx`/Blob `text/calendar` của
  just-us thay vì JSON.
- Với dữ liệu cần chia sẻ nhiều máy tự động (không phải file thủ công), dùng `supabase-sync`.

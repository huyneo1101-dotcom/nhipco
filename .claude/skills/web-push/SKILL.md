---
name: web-push
description: >-
  Gắn thông báo web (xin quyền, hiện thông báo qua service worker) và nhắc nhở/digest cho app
  một-file PWA — theo đúng pattern just-us (nhắc lịch trong ngày + digest hằng ngày qua
  periodicSync) và poolmate/huongdien-work. Dùng khi người dùng nói "thêm thông báo", "nhắc
  nhở", "báo hằng ngày", "notification", "reminder".
---

# Skill: Web Push

6/8 app chạm tới Notification nhưng mỗi app một kiểu và hay quên fallback. Skill này chốt luồng
chuẩn: xin quyền đúng cách, hiện thông báo qua service worker (bền hơn `new Notification`), và
2 kiểu nhắc phổ biến — nhắc theo giờ trong ngày và digest hằng ngày.

## Quan trọng: phân biệt 2 loại
- **Thông báo cục bộ (local)**: app tự đặt lịch và tự gọi `showNotification` khi đang mở/khi SW
  chạy. KHÔNG cần server, KHÔNG cần VAPID. Đây là thứ hầu hết app này thực sự cần (nhắc lịch,
  nhắc thói quen, digest). Ưu tiên loại này.
- **Push thật (server → thiết bị khi app đóng)**: cần `pushManager.subscribe` + VAPID key +
  server đẩy. poolmate mới để STUB (`pushSubscribe`) chứ chưa có server. CHỈ làm khi thật sự cần
  đẩy lúc app đóng và bạn có backend — nếu không, đừng thêm phức tạp thừa.

## Bước 1 — Xin quyền (đúng thời điểm, có fallback)
Xin quyền SAU một hành động của người dùng (bấm nút "Bật nhắc nhở"), KHÔNG xin ngay khi mở app
(bị trình duyệt phạt/ẩn). Pattern just-us:
```js
const supported = 'Notification' in window && 'serviceWorker' in navigator;
async function enableNotif(){
  if (!supported){ flash('Máy không hỗ trợ thông báo'); return; }
  let p = Notification.permission;
  if (p !== 'granted'){ try{ p = await Notification.requestPermission(); }catch(_){} }
  if (p === 'granted'){
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Đã bật thông báo 🔔', { body:'Sẽ nhắc bạn đúng lúc.', icon:'icon.svg', badge:'icon.svg' });
    store.set('<app>.notifOn', true);
  }
}
```

## Bước 2 — Hiện thông báo (qua SW, có fallback)
LUÔN ưu tiên `registration.showNotification` (chạy cả khi tab nền), fallback `new Notification`:
```js
function notify(title, opts){
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.ready
      .then(reg => { try{ reg.showNotification(title, opts); }catch(e){ try{ new Notification(title, opts); }catch(_){} } })
      .catch(() => { try{ new Notification(title, opts); }catch(e){} });
  } else { try{ new Notification(title, opts); }catch(e){} }
}
```
Dùng `tag` để chống trùng (mỗi mốc nhắc 1 tag duy nhất theo ngày, như just-us:
`tag:'ju-rt-'+today+'-'+b.id`) và `data:{url:'./'}` để bấm vào mở app.

## Bước 3a — Nhắc theo giờ trong ngày (pattern just-us)
Duyệt danh sách mốc giờ, so với giờ hiện tại, bắn thông báo 1 lần/ngày cho mốc vừa tới:
```js
function checkReminders(){
  const now = new Date(); const nm = now.getHours()*60 + now.getMinutes();
  const today = todayStr();
  const rlog = store.get('<app>.rlog', { day: today, fired: {} });
  if (rlog.day !== today){ rlog.day = today; rlog.fired = {}; } // reset mỗi ngày
  (store.get('<app>.routine', []) || []).forEach(b => {
    if (!b || !b.remind) return;
    const [h,m] = (b.t||'').split(':'); const bm = (+h)*60 + (+m);
    const diff = nm - bm;
    if (diff >= 0 && diff < 25 && !rlog.fired[b.id]){   // trong cửa sổ 25 phút, chưa bắn
      notify('🗓️ ' + b.t + ' — ' + (b.act||''), { body:b.act, icon:'icon.svg', tag:'rt-'+today+'-'+b.id });
      rlog.fired[b.id] = 1;
    }
  });
  store.set('<app>.rlog', rlog);
}
// Gọi định kỳ khi app mở: setInterval(checkReminders, 60000); và 1 lần lúc khởi động.
```

## Bước 3b — Digest hằng ngày qua periodicSync (tuỳ chọn, pattern just-us)
Cho phép SW tự tổng hợp & nhắc 1 lần/ngày kể cả app không mở (chỉ Chrome Android + đã cài PWA):
```js
// Trong app, sau khi có quyền:
const reg = await navigator.serviceWorker.ready;
if ('periodicSync' in reg){
  try{
    const st = await navigator.permissions.query({ name:'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('daily', { minInterval: 12*60*60*1000 });
  }catch(_){}
}
```
```js
// Trong sw.js:
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'daily'){ e.waitUntil(self.registration.showNotification('Tổng kết hôm nay', { body:'...', icon:'icon.svg', tag:'daily' })); }
});
```
Lưu ý rõ với người dùng: periodicSync KHÔNG chạy trên iOS và chỉ hoạt động khi PWA đã được cài,
tần suất do trình duyệt quyết định — không đảm bảo đúng giờ. Đừng hứa "đúng 7h sáng".

## Kiểm tra sau khi thêm
- Nút "Thử thông báo" để test nhanh (như just-us hàm `test`).
- Chạy `pwa-healthcheck`: xác nhận `sw.js` có handler `periodicsync`/`notificationclick` nếu đã
  dùng, và `icon.svg`/`badge` trỏ file thật.

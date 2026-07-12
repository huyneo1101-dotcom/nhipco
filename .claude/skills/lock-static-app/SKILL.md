---
name: lock-static-app
description: >-
  Khoá một app tĩnh bằng mật khẩu + mã hoá AES-256-GCM/PBKDF2 phía client, theo đúng kỹ thuật
  đã dùng ở saban-app — dùng cho app riêng tư không muốn nội dung đọc được kể cả khi source
  public trên GitHub. Dùng khi người dùng nói "khoá app bằng mật khẩu", "mã hoá nội dung",
  "app riêng tư không cho ai đọc được kể cả nhìn source".
---

# Skill: Lock Static App

Kỹ thuật này phù hợp khi repo phải PUBLIC (vd để dùng GitHub Pages free) nhưng nội dung thật
không được lộ trong source. Giải pháp: mã hoá toàn bộ nội dung app thành 1 blob ciphertext nhúng
trong `index.html`; chỉ giải mã ở trình duyệt sau khi nhập đúng mật khẩu. Nhược điểm cần nói rõ
với người dùng: đây KHÔNG chống được brute-force offline nếu ai đó tải file về và thử mật khẩu
ngoại tuyến — chỉ chống được việc đọc lướt qua trên GitHub, không phải mã hoá cấp bảo mật cao.

## Kiến trúc
1. **File nguồn thật** (`app-source.html` hoặc tương tự, KHÔNG commit dạng plaintext) — nội
   dung app đầy đủ như bình thường.
2. **Script build** mã hoá file nguồn → ciphertext base64, nhúng vào `index.html` publish được.
3. **`index.html` publish**: chỉ chứa màn hình nhập mật khẩu (plaintext) + blob mã hoá + logic
   giải mã bằng WebCrypto. Khi đúng mật khẩu → giải mã → `document.write()` nội dung thật.

## Bước 1 — Hàm mã hoá (chạy 1 lần lúc build, KHÔNG chạy trong app publish)
```js
// build-encrypt.js — chạy bằng `node build-encrypt.js "mat-khau" app-source.html index.html
const crypto = require('crypto');
const fs = require('fs');

const [,, password, srcFile, outFile] = process.argv;
const plaintext = fs.readFileSync(srcFile, 'utf8');

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const payload = {
  ct: Buffer.concat([ct, tag]).toString('base64'),
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
};
// Nhúng payload vào template index.html khoá (xem Bước 2), rồi ghi ra outFile.
```
Dùng PBKDF2 **200,000 vòng lặp** (đúng số saban-app đang dùng) — đủ chậm để cản brute-force cơ
bản mà vẫn giải mã nhanh trên trình duyệt thật.

## Bước 2 — Template `index.html` publish (màn khoá + giải mã WebCrypto)
```html
<script>
const D = { ct: "<base64 ct+tag>", salt: "<base64 salt>", iv: "<base64 iv>" };

async function tryUnlock(password){
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(D.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(D.iv), c => c.charCodeAt(0));
  const ctBytes = Uint8Array.from(atob(D.ct), c => c.charCodeAt(0));

  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );

  try {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ctBytes);
    const html = new TextDecoder().decode(plainBuf);
    localStorage.setItem('_sbk', password); // nhớ mật khẩu để tự mở khoá lần sau — bỏ dòng
                                             // này nếu người dùng không muốn "nhớ đăng nhập"
    document.open(); document.write(html); document.close();
  } catch (e) {
    document.getElementById('err').textContent = 'Sai mật khẩu';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('_sbk');
  if (saved) tryUnlock(saved);
});
</script>
<div id="gate">
  <input id="pw" type="password" placeholder="Mật khẩu">
  <button onclick="tryUnlock(document.getElementById('pw').value)">Mở khoá</button>
  <div id="err"></div>
</div>
```

## Bước 3 — Quy trình cập nhật nội dung sau này
1. Sửa nội dung ở `app-source.html` (file nguồn plaintext, để trong `.gitignore` HOẶC giữ ở máy
   local, KHÔNG commit).
2. Chạy `node build-encrypt.js "<mật-khẩu>" app-source.html index.html`.
3. Commit + push chỉ `index.html` (đã mã hoá).
- **Cảnh báo rõ với người dùng mỗi lần**: nếu đổi mật khẩu, mọi client đã lưu `_sbk` cũ trong
  `localStorage` sẽ tự động thử sai và hiện lỗi — cần họ nhập lại mật khẩu mới thủ công 1 lần.

## Khi KHÔNG nên dùng skill này
- App không thật sự cần giấu nội dung khỏi người xem source (đa số app trong hệ sinh thái này
  không cần) — đừng đề xuất mã hoá mặc định, chỉ dùng khi người dùng chủ động muốn "riêng tư kể
  cả với ai đọc được GitHub public repo".
- Không thay thế cho xác thực thật (Supabase Auth) khi cần phân quyền nhiều người dùng khác
  nhau — dùng `supabase-sync` cho trường hợp đó.

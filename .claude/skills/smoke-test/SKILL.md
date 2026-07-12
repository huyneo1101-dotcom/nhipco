---
name: smoke-test
description: >-
  Kiểm tra nhanh app một-file còn render được không sau khi sửa — bắt lỗi "trắng màn hình" do
  Babel/JSX vỡ (loại lỗi câm không hiện ở terminal). Tự dò môi trường: mạng mở thì render thật
  bằng headless Chromium; mạng chặn CDN thì lùi về kiểm tra tĩnh. Dùng sau khi sửa `index.html`,
  trước khi commit, hoặc khi người dùng nói "app còn chạy không", "test app", "smoke test".
---

# Skill: Smoke Test

`bigfile-nav` cảnh báo: sửa `index.html` gây lỗi JSX/JS là **trắng màn hình câm** — Babel
transpile trong trình duyệt, lỗi không hiện ở terminal. Skill này là bước kiểm cuối để bắt lỗi đó.

## ⚠️ Giới hạn môi trường (ĐÃ KIỂM CHỨNG)
Các app này load React/Babel/Supabase từ **jsdelivr CDN**. Trong **Claude Code bản web/sandbox,
outbound tới jsdelivr bị CHẶN** (curl trả 403) → headless không tải được thư viện → app không
render dù code ĐÚNG. Nên:
- **Render thật chỉ chạy được nơi mạng mở** (desktop/CLI của bạn), hoặc app đã vendor thư viện về local.
- Trong sandbox: skill tự lùi về **kiểm tra tĩnh** (không cần mạng/trình duyệt).

## Bước 0 — Dò môi trường
```bash
curl -sS -o /dev/null -w "%{http_code}" --max-time 8 https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js 2>/dev/null
```
- HTTP `200` → **Chế độ A (render thật)**.
- `000`/`403`/timeout → **Chế độ B (kiểm tra tĩnh)**. Báo rõ với người dùng: "sandbox chặn CDN,
  chỉ kiểm tĩnh được; chạy render thật trên máy local".

## Chế độ A — Render thật (mạng mở)
```bash
cd <repo>
CHROME=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)
[ -z "$CHROME" ] && CHROME=$(command -v chromium || command -v google-chrome)
# Tìm ĐÚNG id điểm mount React (mỗi app khác nhau: root, app, ...), KHÔNG giả định 'root'
MID=$(grep -oE "createRoot\(document\.getElementById\(['\"][^'\"]+['\"]\)|render\([^,]*,\s*document\.getElementById\(['\"][^'\"]+['\"]\)" index.html | grep -oE "['\"][^'\"]+['\"]" | tail -1 | tr -d "'\"")
echo "Mount = #${MID:-root}"

python3 -m http.server 8099 >/dev/null 2>&1 & SRV=$!; sleep 1
"$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --virtual-time-budget=15000 --screenshot=/tmp/smoke.png \
  --dump-dom http://localhost:8099/ 2>/tmp/chrome.err > /tmp/dom.html
kill $SRV 2>/dev/null

python3 - "${MID:-root}" <<'PY'
import sys, re
mid = sys.argv[1]
html = open('/tmp/dom.html', encoding='utf-8', errors='ignore').read()
m = re.search(r'id="'+re.escape(mid)+r'"[^>]*>(.*?)</(?:div|main|section)>\s*(?:<script|$)', html, re.S) \
    or re.search(r'id="'+re.escape(mid)+r'"[^>]*>(.*)', html, re.S)
inner = (m.group(1) if m else '')[:5000].strip()
# app đã render nếu mount có nhiều node con thật (không chỉ spinner/placeholder vài chục ký tự)
ok = len(inner) > 300
print(("✅ RENDER OK" if ok else "❌ TRẮNG MÀN HÌNH — mount rỗng, nghi Babel/JS lỗi"), f"({len(inner)} ký tự trong #{mid})")
PY
```
- Xem thêm ảnh `/tmp/smoke.png` để mắt thường xác nhận UI hiện đúng.
- Bắt lỗi console/JS: chromium `--dump-dom` không lấy console. Nếu cần chi tiết lỗi, cài Playwright
  ở máy local (`npm i -D playwright`) rồi bắt `page.on('console')` + `page.on('pageerror')`.

## Chế độ B — Kiểm tra tĩnh (không cần mạng)
Không render được, nhưng vẫn bắt được phần lớn lỗi sửa tay:
```bash
cd <repo>
# 1. Cân bằng ngoặc trên toàn file (lỗi JSX/JS phổ biến nhất khi sửa tay)
node -e "const s=require('fs').readFileSync('index.html','utf8'); \
  for(const [o,c] of [['(',')'],['{','}'],['[',']']]){ \
  const a=s.split(o).length-1, b=s.split(c).length-1; \
  console.log(o,c, a===b?'OK':('❌ LỆCH '+a+' vs '+b)); }"
# 2. Điểm mount tồn tại trong HTML
MID=$(grep -oE "getElementById\(['\"][^'\"]+['\"]\)" index.html | grep -oE "['\"][^'\"]+['\"]" | tr -d "'\"" | sort -u)
for id in $MID; do grep -q "id=[\"']$id[\"']" index.html && echo "mount #$id: có trong HTML ✅" || echo "mount #$id: ❌ KHÔNG có phần tử tương ứng"; done
# 3. Asset cục bộ không chết (tái dùng pwa-healthcheck mục 5)
grep -oE '(href|src)="\.?/?[^":]+"' index.html | grep -vE 'http|data:|#' | grep -oE '"[^"]+"' | tr -d '"' | while read a; do [ -e "$a" ] || echo "❌ asset chết: $a"; done
```
- Cân bằng ngoặc chỉ bắt lỗi thô — KHÔNG thay được render thật. Luôn dặn người dùng chạy Chế độ A
  trên máy local trước khi phát hành bản lớn.

## Báo cáo
- Nêu rõ chạy **Chế độ A hay B** và vì sao (mạng mở/chặn).
- Kết luận 1 dòng: ✅ ổn / ❌ nghi lỗi (kèm chi tiết). Nếu Chế độ B pass nhưng chưa render thật →
  ghi rõ "mới kiểm tĩnh, chưa xác nhận render — cần chạy trên máy local".

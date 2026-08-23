#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cổng kiểm «CueZen» — soi bản dựng và nguồn trước khi đẩy lên mạng.

    python3 kiem-cuezen.py            soi bản thật trong thư mục app
    python3 kiem-cuezen.py --ca       chạy bộ ca, in bảng ca đỏ
    python3 kiem-cuezen.py --tu-kiem  dựng từng bản hỏng, đòi đúng ca của nó đỏ

Năm lối hỏng của app này, cả năm đều KHÔNG phát ra tiếng:

  · `index.html` lệch `nguon/app.jsx` ⇒ app vẫn chạy ngon, chỉ là mã của lần dựng
    trước; sửa thẳng vào bản dựng thì lần dựng sau nuốt mất bản sửa ấy;
  · một cỡ chữ viết bằng `px` ⇒ hiện đúng ở cỡ Vừa nên không ai thấy, mãi tới khi
    người dùng chọn cỡ khác ở Cài đặt mới lộ ra là đúng chỗ đó đứng im;
  · ô nhập trong hàng flex thiếu `min-width:0` ⇒ ở cỡ Lớn và Rất lớn, bề rộng tối
    thiểu 20 ký tự của `<input>` đẩy cả hàng tràn ngang ra ngoài màn hình;
  · một khoá `nc.*` dùng trong mã mà thiếu trong `SYNC_KEYS` ⇒ `cloudSnap()` bỏ qua
    đúng khoá đó, tức dữ liệu ấy không lên mây và không nằm trong bản xuất; máy mất
    hay đổi máy mới biết;
  · tên kho của lớp chạy nền không tăng số ⇒ máy đã cài app mãi chạy bản cũ.
"""

import io
import json
import os
import re
import subprocess
import sys

THU_APP = os.path.dirname(os.path.abspath(__file__))

# Khoá `nc.*` được phép đứng ngoài `SYNC_KEYS`, kèm lý do. Ngoài ba khoá này thì mọi
# khoá mới đều phải khai — đây là chỗ khai ngoại lệ, đừng nới bằng cách sửa phép đo.
KHOA_NGOAI_LE = {
    'nc._syncAt': 'mốc giờ đồng bộ của riêng máy này, đẩy lên mây là tự đá nhau',
    'nc.planAdd': 'chỉ sống trong ngày (khoá mang `date`), sang ngày mới tự rỗng',
    'nc.planHidden': 'chỉ sống trong ngày (khoá mang `date`), sang ngày mới tự rỗng',
}

# Cỡ chữ viết bằng `px` được phép, kèm lý do. Bốn ngoại lệ này đã khai ở `CLAUDE.md`.
PX_NGOAI_LE = (
    ('font-size:16px', 'cỡ nền của thẻ <html>, chính là mốc để các rem quy chiếu'),
    ('font-size:34vw', 'đồng hồ bấm giờ toàn màn hình, không phải cỡ chữ trang'),
)

MAU_PX_CSS = re.compile(r'font-size\s*:\s*[\d.]+px')
MAU_PX_JSX = re.compile(r"fontSize\s*:\s*(?:[\d.]+(?![\w.])|['\"][\d.]+px['\"])")
MAU_LUAT_CSS = re.compile(r'([^{}\n]{1,120}?)\{([^{}]*)\}')


def _doc(duong):
    try:
        with io.open(duong, encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None


def van_tay(s):
    """Cùng phép băm mà `dungapp/dung.py` ghi vào `nguon/.van-tay`."""
    import hashlib
    return hashlib.sha256((s or '').encode('utf-8')).hexdigest()


def soi(thu=THU_APP, dung_lai=True):
    """Soi app trong `thu`. Trả danh sách câu mô tả lỗi, rỗng là sạch."""
    loi = []
    index = _doc(os.path.join(thu, 'index.html'))
    jsx = _doc(os.path.join(thu, 'nguon', 'app.jsx'))
    khung = _doc(os.path.join(thu, 'nguon', 'khung.html'))
    if index is None:
        return ['không đọc được index.html']
    if jsx is None or khung is None:
        return ['không đọc được nguon/ — app một file phải giữ nguồn tách riêng']

    # ── luật 1: bản dựng chưa bị sửa tay, và khớp nguồn ───────────────────────
    moc = (_doc(os.path.join(thu, 'nguon', '.van-tay')) or '').strip()
    if not moc:
        loi.append('nguon/.van-tay trống — không có mốc nào để biết index.html còn '
                   'đúng bản dựng hay đã bị sửa tay')
    elif moc != van_tay(index):
        loi.append('index.html đã bị sửa tay sau lần dựng trước (vân tay lệch) — lần '
                   'dựng sau sẽ nuốt mất bản sửa đó')
    if dung_lai:
        loi += _soi_dung_lai(thu)

    # ── luật 2: cỡ chữ viết bằng rem, không viết bằng px ──────────────────────
    loi += _soi_co_chu(jsx, khung)

    # ── luật 3: ô nhập trong hàng flex phải có min-width:0 ────────────────────
    loi += _soi_o_nhap(jsx + khung)

    # ── luật 4: SYNC_KEYS phủ đủ khoá dữ liệu ─────────────────────────────────
    loi += _soi_khoa_dong_bo(jsx)

    # ── luật 5: không dịch mã trong trình duyệt (quy tắc chung mục 29) ────────
    if '@babel/standalone' in index or 'text/babel' in index:
        loi.append('index.html dịch mã trong trình duyệt — bản dựng phải là mã đã dịch sẵn')

    # ── luật 6: lớp chạy nền và manifest ──────────────────────────────────────
    loi += _soi_vo(thu)
    return loi


def _soi_dung_lai(thu):
    """Dựng lại từ nguồn rồi so với `index.html` đang có. Không đo được thì KÊU."""
    dung = os.path.expanduser('~/Claude/HeThong/dungapp/dung.py')
    if not os.path.exists(dung):
        dung = '/Users/Huy/Claude/HeThong/dungapp/dung.py'
    if not os.path.exists(dung):
        return ['không tìm thấy dungapp/dung.py — không đo được bản dựng có khớp nguồn không']
    try:
        p = subprocess.run([sys.executable, dung, thu, '--kiem'],
                           capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.SubprocessError) as e:
        return ['không chạy được phép dựng lại: %s' % e]
    if p.returncode != 0:
        return ['phép dựng lại thoát mã %d: %s' % (p.returncode, (p.stderr or '').strip()[:200])]
    ra = p.stdout or ''
    if '≠' in ra:
        return ['index.html LỆCH bản dựng từ nguon/app.jsx — nguồn đã sửa mà chưa dựng '
                'lại, người dùng vẫn đang mở mã của lần trước']
    if '=' not in ra:
        return ['phép dựng lại không nói được khớp hay lệch: %r' % ra.strip()[:120]]
    return []


def _bo_ngoai_le_px(s):
    for manh, _ in PX_NGOAI_LE:
        s = s.replace(manh, '')
    return s


def _soi_co_chu(jsx, khung):
    """Cỡ chữ phải viết bằng `rem` để nút chọn cỡ chữ ở Cài đặt với tới được.

    Cơ chế đổi cỡ là đổi `font-size` của thẻ `<html>`, nên một chỗ viết `px` vẫn hiện
    đúng ở cỡ Vừa và không lỗi nào phát ra — mãi tới khi người dùng chọn cỡ khác mới
    lộ ra là đúng chỗ đó đứng im.

    Bỏ qua `fontSize=` trong SVG: ở đó đơn vị là toạ độ viewBox, không phải cỡ chữ
    trang, nên bắt luôn cả nó là chặn oan.
    """
    loi = []
    css_px = MAU_PX_CSS.findall(_bo_ngoai_le_px(khung)) + MAU_PX_CSS.findall(_bo_ngoai_le_px(jsx))
    if css_px:
        loi.append('%d chỗ khai cỡ chữ bằng px trong CSS (%s) — nút chọn cỡ chữ ở Cài '
                   'đặt không với tới, chỗ đó đứng im ở mọi cỡ'
                   % (len(css_px), ', '.join(sorted(set(css_px))[:4])))
    jsx_px = MAU_PX_JSX.findall(jsx)
    if jsx_px:
        loi.append('%d chỗ khai cỡ chữ bằng px trong style JSX (%s) — cùng lối hỏng'
                   % (len(jsx_px), ', '.join(sorted(set(jsx_px))[:4])))
    return loi


def _soi_o_nhap(ma):
    """Ô nhập ăn theo `flex:1` phải có `min-width:0`.

    `<input>` mặc định rộng theo 20 ký tự; ở cỡ Lớn và Rất lớn bề rộng tối thiểu ấy đẩy
    cả hàng tràn ngang ra ngoài màn hình, mà ở cỡ Vừa thì không thấy gì. Đã vấp thật ở
    `.editrow input`.
    """
    xau = []
    for m in MAU_LUAT_CSS.finditer(ma):
        sel, than = m.group(1).strip(), m.group(2)
        if not re.search(r'\b(input|select|textarea)\s*$', sel):
            continue
        if re.search(r'flex\s*:\s*1', than) and not re.search(r'min-width\s*:\s*0', than):
            xau.append(sel[:60])
    if xau:
        return ['%d ô nhập ăn theo flex mà thiếu min-width:0 (%s) — ở cỡ chữ Lớn thì '
                'cả hàng tràn ngang ra ngoài màn hình' % (len(xau), ', '.join(xau[:3]))]
    return []


def _soi_khoa_dong_bo(jsx):
    """Mọi khoá `nc.*` dùng trong mã phải nằm trong `SYNC_KEYS` hoặc trong bảng ngoại lệ.

    `cloudSnap()` duyệt đúng `SYNC_KEYS`, và bản xuất dùng chung danh sách ấy, nên một
    khoá quên khai sẽ không lên mây và không nằm trong bản xuất — máy mất hay đổi máy
    mới biết.
    """
    m = re.search(r'SYNC_KEYS\s*=\s*\[(.*?)\]', jsx, re.S)
    if not m:
        return ['không tìm thấy SYNC_KEYS — không đo được đồng bộ có phủ đủ không']
    trong_bang = set(re.findall(r"'(nc\.[\w]+)'", m.group(1)))
    if not trong_bang:
        return ['SYNC_KEYS rỗng — không khoá nào lên mây, bản xuất ra file rỗng']
    dung_trong_ma = set(re.findall(r"'(nc\.[\w]+)'", jsx))
    thieu = sorted(dung_trong_ma - trong_bang - set(KHOA_NGOAI_LE))
    if thieu:
        return ['%d khoá dùng trong mã mà KHÔNG khai ở SYNC_KEYS và cũng không khai '
                'ngoại lệ (%s) — dữ liệu đó không lên mây, không nằm trong bản xuất'
                % (len(thieu), ', '.join(thieu))]
    return []


def _soi_vo(thu):
    loi = []
    sw = _doc(os.path.join(thu, 'sw.js'))
    if sw is None:
        loi.append('không đọc được sw.js')
    else:
        if not re.search(r"CACHE\s*=\s*'[\w.-]+-v\d+'", sw):
            loi.append('tên kho của sw.js không theo khuôn «<app>-v<số>» — không tăng '
                       'số được thì máy đã cài app mãi chạy bản cũ')
        m = re.search(r'CORE\s*=\s*\[(.*?)\]', sw, re.S)
        if not m:
            loi.append('sw.js không khai danh sách file vỏ CORE')
        else:
            vo = re.findall(r"'([^']+)'", m.group(1))
            if './index.html' not in vo:
                loi.append('vỏ không khai ./index.html — mất mạng là trắng trang')
            for f in vo:
                if f.startswith('http') or f in ('./', '/'):
                    continue
                if not os.path.exists(os.path.join(thu, f[2:] if f.startswith('./') else f)):
                    loi.append('sw.js khai file vỏ %s nhưng không có trên đĩa — '
                               'cache.addAll trượt CẢ LÔ trong im lặng' % f)
        if 'navigate' not in sw:
            loi.append('sw.js không tách nhánh cho trang chính — mất ưu tiên mạng, app '
                       'chạy mãi mã của bản đã lưu')

    man = _doc(os.path.join(thu, 'manifest.json'))
    if man is None:
        loi.append('không đọc được manifest.json')
        return loi
    try:
        d = json.loads(man)
    except ValueError as e:
        loi.append('manifest.json không phải JSON hợp lệ: %s' % e)
        return loi
    for i in d.get('icons') or []:
        src = i.get('src') or ''
        if src and not os.path.exists(os.path.join(thu, src)):
            loi.append('manifest khai icon %s nhưng file không có trên đĩa' % src)
    return loi


# ── Bộ ca ────────────────────────────────────────────────────────────────────

DEM_CA = {'tong': 0}


def _ca(so, ten, dat):
    DEM_CA['tong'] += 1
    print('  %s ca %-3d %s' % ('✓' if dat else '✗', so, ten))
    return dat


class app_hong(object):
    """Chép app thật sang thư mục tạm rồi bẻ đúng một chỗ."""

    CHEP = ('index.html', 'sw.js', 'manifest.json', 'icon.svg')
    CHEP_NGUON = ('app.jsx', 'khung.html', '.van-tay')

    def __init__(self, doi):
        self.doi = doi

    def __enter__(self):
        import shutil
        import tempfile
        self.thu = tempfile.mkdtemp(prefix='_thu-cuezen-')
        os.makedirs(os.path.join(self.thu, 'nguon'))
        for ten in self.CHEP:
            g = os.path.join(THU_APP, ten)
            if os.path.exists(g):
                shutil.copy2(g, os.path.join(self.thu, ten))
        for ten in self.CHEP_NGUON:
            g = os.path.join(THU_APP, 'nguon', ten)
            if os.path.exists(g):
                shutil.copy2(g, os.path.join(self.thu, 'nguon', ten))
        for ten, sua in self.doi.items():
            duong = os.path.join(self.thu, ten)
            if sua is None:
                if os.path.exists(duong):
                    os.unlink(duong)
                continue
            with io.open(duong, encoding='utf-8') as f:
                cu = f.read()
            with io.open(duong, 'w', encoding='utf-8') as f:
                f.write(sua(cu))
        return self.thu

    def __exit__(self, *a):
        import shutil
        shutil.rmtree(self.thu, ignore_errors=True)
        return False


def _co(loi, manh):
    return any(manh in x for x in loi)


def chay_ca():
    do = []

    that = soi(THU_APP)
    if not _ca(1, 'ĐỐI CHỨNG: bản thật phải sạch, kể cả phép dựng lại (%s)'
               % ('sạch' if not that else that[0][:60]), not that):
        do.append(1)

    # ── luật 1: bản dựng ──────────────────────────────────────────────────────
    with app_hong({'index.html': lambda s: s.replace('</body>', '<!-- sửa tay --></body>', 1)}) as t:
        if not _ca(2, 'PHẢI CHẶN: index.html bị sửa tay sau lần dựng (vân tay lệch)',
                   _co(soi(t, dung_lai=False), 'bị sửa tay')):
            do.append(2)
    with app_hong({'nguon/.van-tay': lambda s: ''}) as t:
        if not _ca(3, 'PHẢI CHẶN: mốc vân tay trống — không đo được thì phải KÊU',
                   _co(soi(t, dung_lai=False), 'không có mốc nào')):
            do.append(3)
    with app_hong({'nguon/app.jsx': lambda s: s.replace(
            "const CACHE_TEN=", "const CACHE_TEN_MOI=", 1) if 'const CACHE_TEN=' in s
            else s.replace('const THEMES=[', 'const THEM_MOT_DONG=1;\nconst THEMES=[', 1)}) as t:
        if not _ca(4, 'PHẢI CHẶN: nguồn đã sửa mà chưa dựng lại ⇒ người dùng mở mã cũ',
                   _co(soi(t), 'LỆCH bản dựng')):
            do.append(4)

    # ── luật 2: cỡ chữ ────────────────────────────────────────────────────────
    with app_hong({'nguon/khung.html': lambda s: s.replace(
            'font-size:0.875rem', 'font-size:14px', 1)}) as t:
        if not _ca(5, 'PHẢI CHẶN: một cỡ chữ trong CSS viết bằng px',
                   _co(soi(t, dung_lai=False), 'bằng px trong CSS')):
            do.append(5)
    with app_hong({'nguon/app.jsx': lambda s: s.replace(
            'const THEMES=[', "const x={fontSize:13};\nconst THEMES=[", 1)}) as t:
        if not _ca(6, 'PHẢI CHẶN: một cỡ chữ trong style JSX viết bằng số trần',
                   _co(soi(t, dung_lai=False), 'bằng px trong style JSX')):
            do.append(6)
    if not _ca(7, 'ĐỐI CHỨNG chống chặn oan: fontSize= trong SVG là toạ độ viewBox, '
               'không phải cỡ chữ trang', not MAU_PX_JSX.findall('<text fontSize={11}>A</text>')):
        do.append(7)

    # ── luật 3: ô nhập trong hàng flex ────────────────────────────────────────
    with app_hong({'nguon/khung.html': lambda s: s.replace(
            '.editrow input{flex:1;min-width:0;', '.editrow input{flex:1;', 1)}) as t:
        if not _ca(8, 'PHẢI CHẶN: ô nhập ăn theo flex mà thiếu min-width:0',
                   _co(soi(t, dung_lai=False), 'thiếu min-width:0')):
            do.append(8)

    # ── luật 4: SYNC_KEYS ─────────────────────────────────────────────────────
    with app_hong({'nguon/app.jsx': lambda s: s.replace(
            'const THEMES=[', "const KHOA_MOI='nc.tamly';\nconst THEMES=[", 1)}) as t:
        if not _ca(9, 'PHẢI CHẶN: khoá nc.* mới không khai ở SYNC_KEYS ⇒ không lên mây',
                   _co(soi(t, dung_lai=False), 'KHÔNG khai ở SYNC_KEYS')):
            do.append(9)
    with app_hong({'nguon/app.jsx': lambda s: re.sub(
            r'SYNC_KEYS\s*=\s*\[.*?\]', 'SYNC_KEYS=[]', s, count=1, flags=re.S)}) as t:
        if not _ca(10, 'PHẢI CHẶN: SYNC_KEYS rỗng ⇒ bản xuất ra file rỗng',
                   _co(soi(t, dung_lai=False), 'SYNC_KEYS rỗng')):
            do.append(10)
    if not _ca(11, 'ĐỐI CHỨNG: ba khoá ngoại lệ đã khai kèm lý do, không phải bỏ quên',
               set(KHOA_NGOAI_LE) == {'nc._syncAt', 'nc.planAdd', 'nc.planHidden'}
               and all(KHOA_NGOAI_LE.values())):
        do.append(11)

    # ── luật 5: dịch mã trong trình duyệt ─────────────────────────────────────
    with app_hong({'index.html': lambda s: s.replace(
            '<body', '<script src="https://x/@babel/standalone"></script><body', 1)}) as t:
        if not _ca(12, 'PHẢI CHẶN: bản dựng nạp Babel (quy tắc chung mục 29)',
                   _co(soi(t, dung_lai=False), 'dịch mã trong trình duyệt')):
            do.append(12)

    # ── luật 6: lớp chạy nền ──────────────────────────────────────────────────
    with app_hong({'sw.js': lambda s: s.replace("const CACHE = 'nhipco-v54';",
                                                "const CACHE = 'kho';", 1)}) as t:
        if not _ca(13, 'PHẢI CHẶN: tên kho không đánh số ⇒ máy đã cài mãi chạy bản cũ',
                   _co(soi(t, dung_lai=False), 'không theo khuôn')):
            do.append(13)
    with app_hong({'sw.js': lambda s: s.replace("'./icon.svg'", "'./icon-chua-co.svg'", 1)}) as t:
        if not _ca(14, 'PHẢI CHẶN: vỏ khai file không có trên đĩa ⇒ addAll trượt cả lô',
                   _co(soi(t, dung_lai=False), 'trượt CẢ LÔ')):
            do.append(14)
    with app_hong({'sw.js': lambda s: s.replace('navigate', 'nav_gate')}) as t:
        if not _ca(15, 'PHẢI CHẶN: sw.js mất nhánh ưu tiên mạng cho trang chính',
                   _co(soi(t, dung_lai=False), 'mất ưu tiên mạng')):
            do.append(15)
    with app_hong({'icon.svg': None}) as t:
        if not _ca(16, 'PHẢI CHẶN: manifest khai icon mà file không có trên đĩa',
                   _co(soi(t, dung_lai=False), 'manifest khai icon')):
            do.append(16)

    # ── ĐƯỜNG GẮN ─────────────────────────────────────────────────────────────
    with app_hong({'index.html': lambda s: s.replace('</body>', '<!-- sửa tay --></body>', 1)}) as t:
        p = subprocess.run([sys.executable, os.path.abspath(__file__),
                            '--thu-muc', t, '--khong-dung-lai'],
                           capture_output=True, text=True)
        if not _ca(17, 'ĐƯỜNG GẮN: chạy thẳng trên bản hỏng thì thoát khác 0',
                   p.returncode != 0):
            do.append(17)
    return do


def tu_kiem():
    for goc in (os.path.expanduser('~/Claude/HeThong'), '/Users/Huy/Claude/HeThong'):
        if os.path.isdir(goc):
            sys.path.insert(0, goc)
            break
    from khung_tu_kiem import vong_ban_hong

    sys.dont_write_bytecode = True
    print('— bản ĐÚNG —')
    DEM_CA['tong'] = 0
    do = chay_ca()
    print('  %d/%d ca đạt' % (DEM_CA['tong'] - len(do), DEM_CA['tong']))
    if do:
        print('✗ bản đúng đã đỏ ở ca %s — sửa mã trước khi xét bản hỏng' % do)
        return 1
    return vong_ban_hong(__file__, os.path.abspath(__file__), BAN_HONG,
                         lenh=lambda duong: [sys.executable, duong, '--ca'],
                         do_rong=78,
                         tieu_de='dựng bản kiem-cuezen.py đã gỡ dòng bảo vệ')


def main():
    if '--tu-kiem' in sys.argv:
        return tu_kiem()
    if '--ca' in sys.argv:
        return 1 if chay_ca() else 0
    thu = THU_APP
    if '--thu-muc' in sys.argv:
        thu = sys.argv[sys.argv.index('--thu-muc') + 1]
    loi = soi(thu, dung_lai='--khong-dung-lai' not in sys.argv)
    if not loi:
        print('✓ CueZen sạch: bản dựng khớp nguồn, cỡ chữ viết bằng rem, ô nhập không '
              'tràn hàng, %d khoá dữ liệu đều lên mây, lớp chạy nền đúng luật'
              % len(re.findall(r"'nc\.[\w]+'",
                               re.search(r'SYNC_KEYS\s*=\s*\[(.*?)\]',
                                         _doc(os.path.join(thu, 'nguon', 'app.jsx')) or '',
                                         re.S).group(1))))
        return 0
    print('✗ %d lỗi:' % len(loi))
    for x in loi:
        print('  · %s' % x)
    return 1


# ── Bảng bản hỏng đặt CUỐI file, sau mã (quy ước bắt buộc) ───────────────────

BAN_HONG = (
    # ⚠ Neo BẮT BUỘC trải ≥02 dòng và viết bằng `\n` thoát: bảng này nằm CÙNG file với
    # mã nó nhắm tới, neo một dòng sẽ tự khớp thêm chính dòng khai ⇒ «2 chỗ khớp».

    ('bỏ nhánh so vân tay — index.html sửa tay không ai kêu',
     "    elif moc != van_tay(index):\n        loi.append('index.html đã bị sửa tay",
     "    elif False:\n        loi.append('index.html đã bị sửa tay",
     (2, 17)),

    ('mốc vân tay trống được coi là bình thường (fail-open ở nhánh không đo được)',
     "    if not moc:\n        loi.append('nguon/.van-tay trống",
     "    if False:\n        loi.append('nguon/.van-tay trống",
     (3,)),

    ('bỏ phép dựng lại — nguồn sửa mà chưa dựng thì không ai biết',
     "    if dung_lai:\n        loi += _soi_dung_lai(thu)",
     "    if False:\n        loi += _soi_dung_lai(thu)",
     (4,)),

    ('phép dựng lại nuốt kết quả lệch, luôn báo khớp',
     "    if '≠' in ra:\n        return ['index.html LỆCH bản dựng",
     "    if False:\n        return ['index.html LỆCH bản dựng",
     (4,)),

    ('bỏ phép dò cỡ chữ px trong CSS',
     "    if css_px:\n        loi.append('%d chỗ khai cỡ chữ bằng px trong CSS",
     "    if False:\n        loi.append('%d chỗ khai cỡ chữ bằng px trong CSS",
     (5,)),

    ('bỏ phép dò cỡ chữ px trong style JSX',
     "    jsx_px = MAU_PX_JSX.findall(jsx)\n    if jsx_px:",
     "    jsx_px = []\n    if jsx_px:",
     (6,)),

    ('nới mẫu px bắt luôn cả fontSize= của SVG ⇒ chặn oan toạ độ viewBox',
     "MAU_PX_JSX = re.compile(r\"fontSize\\s*:\\s*(?:[\\d.]+(?![\\w.])|['\\\"][\\d.]+px['\\\"])\")\n"
     "MAU_LUAT_CSS",
     "MAU_PX_JSX = re.compile(r\"fontSize\\s*[:=]\\s*[{]?(?:[\\d.]+(?![\\w.])|['\\\"][\\d.]+px['\\\"])\")\n"
     "MAU_LUAT_CSS",
     (7,)),

    ('bỏ phép soi ô nhập ăn theo flex',
     "        if re.search(r'flex\\s*:\\s*1', than) and not re.search(r'min-width\\s*:\\s*0', than):\n"
     "            xau.append(sel[:60])",
     "        if False:\n"
     "            xau.append(sel[:60])",
     (8,)),

    ('bỏ phép so khoá dùng trong mã với SYNC_KEYS',
     "    thieu = sorted(dung_trong_ma - trong_bang - set(KHOA_NGOAI_LE))\n    if thieu:",
     "    thieu = []\n    if thieu:",
     (9,)),

    ('SYNC_KEYS rỗng vẫn cho qua',
     "    if not trong_bang:\n        return ['SYNC_KEYS rỗng",
     "    if False:\n        return ['SYNC_KEYS rỗng",
     (10,)),

    ('nới bảng ngoại lệ để nuốt luôn khoá mới — cổng còn đó mà hết răng',
     "KHOA_NGOAI_LE = {\n    'nc._syncAt':",
     "KHOA_NGOAI_LE = {\n    'nc.tamly': 'nới bừa',\n    'nc._syncAt':",
     (9, 11)),

    ('bỏ nhánh chặn dịch mã trong trình duyệt',
     "    if '@babel/standalone' in index or 'text/babel' in index:\n        loi.append('index.html dịch mã",
     "    if False:\n        loi.append('index.html dịch mã",
     (12,)),

    ('bỏ nhánh soi khuôn đánh số của tên kho',
     "        if not re.search(r\"CACHE\\s*=\\s*'[\\w.-]+-v\\d+'\", sw):\n            loi.append('tên kho",
     "        if False:\n            loi.append('tên kho",
     (13,)),

    ('bỏ nhánh đối chiếu file vỏ với đĩa',
     "                if not os.path.exists(os.path.join(thu, f[2:] if f.startswith('./') else f)):\n"
     "                    loi.append('sw.js khai file vỏ",
     "                if False:\n"
     "                    loi.append('sw.js khai file vỏ",
     (14,)),

    ('bỏ nhánh đòi sw.js tách nhánh ưu tiên mạng cho trang chính',
     "        if 'navigate' not in sw:\n            loi.append('sw.js không tách nhánh",
     "        if False:\n            loi.append('sw.js không tách nhánh",
     (15,)),

    ('bỏ nhánh đối chiếu icon của manifest với đĩa',
     "        if src and not os.path.exists(os.path.join(thu, src)):\n"
     "            loi.append('manifest khai icon",
     "        if False:\n"
     "            loi.append('manifest khai icon",
     (16,)),

    ('main() không gọi cổng nữa, luôn thoát 0 — cổng dựng xong mà nằm không',
     "    loi = soi(thu, dung_lai='--khong-dung-lai' not in sys.argv)\n    if not loi:",
     "    loi = []\n    if not loi:",
     (17,)),
)


if __name__ == '__main__':
    sys.exit(main())

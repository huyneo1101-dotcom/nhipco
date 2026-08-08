#!/usr/bin/env python3
"""Đo mục Kiến thức của CueZen: số bài · bài rơi vào rổ "Khác" · trỏ chéo hỏng · bài mồ côi.

Chạy:  python3 /Users/Huy/Claude/App/NhipCo/do-kien-thuc.py
Mã thoát 0 = sạch · 3 = có lệch · 2 = chưa đo được.

Vì sao có file này: bàn giao phiên 08/08/2026 từng ghi một lệnh đo trỏ vào file
không tồn tại, buộc phiên sau phải tự dựng lại phép đo (luật 9 — lệnh đo trong
bàn giao phải CHẠY ĐƯỢC NGUYÊN VĂN).

Ba khuôn trỏ chéo hợp lệ, đừng vội kết luận link chết:
  (Xem "tên BÀI".) · (Xem "tên GẠCH" trong "tên BÀI".) · (Xem bài tập "tên" ở tab Rèn luyện.)
Khuôn thứ ba trỏ sang DRILLS/PROBLEMS/STRETCHES, không phải sang KNOWLEDGE.
"""
import re
import sys
import unicodedata
from collections import Counter

DUONG = '/Users/Huy/Claude/App/NhipCo/index.html'
MUC = [('PSY_SUBCATS', 'Tâm lý'), ('TAC_SUBCATS', 'Chiến thuật'), ('TECH_SUBCATS', 'Kỹ thuật')]


def chuan(x):
    """NFC + hạ chữ + bỏ dấu nháy kép + gộp khoảng trắng.

    Bỏ dấu nháy kép vì tiêu đề bài có thể tự chứa nó (vd bài "vùng dòng chảy"),
    trong khi cụm trỏ chéo lại dùng chính dấu ấy để bọc tên bài.
    """
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', x).lower().replace('"', '')).strip()


def main():
    try:
        s = open(DUONG, encoding='utf-8').read()
        seg = s[s.index('const KNOWLEDGE=['):s.index('const KNOW_CATS=[')]
    except (OSError, ValueError) as e:
        print('✗ chưa đo được: %s' % e)
        return 2

    moc = [m.start() for m in re.finditer(r"^  \{key:'", seg, re.M)] + [len(seg)]
    bai = []
    for i in range(len(moc) - 1):
        b = seg[moc[i]:moc[i + 1]]
        bai.append({
            'key': re.search(r"key:'([^']+)'", b).group(1),
            'tag': re.search(r"tag:'([^']+)'", b).group(1),
            'title': chuan(re.search(r"title:'([^']+)'", b).group(1)),
            'gach': [chuan(h) for h in re.findall(r"\{h:'([^']*)'", b)],
            'than': b,
        })
    print('Tổng %d bài — %s' % (len(bai), dict(Counter(a['tag'] for a in bai))))

    lech = 0

    # (1) Bài rơi vào rổ "Khác" — tag có nhóm con mà key chưa khai vào nhóm nào.
    for ten, tag in MUC:
        try:
            i = s.index('const ' + ten + '=[')
            j = s.index('const ', i + 10)
        except ValueError:
            print('✗ %s: không tìm thấy — chưa đo được' % ten)
            return 2
        trong = set(re.findall(r"'([a-z_]+)'", re.sub(r'label:.[^,]*', '', s[i:j])))
        roi = [a['key'] for a in bai if a['tag'] == tag and a['key'] not in trong]
        if roi:
            print('✗ %s: %d bài rơi vào rổ "Khác" — %s' % (ten, len(roi), roi))
            lech += 1
        else:
            print('✓ %s: không bài nào rơi vào rổ "Khác"' % ten)

    # Tên bài tập ở tab Rèn luyện (khuôn trỏ chéo thứ ba).
    tap = set()
    for khoi in ['const DRILLS=', 'const PROBLEMS=', 'const STRETCHES=']:
        try:
            i = s.index(khoi)
            j = s.index('\nconst ', i + 10)
        except ValueError:
            print('✗ %s: không tìm thấy — chưa đo được' % khoi)
            return 2
        for m in re.finditer(r"(?:name|title|t):'([^']+)'", s[i:j]):
            tap.add(chuan(m.group(1)))

    khop_bai = lambda q: [a for a in bai if q == a['title'] or a['title'].startswith(q) or q in a['title']]
    khop_tap = lambda q: any(q == n or q in n or n.startswith(q) for n in tap)
    khop_gach = lambda q: any(any(q == h or q in h or h.startswith(q) for h in a['gach']) for a in bai)

    # (2) Trỏ chéo hỏng + (3) bài không bài nào trỏ tới.
    duoc_tro = set()
    tong = hong = 0
    for a in bai:
        for m in re.finditer(r'\(Xem[^)]*\)', a['than']):
            for mm in re.finditer(r'"([^"]+)"', m.group(0)):
                q = chuan(mm.group(1))
                tong += 1
                trung = khop_bai(q)
                duoc_tro.update(x['key'] for x in trung if x['key'] != a['key'])
                if not (trung or khop_tap(q) or khop_gach(q)):
                    hong += 1
                    print('  ✗ HỎNG trong bài %s: "%s"' % (a['key'], mm.group(1)))
    print(('✓' if not hong else '✗') + ' trỏ chéo: %d cụm, %d hỏng' % (tong, hong))
    lech += 1 if hong else 0

    mo_coi = [a['key'] for a in bai if a['key'] not in duoc_tro]
    if mo_coi:
        print('✗ %d bài không bài nào trỏ tới — %s' % (len(mo_coi), mo_coi))
        lech += 1
    else:
        print('✓ không bài nào bị bỏ quên (mọi bài đều có ít nhất một chỗ trỏ tới)')

    return 3 if lech else 0


if __name__ == '__main__':
    sys.exit(main())

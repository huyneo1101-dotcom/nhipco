#!/usr/bin/env python3
"""LaunchAgent hằng ngày — routine nghiên cứu tâm lý một cơ thủ bi-a top thế giới cho mục
Kiến thức app CueZen (NhipCo).

Đi đường headless (`claude -p --model sonnet`) chứ không mở scheduled task của app, đúng lý do
đã ghi trong `routine-tin-kinh-doanh.py`: phiên app LUÔN chạy Opus dù settings.json khai Sonnet.
Phần cần Opus — tìm & chọn trích dẫn thật, dịch, đánh giá độ tin cậy nguồn — tách ra subagent
`nghien-cuu-tam-ly-co-thu` khai `model: opus`, nên phiên vỏ vẫn rẻ (mục 27 CLAUDE.md).

Nạp module `routine-claude-headless.py` thay vì spawn subprocess, cùng lý do đã ghi trong file
mẫu: đường kêu Telegram, khoá chống chạy chồng, phép dò thư mục cấu hình còn đăng nhập và phép
soi câu-trả-lời-bằng-lời-hứa đều nằm trong `chay_task`, chép lại là hai bản dễ lệch nhau.
"""
import importlib.util
import os
import sys

HERE = '/Users/Huy/Claude/HeThong'
HEADLESS = os.environ.get('ROUTINE_HEADLESS_PY') or os.path.join(
    HERE, 'routine-claude-headless.py')


def nap():
    spec = importlib.util.spec_from_file_location('routine_claude_headless', HEADLESS)
    if spec is None or spec.loader is None:
        raise ImportError('không nạp được %s' % HEADLESS)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


if __name__ == '__main__':
    try:
        mod = nap()
    except Exception as e:
        sys.path.insert(0, HERE)
        try:
            from routine_lib import bao, gio_vn
            bao('🔴 Routine nghiên cứu cơ thủ KHÔNG chạy được lúc %s — %r' % (gio_vn(), e))
        except Exception:
            pass
        print('không nạp được %s: %r' % (HEADLESS, e), file=sys.stderr)
        sys.exit(2)
    sys.exit(mod.chay_task('nghien-cuu-co-thu'))

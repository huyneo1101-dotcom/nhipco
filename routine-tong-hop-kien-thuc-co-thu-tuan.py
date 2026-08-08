#!/usr/bin/env python3
"""LaunchAgent hằng tuần — rà các bài 'Học từ cơ thủ đỉnh cao' đã có, bổ sung tin mới nếu có.

Anh em với `routine-nghien-cuu-co-thu.py` (chạy hằng ngày, viết bài MỚI). File này KHÔNG viết
bài mới, chỉ soát và bổ sung — xem chi tiết trong SKILL.md của task.
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
            bao('🔴 Routine tổng hợp kiến thức cơ thủ (tuần) KHÔNG chạy được lúc %s — %r' % (gio_vn(), e))
        except Exception:
            pass
        print('không nạp được %s: %r' % (HEADLESS, e), file=sys.stderr)
        sys.exit(2)
    sys.exit(mod.chay_task('tong-hop-kien-thuc-co-thu-tuan'))

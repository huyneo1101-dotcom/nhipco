#!/usr/bin/env python3
# Cat lay dai phu de chay san (burned-in) o day khung hinh, khu trung lap, ghep thanh anh dai de doc.
import os, subprocess, sys, glob
from PIL import Image, ImageChops, ImageStat

vid = sys.argv[1]
out = sys.argv[2]
step = float(sys.argv[3]) if len(sys.argv) > 3 else 0.7
band_top = float(sys.argv[4]) if len(sys.argv) > 4 else 0.86
band_bot = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
per_sheet = int(sys.argv[6]) if len(sys.argv) > 6 else 22

os.makedirs(out, exist_ok=True)
for f in glob.glob(out + '/*.png'):
    os.remove(f)

dur = float(subprocess.check_output(
    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', vid]).strip())

tmp = out + '/_raw'
os.makedirs(tmp, exist_ok=True)
for f in glob.glob(tmp + '/*.png'):
    os.remove(f)

subprocess.run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', f'fps=1/{step}',
                '-y', tmp + '/r_%05d.png'], check=True)

frames = sorted(glob.glob(tmp + '/r_*.png'))
crops = []
prev = None
for i, fp in enumerate(frames):
    im = Image.open(fp).convert('L')
    w, h = im.size
    c = im.crop((0, int(h * band_top), w, int(h * band_bot)))
    if prev is not None:
        diff = ImageChops.difference(c, prev)
        if ImageStat.Stat(diff).mean[0] < 4.5:   # gan nhu y het khung truoc -> bo
            continue
    prev = c
    # bo khung trong (khong co chu): do lech chuan thap
    if ImageStat.Stat(c).stddev[0] < 6:
        continue
    crops.append((round(i * step, 1), c))

print('tong khung:', len(frames), '| dai phu de giu lai:', len(crops))

# ghep thanh trang
sheet_i = 0
for k in range(0, len(crops), per_sheet):
    chunk = crops[k:k + per_sheet]
    w = max(c.width for _, c in chunk)
    hh = sum(c.height + 6 for _, c in chunk)
    sheet = Image.new('L', (w, hh), 255)
    y = 0
    for t, c in chunk:
        sheet.paste(c, (0, y))
        y += c.height + 6
    sheet = sheet.resize((w * 2, hh * 2), Image.LANCZOS)
    sheet_i += 1
    p = f'{out}/sheet_{sheet_i:02d}.png'
    sheet.save(p)
    print(p, 'moc giay:', [t for t, _ in chunk])

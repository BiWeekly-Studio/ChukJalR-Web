#!/usr/bin/env python3
"""
앱 아이콘 생성 — 1024x1024 PNG.

워드마크 전체(축잘알)는 가로로 길어서 정사각형 안에 넣으면 위아래가 비고 작게 뭉갠다.
그래서 첫 글자 '축' 하나만 판때기에 얹는다. 40px 로 줄어도 읽히고, 전체 워드마크와
같은 획·같은 판때기라 같은 브랜드로 읽힌다.

좌표는 src/components/Logo.tsx / ios/Sources/PlateLogo.swift 와 같은 100x100 격자다.
의존성 없이 돌리려고 PNG 를 직접 인코딩한다(zlib 은 표준 라이브러리).
"""
import math, struct, zlib

S = 1024
SS = 3                     # 슈퍼샘플링 배수 (3x3 = 픽셀당 9 표본)
CELL = 100
# 워드마크의 여백(16)은 글자가 셋 나란히 있을 때 균형이 맞는 값이다. 한 글자만
# 크게 키우면 외곽선(8)까지 더해져 판때기 테두리에 달라붙는다. 그래서 여기만 넓힌다.
PAD = 26
PLATE = CELL + PAD * 2     # 152
SCALE = S * 0.68 / PLATE   # 아이콘 여백. 홈 화면 마스킹을 감안해 넉넉히 둔다
TILT = math.radians(-4)

# 파란 바탕에는 흰 판때기 — 로고의 '어두운 배경' 팔레트와 같다
BG_FROM = (0x3A, 0x63, 0xFF)
BG_TO   = (0x7B, 0x46, 0xF0)
PLATE_FILL   = (0xFF, 0xFF, 0xFF)
PLATE_SHADOW = (0xC9, 0xD2, 0xFF)
OUTLINE      = (0x14, 0x12, 0x33)
INK          = (0x3A, 0x63, 0xFF)

OUTLINE_HALF = 8           # stroke-width 16 의 절반
PLATE_STROKE = 6.5         # stroke-width 13 의 절반
SHADOW_DY = 11

# '축' — PlateLogo 와 같은 값
RECTS = [(38, 0, 24, 8), (0, 11, 100, 13), (0, 45, 100, 12),
         (43, 57, 14, 11), (0, 76, 100, 12), (86, 88, 14, 12)]
LINES = [((50, 24), (13, 38), 14), ((50, 24), (87, 38), 14)]


def near_rect(x, y, r, grow=0.0):
    rx, ry, rw, rh = r
    dx = max(rx - x, 0, x - (rx + rw))
    dy = max(ry - y, 0, y - (ry + rh))
    return dx * dx + dy * dy <= grow * grow if (dx or dy) else True


def near_segment(x, y, a, b, half):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
    px, py = ax + t * dx, ay + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= half * half


def glyph(x, y, grow=0.0):
    if any(near_rect(x, y, r, grow) for r in RECTS):
        return True
    return any(near_segment(x, y, a, b, w / 2 + grow) for a, b, w in LINES)


def rounded(x, y, rect, radius, grow=0.0):
    rx, ry, rw, rh = rect
    cx = min(max(x, rx + radius), rx + rw - radius)
    cy = min(max(y, ry + radius), ry + rh - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= (radius + grow) ** 2


PLATE_RECT = (-PAD, -PAD, PLATE, PLATE)


def sample(px, py):
    # 화면 좌표 → 글자 격자 좌표 (역변환: 이동 → 회전 → 배율)
    x = (px - S / 2) / SCALE
    y = (py - S / 2) / SCALE
    c, s = math.cos(-TILT), math.sin(-TILT)
    gx = x * c - y * s + CELL / 2
    gy = x * s + y * c + CELL / 2

    if glyph(gx, gy):
        return INK
    if glyph(gx, gy, OUTLINE_HALF):
        return OUTLINE
    if rounded(gx, gy, PLATE_RECT, 18):
        return PLATE_FILL
    if rounded(gx, gy, PLATE_RECT, 18, PLATE_STROKE):
        return OUTLINE
    shadow = (PLATE_RECT[0], PLATE_RECT[1] + SHADOW_DY, PLATE, PLATE)
    if rounded(gx, gy, shadow, 18):
        return PLATE_SHADOW
    if rounded(gx, gy, shadow, 18, PLATE_STROKE):
        return OUTLINE

    t = (px + py) / (2 * S)        # 135도 방향 선형 그라데이션
    return tuple(round(BG_FROM[i] + (BG_TO[i] - BG_FROM[i]) * t) for i in range(3))


def png(width, height, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


rows = []
step, off = 1.0 / SS, 1.0 / SS / 2
for py in range(S):
    row = bytearray()
    for px in range(S):
        r = g = b = 0
        for sy in range(SS):
            yy = py + off + sy * step
            for sx in range(SS):
                col = sample(px + off + sx * step, yy)
                r += col[0]; g += col[1]; b += col[2]
        n = SS * SS
        row += bytes((r // n, g // n, b // n))
    rows.append(row)

import os, sys
out = sys.argv[1] if len(sys.argv) > 1 else 'design/assets/app-icon-1024.png'
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'wb').write(png(S, S, rows))
print('생성:', out)

#!/usr/bin/env python3
"""
앱인토스 앱 로고 생성 — 정사각형 600x600 PNG, 모서리 둥근 형태 없음.

의존성 없이 돌리려고 PNG 를 직접 인코딩한다(zlib 은 표준 라이브러리).
도형은 전부 해석적으로 판정할 수 있는 것들이라(원·정오각형·선분) 슈퍼샘플링으로
경계를 부드럽게 만든다. 앱 안의 공 마크(src/components/Logo.tsx)와 같은 비율이다.
"""
import math, struct, zlib

S = 600           # 최종 크기
SS = 3            # 슈퍼샘플링 배수 (3x3 = 픽셀당 9 표본)
CX = CY = S / 2
R = S * 0.29      # 공 반지름. 토스가 모서리를 마스킹해도 안전하도록 여백을 둔다
PENT = R * 0.44   # 가운데 오각형
SPOKE_W = R * 0.155
SPOKE_END = R * 0.93
ANG = [-90, -18, 54, 126, 198]

BG_FROM = (0x3a, 0x63, 0xff)
BG_TO   = (0x7b, 0x46, 0xf0)
BALL    = (255, 255, 255)
INK     = (0x3a, 0x63, 0xff)

pent_pts = [(CX + math.cos(math.radians(a)) * PENT,
             CY + math.sin(math.radians(a)) * PENT) for a in ANG]
spokes = [((CX + math.cos(math.radians(a)) * PENT, CY + math.sin(math.radians(a)) * PENT),
           (CX + math.cos(math.radians(a)) * SPOKE_END, CY + math.sin(math.radians(a)) * SPOKE_END))
          for a in ANG]


def in_polygon(x, y, pts):
    inside = False
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < xin:
                inside = not inside
    return inside


def near_segment(x, y, a, b, half):
    ax, ay = a; bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L2))
    px, py = ax + t * dx, ay + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= half * half


def sample(x, y):
    """한 표본의 색. 배경 → 공 → 오각형·이음선 순으로 덮는다."""
    d2 = (x - CX) ** 2 + (y - CY) ** 2
    if d2 <= R * R:
        if in_polygon(x, y, pent_pts) or any(near_segment(x, y, a, b, SPOKE_W / 2) for a, b in spokes):
            return INK
        return BALL
    t = (x + y) / (2 * S)          # 135도 방향 선형 그라데이션
    return tuple(round(BG_FROM[i] + (BG_TO[i] - BG_FROM[i]) * t) for i in range(3))


rows = []
step = 1.0 / SS
off = step / 2
for py in range(S):
    row = bytearray()
    for px in range(S):
        r = g = b = 0
        for sy in range(SS):
            y = py + off + sy * step
            for sx in range(SS):
                c = sample(px + off + sx * step, y)
                r += c[0]; g += c[1]; b += c[2]
        n = SS * SS
        row += bytes((r // n, g // n, b // n))
    rows.append(row)


def png(width, height, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


out = 'design/assets/app-logo-600.png'
open(out, 'wb').write(png(S, S, rows))
print('생성:', out)

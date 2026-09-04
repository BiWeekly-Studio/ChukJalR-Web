#!/usr/bin/env python3
"""
워드마크 SVG 를 뽑는다 (웹 랜딩용).

좌표는 src/components/Logo.tsx · ios/Sources/PlateLogo.swift 와 같다.
한쪽만 고치면 셋이 갈라지므로, 로고를 바꿀 때는 셋 다 본다.
"""
import math, sys

CELL, GAP, PAD, TILT = 100, 6, 16, -4
BLOCK_W = CELL * 3 + GAP * 2
BOX_W, BOX_H = BLOCK_W + 80, CELL + 92

PLATE, SHADOW = "#3a63ff", "#1b2a7a"
OUTLINE, INK_A, INK_B, BALL_INK = "#141233", "#ffffff", "#ffc02e", "#3a63ff"

r = lambda x, y, w, h: f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>'
l = lambda x1, y1, x2, y2, w: f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke-width="{w}"/>'

def chuk():
    return (r(38,0,24,8) + r(0,11,100,13) + l(50,24,13,38,14) + l(50,24,87,38,14)
            + r(0,45,100,12) + r(43,57,14,11) + r(0,76,100,12) + r(86,88,14,12))

def rieul(top):
    return (r(0,top,100,12) + r(88,top+12,12,6) + r(0,top+18,100,12)
            + r(0,top+30,12,6) + r(0,top+36,100,12))

ah = lambda: r(71,0,14,50) + r(85,18,11,13)
jal = lambda: r(0,4,58,13) + l(29,17,4,46,14) + l(29,17,54,46,14) + ah() + rieul(52)

CX, CY, RR = 30, 25, 25
P, ANG = RR * 0.44, [-90, -18, 54, 126, 198]
pts = " ".join(f"{CX+math.cos(math.radians(a))*P:.1f},{CY+math.sin(math.radians(a))*P:.1f}" for a in ANG)
spokes = "".join(
    f'<line x1="{CX+math.cos(math.radians(a))*P:.1f}" y1="{CY+math.sin(math.radians(a))*P:.1f}"'
    f' x2="{CX+math.cos(math.radians(a))*RR*0.88:.1f}" y2="{CY+math.sin(math.radians(a))*RR*0.88:.1f}"'
    f' stroke="{BALL_INK}" stroke-width="5" stroke-linecap="round"/>' for a in ANG)

al_shape = f'<circle cx="{CX}" cy="{CY}" r="{RR}"/>' + ah() + rieul(52)
shapes = [chuk(), jal(), al_shape]
inks = [INK_A, INK_B, "#ffffff"]
at = lambda i, inner: f'<g transform="translate({i*(CELL+GAP)},0)">{inner}</g>'

outlined = "".join(at(i, f'<g fill="{OUTLINE}" stroke="{OUTLINE}" stroke-width="16" '
                        f'stroke-linejoin="round">{s}</g>') for i, s in enumerate(shapes))
filled = "".join(at(i, f'<g fill="{inks[i]}" stroke="{inks[i]}" stroke-width="0">{s}</g>')
                 for i, s in enumerate(shapes))
al_letters = at(2, f'<g fill="{INK_A}">{ah()}{rieul(52)}</g>')
ball = at(2, f'<g stroke="none"><polygon points="{pts}" fill="{BALL_INK}"/>{spokes}</g>')

plate = lambda dy, fill: (
    f'<rect x="{-PAD}" y="{-PAD}" width="{BLOCK_W+PAD*2}" height="{CELL+PAD*2}" rx="18" '
    f'transform="translate(0,{dy})" fill="{fill}" stroke="{OUTLINE}" stroke-width="13"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 {BOX_W} {BOX_H}" '
       f'role="img" aria-label="축잘알">'
       f'<g transform="rotate({TILT},{BLOCK_W/2},{CELL/2})">'
       f'{plate(11, SHADOW)}{plate(0, PLATE)}{outlined}{filled}{al_letters}{ball}</g></svg>')

out = sys.argv[1] if len(sys.argv) > 1 else "landing/assets/wordmark.svg"
open(out, "w").write(svg)
print("생성:", out)

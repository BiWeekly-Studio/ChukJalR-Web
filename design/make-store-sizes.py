#!/usr/bin/env python3
"""
스크린샷을 App Store Connect 가 받는 크기로 변환한다.

App Store Connect 는 슬롯마다 픽셀 크기가 딱 정해져 있고, 1픽셀만 달라도 거부한다.
6.9인치로 한 번 찍어두고 여기서 나머지를 만든다.

  6.9"  1320x2868   iPhone 16/17 Pro Max        (원본)
  6.5"  1284x2778   iPhone 12/13 Pro Max
  6.5"  1242x2688   iPhone 11 Pro Max / XS Max

가로 비율에 맞춰 줄인 뒤 세로 여분을 아래에서 잘라낸다. 늘리거나 눌러서 맞추면
글자가 미세하게 뭉개지고, 위를 자르면 상태바가 깎인다. 아래는 홈 인디케이터
자리라 잘려도 보이지 않는다.

의존성 없이 sips(macOS 기본)만 쓴다.
"""
import subprocess, sys, pathlib

TARGETS = [(1284, 2778), (1242, 2688)]


def convert(src: pathlib.Path, w: int, h: int, out_dir: pathlib.Path) -> pathlib.Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / src.name
    subprocess.run(["cp", str(src), str(dst)], check=True)
    # 가로를 맞춘다 → 세로는 원본 비율만큼 남는다
    subprocess.run(["sips", "--resampleWidth", str(w), str(dst)],
                   check=True, stdout=subprocess.DEVNULL)
    cur_h = int(subprocess.check_output(
        ["sips", "-g", "pixelHeight", str(dst)]).split()[-1])
    if cur_h != h:
        # 위쪽을 기준으로 자른다 (sips 는 가운데 기준이라 offset 을 준다)
        subprocess.run(["sips", "--cropOffset", "0", "0", "--cropToHeightWidth", str(h), str(w), str(dst)],
                       check=True, stdout=subprocess.DEVNULL)
    return dst


def main() -> None:
    src_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "design/appstore")
    shots = sorted(src_dir.glob("*.png"))
    if not shots:
        sys.exit(f"{src_dir} 에 png 가 없습니다")

    for w, h in TARGETS:
        out = src_dir / f"{w}x{h}"
        for s in shots:
            d = convert(s, w, h, out)
            size = subprocess.check_output(
                ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(d)]).decode()
            got = tuple(int(x) for x in size.split() if x.isdigit())
            mark = "✔" if got == (w, h) else f"✖ {got}"
            print(f"  {out.name}/{s.name}  {mark}")


if __name__ == "__main__":
    main()

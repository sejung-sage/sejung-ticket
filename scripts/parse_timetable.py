#!/usr/bin/env python3
"""
HWP 시간표 1개 파일 → JSON 칸 목록.
사용: <venv>/bin/python scripts/parse_timetable.py "<hwp경로>"
출력(stdout): [{ "room_raw":..., "teacher":..., "time_raw":..., "detail":... }, ...]
의존: pyhwp (six, olefile) — venv 필요.
표는 rowspan/colspan을 반영한 그리드 매핑으로 각 칸의 실제 열(=강의실)을 찾는다.
"""
import sys, re, html, json, subprocess, tempfile, os, glob

TIME_RE = re.compile(r"([ap]?\d{1,2}(?::\d{2})?\s*[.~\-]+\s*\d{1,2}(?::\d{2})?)")
TEACHER_RE = re.compile(r"([가-힣]{2,4})\s*T")


def hwp_to_html(path):
    d = tempfile.mkdtemp()
    hwp5html = os.path.join(os.path.dirname(sys.executable), "hwp5html")
    subprocess.run([hwp5html, "--output", d, path], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    f = glob.glob(os.path.join(d, "*.xhtml")) + glob.glob(os.path.join(d, "*.html"))
    return open(f[0], encoding="utf-8").read()


def celltext(c):
    x = re.sub(r"<[^>]+>", " ", c)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()


def parse_html(t):
    out = []
    for tb in re.findall(r"<table.*?</table>", t, re.S):
        rows = re.findall(r"<tr.*?</tr>", tb, re.S)
        if not rows:
            continue
        occupied = set()       # (row, col) filled by rowspan/colspan
        grid = {}              # (row, col) -> text (top-left of each cell)
        ncols = 0
        for ri, r in enumerate(rows):
            col = 0
            for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S):
                while (ri, col) in occupied:
                    col += 1
                attrs = re.match(r"<t[dh]([^>]*)>", c).group(1)
                rs = re.search(r'rowspan="(\d+)"', attrs)
                cs = re.search(r'colspan="(\d+)"', attrs)
                rs = int(rs.group(1)) if rs else 1
                cs = int(cs.group(1)) if cs else 1
                grid[(ri, col)] = celltext(c)
                for dr in range(rs):
                    for dc in range(cs):
                        occupied.add((ri + dr, col + dc))
                ncols = max(ncols, col + cs)
                col += cs
        headers = {col: grid.get((0, col), "") for col in range(ncols)}
        for (ri, col), txt in grid.items():
            if ri == 0 or not txt:
                continue
            room = headers.get(col, "")
            if not room:
                continue
            teacher = TEACHER_RE.findall(txt)
            if not teacher:
                continue
            time = TIME_RE.findall(txt)
            out.append({
                "room_raw": room,
                "teacher": teacher[0],
                "time_raw": time[0].replace(" ", "") if time else None,
                "detail": txt[:120],
            })
    return out


def parse(path):
    return parse_html(hwp_to_html(path))


if __name__ == "__main__":
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False))

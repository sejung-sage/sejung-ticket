#!/usr/bin/env python3
"""
HWP 시간표 1개 파일 → JSON 칸 목록.
사용: <venv>/bin/python scripts/parse_timetable.py "<hwp경로>"
출력(stdout): [{ "room_raw":..., "teacher":..., "time_raw":..., "detail":... }, ...]
의존: pyhwp (six, olefile) — venv 필요.
"""
import sys, re, html, json, subprocess, tempfile, os, glob

def hwp_to_html(path):
    d = tempfile.mkdtemp()
    # 같은 venv의 hwp5html 사용
    hwp5html = os.path.join(os.path.dirname(sys.executable), "hwp5html")
    subprocess.run([hwp5html, "--output", d, path], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    f = glob.glob(os.path.join(d, "*.xhtml")) + glob.glob(os.path.join(d, "*.html"))
    return open(f[0], encoding="utf-8").read()

def celltext(c):
    x = re.sub(r"<[^>]+>", " ", c)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()

def parse(path):
    t = hwp_to_html(path)
    out = []
    for tb in re.findall(r"<table.*?</table>", t, re.S):
        rows = [re.findall(r"<t[dh].*?</t[dh]>", r, re.S)
                for r in re.findall(r"<tr.*?</tr>", tb, re.S)]
        if not rows:
            continue
        headers = [celltext(c) for c in rows[0]]
        for r in rows[1:]:
            texts = [celltext(c) for c in r]
            for i, txt in enumerate(texts):
                if not txt or i >= len(headers) or not headers[i]:
                    continue
                # 칸에 여러 교사(설명회 등)는 첫 정규수업만; 시간 있는 칸 위주
                teacher = re.findall(r"([가-힣]{2,4})\s*T", txt)
                time = re.findall(r"([ap]?\d{1,2}(?::\d{2})?\s*[.~\-]+\s*\d{1,2}(?::\d{2})?)", txt)
                if teacher:
                    out.append({
                        "room_raw": headers[i],
                        "teacher": teacher[0],
                        "time_raw": (time[0].replace(" ", "") if time else None),
                        "detail": txt[:120],
                    })
    return out

if __name__ == "__main__":
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False))

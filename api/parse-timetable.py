# Vercel Python 서버리스 함수: HWP(시간표) 업로드 → 칸(강의실·교사·시간) JSON
from http.server import BaseHTTPRequestHandler
import json, tempfile, os, sys, glob, re, html

def celltext(c):
    x = re.sub(r"<[^>]+>", " ", c)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()

def parse_hwp(data: bytes):
    d = tempfile.mkdtemp()
    src = os.path.join(d, "in.hwp")
    with open(src, "wb") as f:
        f.write(data)
    out = tempfile.mkdtemp()
    sys.argv = ["hwp5html", "--output", out, src]
    from hwp5.hwp5html import main
    try:
        main()
    except SystemExit:
        pass
    xhtml = glob.glob(os.path.join(out, "*.xhtml")) + glob.glob(os.path.join(out, "*.html"))
    t = open(xhtml[0], encoding="utf-8").read()
    cells = []
    for tb in re.findall(r"<table.*?</table>", t, re.S):
        rows = [re.findall(r"<t[dh].*?</t[dh]>", r, re.S) for r in re.findall(r"<tr.*?</tr>", tb, re.S)]
        if not rows:
            continue
        headers = [celltext(c) for c in rows[0]]
        for r in rows[1:]:
            texts = [celltext(c) for c in r]
            for i, txt in enumerate(texts):
                if not txt or i >= len(headers) or not headers[i]:
                    continue
                teacher = re.findall(r"([가-힣]{2,4})\s*T", txt)
                time = re.findall(r"([ap]?\d{1,2}(?::\d{2})?\s*[.~\-]+\s*\d{1,2}(?::\d{2})?)", txt)
                if teacher:
                    cells.append({
                        "room_raw": headers[i],
                        "teacher": teacher[0],
                        "time_raw": time[0].replace(" ", "") if time else None,
                        "detail": txt[:120],
                    })
    return cells

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(n)
            cells = parse_hwp(data)
            body = json.dumps({"cells": cells}, ensure_ascii=False).encode("utf-8")
            code = 200
        except Exception as e:
            body = json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")
            code = 500
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

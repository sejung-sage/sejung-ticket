# Vercel Python 서버리스 함수: HWP/HWPX(시간표) 업로드 → 칸(강의실·교사·시간) JSON
# 구 HWP(바이너리 OLE)는 hwp5html→HTML 표를 rowspan/colspan 그리드로 매핑.
# HWPX(zip+OWPML XML)는 셀이 colAddr/rowAddr를 직접 가지므로 좌표로 바로 매핑.
from http.server import BaseHTTPRequestHandler
import json, tempfile, os, sys, glob, re, html, zipfile, io

TIME_RE = re.compile(r"([ap]?\d{1,2}(?::\d{2})?\s*[.~\-]+\s*\d{1,2}(?::\d{2})?)")
TEACHER_RE = re.compile(r"([가-힣]{2,4})\s*T")


def celltext(c):
    x = re.sub(r"<[^>]+>", " ", c)
    return re.sub(r"\s+", " ", html.unescape(x)).strip()


def make_cell(room, txt):
    """강의실(헤더)+칸 텍스트 → 강좌 칸. 교사 없으면 None(빈/제목 칸 제외)."""
    if not room or not txt:
        return None
    teacher = TEACHER_RE.findall(txt)
    if not teacher:
        return None
    time = TIME_RE.findall(txt)
    return {
        "room_raw": room,
        "teacher": teacher[0],
        "time_raw": time[0].replace(" ", "") if time else None,
        "detail": txt[:120],
    }


def parse_html(t):
    out = []
    for tb in re.findall(r"<table.*?</table>", t, re.S):
        rows = re.findall(r"<tr.*?</tr>", tb, re.S)
        if not rows:
            continue
        occupied = set()
        grid = {}
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
            if ri == 0:
                continue
            cell = make_cell(headers.get(col, ""), txt)
            if cell:
                out.append(cell)
    return out


def parse_hwpx_xml(xml):
    out = []
    for tb in re.findall(r"<hp:tbl\b.*?</hp:tbl>", xml, re.S):
        headers = {}
        cells = {}
        for tc in re.findall(r"<hp:tc\b.*?</hp:tc>", tb, re.S):
            addr = re.search(r'<hp:cellAddr[^>]*colAddr="(\d+)"[^>]*rowAddr="(\d+)"', tc)
            if not addr:
                continue
            col, row = int(addr.group(1)), int(addr.group(2))
            span = re.search(r'<hp:cellSpan[^>]*colSpan="(\d+)"', tc)
            cspan = int(span.group(1)) if span else 1
            txt = celltext(" ".join(re.findall(r"<hp:t\b[^>]*>(.*?)</hp:t>", tc, re.S)))
            if row == 0:
                for c in range(col, col + cspan):
                    headers[c] = txt
            else:
                cells[(row, col)] = txt
        for (row, col), txt in cells.items():
            cell = make_cell(headers.get(col, ""), txt)
            if cell:
                out.append(cell)
    return out


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
    return parse_html(open(xhtml[0], encoding="utf-8").read())


def parse_hwpx(data: bytes):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
    xml = "".join(z.read(n).decode("utf-8") for n in names)
    return parse_hwpx_xml(xml)


def parse(data: bytes):
    # HWPX는 zip(PK\x03\x04), 구 HWP는 OLE 복합문서 → 시그니처로 분기
    return parse_hwpx(data) if data[:2] == b"PK" else parse_hwp(data)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(n)
            cells = parse(data)
            body = json.dumps({"cells": cells}, ensure_ascii=False).encode("utf-8")
            code = 200
        except Exception as e:
            body = json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")
            code = 500
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

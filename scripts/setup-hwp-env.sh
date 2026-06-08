#!/usr/bin/env bash
# HWP 시간표 파싱용 파이썬 환경 (pyhwp). 1회 실행.
# 사용: bash scripts/setup-hwp-env.sh  → 이후 PYHWP_PY=$PWD/.hwpenv/bin/python
set -e
python3 -m venv .hwpenv
.hwpenv/bin/pip install --quiet pyhwp six olefile
echo "✅ .hwpenv 준비됨. import 실행:"
echo "   PYHWP_PY=\$PWD/.hwpenv/bin/python node --env-file=.env.local scripts/import-timetable.mjs"

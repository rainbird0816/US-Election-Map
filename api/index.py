"""Vercel Python(서버리스) 진입점 — FastAPI ASGI 앱을 그대로 노출.
프론트는 Vercel 정적 호스팅(frontend/dist), /api/* 는 이 함수로 rewrite(vercel.json).

런타임에서 이 파일은 /var/task/index.py 로 평탄화되고(api/ 접두어 제거),
includeFiles 의 backend/** 는 /var/task/backend/** 에 놓인다. 위치가 환경마다
다를 수 있어 backend/app/main.py 를 가진 디렉터리를 후보들에서 찾아 sys.path 에 넣는다.
"""
import sys
import pathlib

_here = pathlib.Path(__file__).resolve()
for _base in (_here.parent, _here.parent.parent, _here.parent.parent.parent):
    _bk = _base / "backend"
    if (_bk / "app" / "main.py").exists():
        sys.path.insert(0, str(_bk))
        break

from app.main import app  # noqa: E402,F401  (Vercel이 ASGI `app` 감지)

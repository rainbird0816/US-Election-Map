"""Vercel Python(서버리스) 진입점 — FastAPI ASGI 앱을 그대로 노출.
프론트는 Vercel 정적 호스팅(frontend/dist), /api/* 는 이 함수로 rewrite(vercel.json).

런타임 레이아웃이 환경마다 다를 수 있어(예: /var/task/index.py + /var/task/backend),
index.py 의 모든 상위 디렉터리에서 `backend/app/main.py` 또는 `app/main.py` 를
찾아 그 디렉터리를 sys.path 에 넣는다.
"""
import sys
import pathlib

_here = pathlib.Path(__file__).resolve()
_search = [_here.parent, *_here.parents]
for _d in _search:
    for _cand in (_d / "backend", _d):
        if (_cand / "app" / "main.py").exists():
            sys.path.insert(0, str(_cand))
            break
    else:
        continue
    break

from app.main import app  # noqa: E402,F401  (Vercel이 ASGI `app` 감지)

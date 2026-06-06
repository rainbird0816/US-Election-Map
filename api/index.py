"""Vercel Python(서버리스) 진입점 — FastAPI ASGI 앱 노출.
import 실패 시, 런타임 파일시스템을 JSON 으로 반환하는 진단용 폴백 ASGI 앱을 노출한다
(/var/task 레이아웃과 backend 포함 여부 확인용).
"""
import sys
import os
import json
import pathlib
import traceback

_here = pathlib.Path(__file__).resolve()
_diag = {"__file__": str(_here), "cwd": os.getcwd()}
_found = None
for _d in [_here.parent, *_here.parents]:
    try:
        _diag[str(_d)] = sorted(os.listdir(_d))[:60]
    except Exception as e:  # noqa: BLE001
        _diag[str(_d)] = f"ERR {e}"
    for _cand in (_d / "backend", _d):
        if (_cand / "app" / "main.py").exists():
            _found = _cand
            break
    if _found:
        break

app = None
_err = None
if _found:
    sys.path.insert(0, str(_found))
    try:
        from app.main import app  # noqa: E402
    except Exception:  # noqa: BLE001
        _err = traceback.format_exc()
else:
    _err = "backend/app/main.py not found in any ancestor of __file__"

if app is None:
    _payload = json.dumps({"found": str(_found), "error": _err, "diag": _diag},
                          ensure_ascii=False, indent=2).encode("utf-8")

    async def app(scope, receive, send):  # noqa: F811  (진단용 폴백 ASGI)
        if scope["type"] != "http":
            return
        await send({"type": "http.response.start", "status": 200,
                    "headers": [(b"content-type", b"application/json; charset=utf-8")]})
        await send({"type": "http.response.body", "body": _payload})

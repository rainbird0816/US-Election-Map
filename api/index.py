"""Vercel Python(서버리스) 진입점 — FastAPI ASGI 앱 노출.

런타임 코드(app 패키지)와 DB(db/election.sqlite)는 이 파일과 같은 디렉터리(api/) 안에 둔다.
Vercel 새 Python 빌더는 함수 베이스를 api/ 로 잡고(=/var/task) 그 안의 파일만 번들하므로,
api/ 밖(backend/)에 두면 번들에 포함되지 않는다. import 실패 시 진단 폴백을 노출한다.
"""
import os
import sys
import json
import pathlib
import traceback

# 함수 베이스가 api/(=/var/task) 든 레포 루트(/var/task)든 무관하게 app 패키지를 import 할 수 있도록
# 이 파일이 있는 api/ 디렉터리를 sys.path 맨 앞에 추가(프로젝트 설정 차이로 base가 달라지는 문제 방어).
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

app = None
_err = None
try:
    from app.webapp import app  # api/app/webapp.py 의 FastAPI 인스턴스
except Exception:  # noqa: BLE001
    _err = traceback.format_exc()

if app is None:
    _here = pathlib.Path(__file__).resolve()
    _diag = {"__file__": str(_here), "cwd": os.getcwd()}
    for _d in [_here.parent, *_here.parents][:3]:
        try:
            _diag[str(_d)] = sorted(os.listdir(_d))[:60]
        except Exception as e:  # noqa: BLE001
            _diag[str(_d)] = f"ERR {e}"
    _payload = json.dumps({"error": _err, "diag": _diag}, ensure_ascii=False, indent=2).encode("utf-8")

    async def app(scope, receive, send):  # noqa: F811  (진단용 폴백 ASGI)
        if scope["type"] != "http":
            return
        await send({"type": "http.response.start", "status": 500,
                    "headers": [(b"content-type", b"application/json; charset=utf-8")]})
        await send({"type": "http.response.body", "body": _payload})

# us-election-map — 미국 대통령선거 결과 지도 (P1)

대통령선거(1976–2024)를 **주(state) 단위 선거인단(EC) 지도**로 보는 로컬 실행형 웹 앱.
한국 선거 앱(korea-election-map) 골격을 fork·적응. FastAPI + SQLite + React/Vite + react-simple-maps.

## P1 완성 범위 (DoD 충족)

- ✅ 50개 주 + DC choropleth (승자 정당색: 빨강=공화 / 파랑=민주)
- ✅ **EC 합계 바** (민주/공화 선거인단, 270 당선 기준선) — 1976~2024 실제 결과와 일치 검증
- ✅ 연도 셀렉터 (1976~2024, 13개 사이클)
- ✅ 주 클릭 → 우측 패널: **후보별 득표 + 카운티별 결과 + 역대 대선 추이·승자**

## 데이터 소스

| 데이터 | 소스 | 범위 |
|---|---|---|
| 주별 대선 | MIT Election Lab (HuggingFace 미러, MIT 포맷) | 1976–2020 |
| 2024 주별 | tonmcg 카운티 → 주 집계 | 2024 |
| 카운티 대선 | tonmcg GitHub | 2008–2024 (2008·2012·2016·2020·2024) |
| 선거인단(EV) | census 배분표(1970~2020) 인코딩 | 전 사이클 |
| 주 경계 | us-atlas (geoAlbersUsa) | — |

> MIT Harvard Dataverse 원본(state 1976-2024, county 2000-2024)은 guestbook 제약으로
> 직접 다운로드 불가 → HF 미러 + tonmcg 로 대체. **카운티는 2008년부터** 제공
> (2000·2004 사이클은 주 단위 결과만, 패널에 안내 표기).

## 실행

### 1) 데이터 + DB 구축 (1회)
```bash
# 백엔드 venv
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # win: .venv\Scripts\python

# 원본 다운로드 (디스크에만 저장, 모델 컨텍스트 금지)
python data_pipeline/fetch_data.py

# 스키마+시드 → 적재 → precompute
python db/init_db.py
python data_pipeline/ingest_president.py
python data_pipeline/ingest_county.py
python data_pipeline/precompute.py

# EC 합계 검증 (1976~2024 실제와 대조)
python app/electoral.py
```

### 2) 프론트 빌드 + 서버 (단일 서버 배포)
```bash
cd frontend && npm install && npm run build
cd ../backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000
# → http://localhost:8000
```

### 개발 모드 (핫리로드)
```bash
# 터미널 A
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
# 터미널 B
cd frontend && npm run dev   # http://localhost:5173 (프록시 /api → 8000)
```

## 구조
```
backend/
  app/main.py          # FastAPI: /president/{elections,map,state,history,counties}
  app/electoral.py     # EC 집계 + 1976~2024 검증
  data_pipeline/       # fetch_data / ingest_president / ingest_county / precompute
  db/                  # schema.sql, seed_parties.sql, seed_us.py(regions/EV/senate_class), init_db.py
frontend/src/
  App.jsx              # 연도 셀렉터 + EC 바 + 지도 + 상세 패널
  maps/MapUS.jsx       # 주 choropleth (geoAlbersUsa)
  components/ECBar.jsx, Legend.jsx
  pages/StateDetail.jsx, CountyPanel.jsx
```

## 검증 결과 (EC 순수 winner-take-all)
13개 사이클 모두 실제 결과와 일치. 예: 2024 R 312 / D 226, 2008 D 364 / R 174, 2000 R 271 / D 267.

## 알려진 단순화 / 다음 단계 (P2+)
- **ME/NE 선거구 분할 EC**: P1은 주 승자독식 표기. 실제 분할(2008 NE-02, 2016~2024 ME-02 등)은 P2.
- **카운티 2000·2004**: 소스 제약으로 미수록.
- 알래스카는 카운티가 아니라 하원선거구 단위 보고 → level='county'로 흡수(라벨 일반화).
- 상원/하원/주지사 탭, precinct, 타일/육각 cartogram은 후순위.

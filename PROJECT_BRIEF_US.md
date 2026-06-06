# PROJECT_BRIEF — 미국 선거 결과 지도 앱 (us-election-map) · v1

> 대통령·상원·하원·주지사 선거 결과를 지도 기반·정당색으로 한눈에 보는 로컬 실행형 웹 앱.
> 한국 선거 앱(korea-election-map) 골격을 재사용한다.

---

## 0. 확정 결정사항 (LOCKED)

- **범위: 대통령 / 상원 / 하원 / 주지사.** 시장은 제외 — 무당파 선거 다수, 표준 데이터 소스 부재, 도시는 지도를 분할하지 않음(핀 레이어가 되어 앱 구조와 불일치).
- **저장소:** 별도 리포. 한국 앱 골격을 **fork 후 적응**(FastAPI+React/Vite+SQLite+choropleth 그대로).
- **정당색:** 빨강=공화 / 파랑=민주 **고정**. 한국의 색 반전 문제 없음 → 정당 계보 테이블 불필요.
- **지도:** react-simple-maps(주/카운티/선거구는 SVG choropleth로 충분). precinct는 후순위·표.
- **방식:** 깊이 우선. **CSV·shapefile 원본은 모델 컨텍스트 금지** — 스크립트가 디스크에서 읽고 모델엔 헤더·요약만.

---

## 1. 깊이 우선 1차 마일스톤

> **슬라이스: 대통령선거 × 주(state) 단위 선거인단(EC) 지도.**

선정 이유:
- 카운티·선거구의 복잡성을 피하면서 가장 상징적인 화면(선거의 밤 지도)을 먼저 완성.
- 이 앱 고유의 난관인 **선거인단 배분 로직을 한 곳에서 먼저 검증**.
- 같은 office(대통령)가 여러 사이클 존재 → 한국 앱에서 만든 "역대 결과/추이" 지역상세 패턴 재사용.

데이터 범위: 주별 대선 결과 1976~2024 (MIT President 1976–2024).

완성 기준(DoD):
1. 50개 주 + DC choropleth가 승자 정당색으로 채색.
2. **EC 합계 집계 바**(공화/민주 선거인단 수, 270 기준선).
3. 연도(사이클) 셀렉터로 1976~2024 전환.
4. 주 클릭 → 오른쪽 패널에 **(a) 그 주의 카운티별 결과 + (b) 역대 대선 결과·정당 추이**.

데이터 제약(중요): **카운티 단위 대선 결과는 2000~2024만** 존재(MIT County Presidential 2000–2024). 따라서 카운티 패널은 2000년 이후 사이클에서만 채워지고, 1976~1996은 "주 단위 결과만 제공"으로 표기. 또 **알래스카는 카운티가 아니라 하원선거구 단위, 일부 뉴잉글랜드 주는 town 단위**로 보고 → 패널에서 단위 라벨을 동적으로 표시.

P1 단순화: **메인(ME)·네브래스카(NE)의 선거구별 EC 분할은 P1에선 주 단위 승자독식으로 표기만** 하고, 정밀 분할 배분은 P2로 미룬다.

---

## 2. 선거 구조 (단위·주기)

| 선거 | 주기 | 규모/특징 | 지도 단위 | 고유 처리 |
|---|---|---|---|---|
| 대통령 | 4년 | EC 538, 270 당선. 주 승자독식(ME·NE 예외) | 주(+카운티) | EC 배분 로직 |
| 상원 | 6년(staggered) | 100석, 주당 2석, 2년마다 ~1/3(Class I/II/III) | 주 | "이번 사이클 미선거 주" 상태 |
| 하원 | 2년 | 435석, 인구비례 선거구 | 선거구 | 10년 재획정 → census vintage |
| 주지사 | 대개 4년(NH·VT 2년) | 50개 주 | 주 | 없음(주 단위로 깔끔) |

현재 판세(2026-06 기준, 119대 의회): 공화 단일정부. 상원 53–47, 하원 공화 근소 다수(공석·보궐로 변동). 다음 분기점은 **2026년 11월 중간선거**(미실시).

---

## 3. 데이터 소스

- **MIT Election Lab (MEDSL)** — 표준 소스. 카운티 대선 2000–2024, 하원 1976–2024, 상원 statewide 1976–2020, 선거구 단위 1976~, precinct 2016~. 포맷 .tab/.csv, **FIPS 코드로 경계와 조인**.
- **Census TIGER/Line shapefile** — 주·카운티·하원 선거구 경계 공식 출처.
- **tonmcg GitHub** — 카운티 대선 2008–2024 정제본, 프로토타입에 편리.
- **각 주 국무장관실(Secretary of State)** — 최신 확정치.
- 한계: precinct 경계 정합성은 한국과 동일한 난점. 2026 중간선거는 미실시.

---

## 4. 데이터 모델 (한국 대비 델타)

공통 재사용: `elections / parties / candidates / results / regions / elected_seats / region_election_summary`.

미국 변경·추가:
- `parties`: 계보 불필요. R/D/I + 군소, 고정 `color_hex`.
- `regions.level` ∈ (`state`,`county`,`cd`); `fips` 컬럼; `cd`는 `census_vintage`(예: 2020) 보유.
- **`electoral_votes(state, cycle_year, ev)`** — census마다 변동하는 주별 선거인단 수.
- **`senate_class(state, senate_class)`** — 의석이 어느 사이클에 up인지(I/II/III).

---

## 5. 지도 전략

| 단위 | 라이브러리 | 비고 |
|---|---|---|
| 주(50+DC) | react-simple-maps / D3 | 대선 EC·상원·주지사 |
| 카운티(~3,100) | react-simple-maps / D3 | 대선 카운티 채색(무거움→줌 주의) |
| 하원 선거구(435) | react-simple-maps / D3 | census vintage별 경계 |
| precinct | (지도 X) 표·리스트 | 2016~ 만 |

EC 지도는 **면적이 아니라 의석 수**가 중요 → 후순위로 타일/육각 cartogram 옵션 고려(작은 주가 안 보이는 문제 완화).

---

## 6. 화면 구성

- **메인:** 선거 종류 탭(대선/상원/하원/주지사) + 연도 셀렉터. 대선일 때 상단에 **EC 합계 바(270 기준선)**.
- **주 상세(오른쪽 패널):** ①**카운티별 결과**(선택 사이클; 정렬·득표차 표시, 선택적으로 그 주만의 카운티 미니 choropleth) ②역대 결과·정당 추이 ③그 주의 현직(상원 2석·주지사·하원 의석들).
- **선거 개관:** 사전 예측 / 최종 집계(RCP·538류 집계 인용) / 결과 / 분석 4섹션.

---

## 7. P1 착수 순서 (난이도·토큰)

원칙은 한국 브리프와 동일: 싼 토대 먼저, 원본 데이터는 컨텍스트 금지, 각 단계 = CLI 한 세션 + 검증 산출물.

| 순서 | 단계 | 난이도 | 토큰 | 검증 |
|---|---|---|---|---|
| **S1** | 스키마 + 시드(R/D/I색, 50주 regions, electoral_votes, senate_class) | 낮음 | 낮음 | `parties`·`electoral_votes` 조회됨 |
| **S2** | 한국 골격 fork·적응(스캐폴딩) | 낮음 | 낮음 | `/health` 200, 빈 화면 |
| **S3** | 적재(MIT president 1976–2024, 주 단위) | 중간 | **주의** | `results` 주별 행수 확인 |
| **S4** | precompute(주별 승자/추이) | 낮음 | 낮음 | `region_election_summary` 채워짐 |
| **S5** | **EC 집계 로직**(주 승자→EV 합산, ME/NE 단순화) | 중간 | 낮음 | 1976~2024 EC 합계가 실제와 일치 |
| **S6** | 주 choropleth + EC 바 + 연도 셀렉터 | **높음** | 주의 | 51개 채색 + EC 합계 표시 |
| **S7** | 주 상세(역대 추이) | 높음 | 중간 | 주 클릭 시 역대 대선 표시 |
| **S8** | 카운티 적재(2000–2024) + 우측 카운티 결과 패널 | 중간 | **주의** | 주 클릭 시 그 주 카운티 목록·결과 표시 |

S6은 한국과 동일하게 **목 데이터로 렌더 먼저** 검증 후 실데이터 연결.
S8 메모: 카운티 결과는 우선 **표/리스트**(가벼움). 주별 카운티 미니 지도는 그 주 카운티만(수십~250개) 렌더하므로 SVG로 충분 — 전국 카운티(~3,100) 동시 렌더와 혼동 금지. 적재 시 알래스카(하원선거구)·뉴잉글랜드(town) 단위 차이를 `results.level`/라벨로 흡수.

---

## 8. 폴더 구조 (한국 골격 재사용)

```
us-election-map/                # 별도 리포 (korea-election-map fork)
├─ backend/
│  ├─ app/                      # FastAPI (한국 골격 + EC 엔드포인트)
│  ├─ data_pipeline/            # MIT/Census 적재 스크립트
│  └─ db/                       # election.sqlite, schema.sql
├─ frontend/src/{pages,components,maps}/
└─ data/{raw,geo}/              # MIT .csv, TIGER shapefile (git 제외/LFS)
```

---

## 9. 시작 코드 (미국 고유분만)

> 공통 골격(ingest/precompute/api/map/region-detail)은 **한국 브리프 §9를 FIPS·state로 치환**해 재사용. 여기엔 미국 고유분만 둔다.

### 스키마 델타 — `backend/db/schema_us.sql`
```sql
-- regions: fips + census vintage 추가
ALTER TABLE regions ADD COLUMN fips TEXT;
ALTER TABLE regions ADD COLUMN census_vintage INTEGER;  -- cd에만 사용

CREATE TABLE electoral_votes (
  state TEXT, cycle_year INTEGER, ev INTEGER,
  PRIMARY KEY(state, cycle_year)
);
CREATE TABLE senate_class (
  state TEXT, senate_class TEXT CHECK(senate_class IN ('I','II','III')),
  PRIMARY KEY(state, senate_class)
);

-- 정당: 고정색 (계보 없음)
INSERT INTO parties(name, color_hex) VALUES
  ('Republican','#D32F2F'), ('Democratic','#1565C0'), ('Independent','#7E57C2');
```

### EC 집계 — `backend/app/electoral.py`
```python
"""주별 승자 -> 선거인단 합산. ME/NE 분할은 TODO(P2)."""
SPLITTERS = {"ME", "NE"}   # 선거구 분할 주

def electoral_total(state_winners: dict, ev_by_state: dict) -> dict:
    """state_winners: {state: party}, ev_by_state: {state: ev}"""
    totals = {}
    for state, party in state_winners.items():
        if state in SPLITTERS:
            # TODO(P2): at-large 2 + CD별 1 분할 배분. P1은 주 승자독식 표기만.
            pass
        ev = ev_by_state.get(state, 0)
        totals[party] = totals.get(party, 0) + ev
    return totals   # 예: {"Democratic": 306, "Republican": 232}

# /map 응답에 EC 합계를 함께 실어 프론트 상단 바로 렌더
```

> 나머지(`schema.sql` 본체, `ingest.py`, `precompute.py`, `main.py`, `MapKorea.jsx`→`MapUS.jsx`, `RegionDetail.jsx`)는 한국 §9 스켈레톤에서 `region_code`→`fips`, 시도→state로 바꿔 옮긴다.

---

## 10. 리스크

1. **ME/NE 선거구 분할 EC** 정밀화(P2).
2. **하원 선거구 census vintage** 매핑(2024=2020 census, 중간 재획정 주 존재) — P3 최대 난관.
3. **precinct 경계** 정합성.
4. **상원 staggered** 표현("이번 사이클 미선거" 상태).

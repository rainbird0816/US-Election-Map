-- us-election-map · DB schema (P1)
-- 적용: python backend/db/init_db.py
-- 한국 골격(elections/parties/candidates/results/regions/elected_seats/region_election_summary)
-- 을 FIPS·state 로 치환. 미국 고유: electoral_votes / senate_class, regions.fips/census_vintage.

PRAGMA foreign_keys = ON;

-- 선거 회차 (대선/상원/하원/주지사)
CREATE TABLE IF NOT EXISTS elections (
  id            INTEGER PRIMARY KEY,
  type          TEXT CHECK(type IN ('president','senate','house','governor')),
  name          TEXT,                 -- 예: '2024 Presidential Election'
  cycle_year    INTEGER,              -- 선거 연도 (셀렉터 키)
  election_date TEXT                  -- 'YYYY-MM-DD'
);

-- 정당 (고정색, 계보 없음 — 한국의 색 반전 문제 없음)
CREATE TABLE IF NOT EXISTS parties (
  id         INTEGER PRIMARY KEY,
  name       TEXT,                    -- 'Democratic' / 'Republican' / 'Independent' / 'Other'
  abbr       TEXT,                    -- 'DEM' / 'REP' / 'IND' / 'OTH'
  color_hex  TEXT
);

-- 지역 (state / county / cd)
CREATE TABLE IF NOT EXISTS regions (
  code           TEXT PRIMARY KEY,    -- state=2자리 FIPS, county=5자리 FIPS, cd=...
  name           TEXT,
  level          TEXT CHECK(level IN ('state','county','cd')),
  parent_code    TEXT,                -- county/cd 의 상위 state FIPS
  fips           TEXT,                -- FIPS 코드(조인용)
  state_po       TEXT,                -- 주 약칭 (AL, AK, ...) — geo 속성 매칭
  census_vintage INTEGER             -- cd 에만 사용 (예: 2020)
);

-- 후보
CREATE TABLE IF NOT EXISTS candidates (
  id          INTEGER PRIMARY KEY,
  election_id INTEGER,
  office      TEXT,                   -- 'president' 등
  region_code TEXT,                   -- 출마 지역(주) FIPS
  name        TEXT,
  party_id    INTEGER,
  is_elected  INTEGER DEFAULT 0,
  FOREIGN KEY(election_id) REFERENCES elections(id),
  FOREIGN KEY(party_id)    REFERENCES parties(id)
);

-- 개표 결과 (state/county/cd 단위)
CREATE TABLE IF NOT EXISTS results (
  id           INTEGER PRIMARY KEY,
  election_id  INTEGER,
  level        TEXT CHECK(level IN ('state','county','cd')),
  region_code  TEXT,
  candidate_id INTEGER,
  votes        INTEGER,
  vote_rate    REAL,
  FOREIGN KEY(election_id)  REFERENCES elections(id),
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

-- "역대 당선자" 빠른 조회
CREATE TABLE IF NOT EXISTS elected_seats (
  region_code  TEXT,
  election_id  INTEGER,
  office       TEXT,
  candidate_id INTEGER
);

-- 지역 상세 가속용 precompute (역대 결과 추이)
CREATE TABLE IF NOT EXISTS region_election_summary (
  region_code         TEXT,
  election_id         INTEGER,
  office              TEXT,
  winner_candidate_id INTEGER,
  winner_party_id     INTEGER,
  winner_rate         REAL,
  turnout             REAL,
  top_parties_json    TEXT
);

-- ── 미국 고유 ──
-- census 마다 변동하는 주별 선거인단 수
CREATE TABLE IF NOT EXISTS electoral_votes (
  state      TEXT,          -- 주 약칭 (AL ...)
  cycle_year INTEGER,
  ev         INTEGER,
  PRIMARY KEY(state, cycle_year)
);

-- 상원 의석이 어느 사이클에 up 인지 (I/II/III)
CREATE TABLE IF NOT EXISTS senate_class (
  state        TEXT,
  senate_class TEXT CHECK(senate_class IN ('I','II','III')),
  PRIMARY KEY(state, senate_class)
);

-- 역대 대선(1789-1972) 주별 승리정당 — '역대 대선' 페이지 지도 전용.
-- 정규 파이프라인(region_election_summary)이 담당하는 1976+ 와 분리. 적재: ingest_president_history.py.
CREATE TABLE IF NOT EXISTS hist_pres_state (
  cycle_year   INTEGER,
  region_code  TEXT,          -- state FIPS
  state_po     TEXT,
  state_name   TEXT,
  winner_party TEXT,          -- 'Republican'/'Democratic'/'Democratic-Republican'/'Federalist'/'Whig'/'Other'
  top1_rate    REAL,          -- 1위 후보 득표율(있을 때) — 격차 농도용
  top2_rate    REAL,
  ev           INTEGER,       -- 그 주의 선거인단(분할 합)
  total_votes  INTEGER,
  PRIMARY KEY (cycle_year, region_code)
);

CREATE INDEX IF NOT EXISTS idx_results_lookup ON results(election_id, level, region_code);
CREATE INDEX IF NOT EXISTS idx_seats_region   ON elected_seats(region_code);
CREATE INDEX IF NOT EXISTS idx_summary_region ON region_election_summary(region_code);
CREATE INDEX IF NOT EXISTS idx_summary_elec   ON region_election_summary(election_id, office);
CREATE INDEX IF NOT EXISTS idx_cand_election  ON candidates(election_id, region_code);
CREATE INDEX IF NOT EXISTS idx_ev_year        ON electoral_votes(cycle_year);
CREATE INDEX IF NOT EXISTS idx_hist_year      ON hist_pres_state(cycle_year);

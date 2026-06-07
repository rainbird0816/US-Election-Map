-- 정당: 고정색 (계보 없음). 빨강=공화 / 파랑=민주 고정.
-- id 고정: ingest 스크립트가 party_simplified -> id 매핑에 사용.
INSERT OR IGNORE INTO parties(id, name, abbr, color_hex) VALUES
  (1, 'Democratic',  'DEM', '#1565C0'),
  (2, 'Republican',  'REP', '#D32F2F'),
  (3, 'Independent', 'IND', '#7E57C2'),
  (4, 'Other',       'OTH', '#9E9E9E');

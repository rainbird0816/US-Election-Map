"""역대 주지사(건국/성립~현재) 수집 -> data/raw/governors_hist.csv.

소스: Wikipedia "List of governors of <State>" 각 주 메인 표.
  표의 'Party' 열은 임기별로 정확(Wikidata P102 의 평생 다정당 노이즈를 피함).
  컬럼 이름으로 No./Governor/Term/Party 열을 동적 탐지(주마다 이미지 열 수가 달라 인덱스 고정 불가).

산출 CSV: state_po, fips, ordinal, name, party_code, party_raw, start_year, end_year
  - 같은 ordinal 의 여러 행(재선)은 start=min/end=max 로 병합.
  - 'Incumbent'/'present' 는 end_year 공란(현직).

실행: python backend/data_pipeline/fetch_governors.py
"""
import csv
import io
import re
import sys
import time
import pathlib
import requests
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "data" / "raw" / "governors_hist.csv"
UA = {"User-Agent": "us-election-map/1.0 (research; rainbird0816@gmail.com)"}

# (fips, po, name) — DC 제외(주지사 없음). seed_us.py STATES 와 동일.
STATES = [
    ("01", "AL", "Alabama"), ("02", "AK", "Alaska"), ("04", "AZ", "Arizona"),
    ("05", "AR", "Arkansas"), ("06", "CA", "California"), ("08", "CO", "Colorado"),
    ("09", "CT", "Connecticut"), ("10", "DE", "Delaware"), ("12", "FL", "Florida"),
    ("13", "GA", "Georgia"), ("15", "HI", "Hawaii"), ("16", "ID", "Idaho"),
    ("17", "IL", "Illinois"), ("18", "IN", "Indiana"), ("19", "IA", "Iowa"),
    ("20", "KS", "Kansas"), ("21", "KY", "Kentucky"), ("22", "LA", "Louisiana"),
    ("23", "ME", "Maine"), ("24", "MD", "Maryland"), ("25", "MA", "Massachusetts"),
    ("26", "MI", "Michigan"), ("27", "MN", "Minnesota"), ("28", "MS", "Mississippi"),
    ("29", "MO", "Missouri"), ("30", "MT", "Montana"), ("31", "NE", "Nebraska"),
    ("32", "NV", "Nevada"), ("33", "NH", "New Hampshire"), ("34", "NJ", "New Jersey"),
    ("35", "NM", "New Mexico"), ("36", "NY", "New York"), ("37", "NC", "North Carolina"),
    ("38", "ND", "North Dakota"), ("39", "OH", "Ohio"), ("40", "OK", "Oklahoma"),
    ("41", "OR", "Oregon"), ("42", "PA", "Pennsylvania"), ("44", "RI", "Rhode Island"),
    ("45", "SC", "South Carolina"), ("46", "SD", "South Dakota"), ("47", "TN", "Tennessee"),
    ("48", "TX", "Texas"), ("49", "UT", "Utah"), ("50", "VT", "Vermont"),
    ("51", "VA", "Virginia"), ("53", "WA", "Washington"), ("54", "WV", "West Virginia"),
    ("55", "WI", "Wisconsin"), ("56", "WY", "Wyoming"),
]

# 정당 정규화: 앞단어 매칭 우선순위. 미매칭은 OTH.
PARTY_MAP = [
    ("democratic-republican", "DR"), ("national republican", "NR"),
    ("democratic", "DEM"), ("republican", "REP"), ("whig", "WHG"),
    ("federalist", "FED"), ("anti-masonic", "AM"), ("anti-administration", "AA"),
    ("pro-administration", "PA"), ("jacksonian", "JAC"), ("adams", "ADM"),
    ("know nothing", "KN"), ("american", "KN"), ("populist", "POP"),
    ("people's", "POP"), ("progressive", "PROG"), ("prohibition", "PROH"),
    ("union", "UNI"), ("independent", "IND"), ("nonpartisan", "NP"),
    ("farmer", "FL"), ("readjuster", "READ"), ("liberal", "LIB"),
    ("constitutional union", "CU"), ("greenback", "GB"), ("silver", "SLV"),
    ("democrat", "DEM"), ("republican", "REP"),   # catch-all: 'Jackson Democrat' 등
]


def party_code(raw):
    s = (raw or "").lower()
    for key, code in PARTY_MAP:
        if key in s:
            return code
    return "OTH"


def clean_name(cell):
    # "Peter Hardeman Burnett (1807–1895) [5][6]" -> "Peter Hardeman Burnett"
    s = re.sub(r"\[[^\]]*\]", "", str(cell))
    s = re.split(r"\s*\(", s)[0]
    return s.strip()


def years(term):
    s = str(term)
    incumbent = bool(re.search(r"incumbent|present", s, re.I))
    ys = [int(y) for y in re.findall(r"\b(1[6-9]\d\d|20\d\d)\b", s)]
    if not ys:
        return None, None, incumbent
    start = ys[0]
    end = None if incumbent else (ys[-1] if len(ys) >= 2 else ys[0])
    return start, end, incumbent


def pick_table(tables):
    """Party + Term 열을 모두 가진 표 중 행이 가장 많은 것(=주지사 메인 표)."""
    best, best_score = None, -1
    for t in tables:
        cols = [str(c) for c in t.columns]
        has_party = any(c == "Party" or c.startswith("Party") for c in cols)
        has_term = any("Term" in c for c in cols)
        if has_party and has_term and len(t) > best_score:
            best, best_score = t, len(t)
    return best


def col(cols, pred):
    for c in cols:
        if pred(str(c)):
            return c
    return None


def name_col(t):
    """'Governor*' 열 중 실제 이름 텍스트가 가장 많이 든 열.
    이미지 하위열은 전부 NaN → NaN 이 max() 를 오염시키지 않도록 '유효값 개수'로 점수."""
    cands = [c for c in t.columns if str(c).startswith("Governor")]
    if not cands:
        return None
    def score(c):
        s = t[c].astype(str)
        return int(((s != "nan") & (s.str.len() > 3)).sum())
    return max(cands, key=score)


def parse_state(po, fips, name):
    title = f"List_of_governors_of_{name.replace(' ', '_')}"
    url = f"https://en.wikipedia.org/wiki/{title}"
    html = requests.get(url, headers=UA, timeout=60).text
    tables = pd.read_html(io.StringIO(html))
    t = pick_table(tables)
    if t is None:
        print(f"  !! {po}: 표 탐지 실패 (tables={len(tables)})")
        return []
    cols = list(t.columns)
    c_no = col(cols, lambda c: c == "No." or c.startswith("No"))
    c_term = col(cols, lambda c: "Term" in c)
    c_party = col(cols, lambda c: c == "Party" or c.startswith("Party"))
    c_name = name_col(t)
    if not (c_term and c_party and c_name):
        print(f"  !! {po}: 열 매핑 실패 no={c_no} term={c_term} party={c_party} name={c_name}")
        return []

    # ordinal 별 병합
    merged = {}  # key -> dict
    seq = 0
    for _, row in t.iterrows():
        nm = clean_name(row[c_name])
        if not nm or nm.lower() in ("vacant", "nan"):
            continue
        st, en, inc = years(row[c_term])
        if st is None:
            continue
        praw = re.sub(r"\[[^\]]*\]", "", str(row[c_party])).strip()
        ordv = str(row[c_no]).strip() if c_no else ""
        ordn = re.sub(r"[^\d]", "", ordv)
        key = (ordn or f"s{seq}", nm)
        seq += 1
        if key in merged:
            m = merged[key]
            m["start"] = min(m["start"], st)
            if inc:
                m["end"] = None
            elif m["end"] is not None and en is not None:
                m["end"] = max(m["end"], en)
        else:
            merged[key] = {"ord": ordn, "name": nm, "praw": praw,
                           "code": party_code(praw), "start": st,
                           "end": (None if inc else en)}
    rows = sorted(merged.values(), key=lambda r: (r["start"], r["ord"] or "0"))
    return [(po, fips, r["ord"], r["name"], r["code"], r["praw"], r["start"], r["end"])
            for r in rows]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    allrows = []
    summary = []
    for fips, po, name in STATES:
        try:
            rows = parse_state(po, fips, name)
        except Exception as e:
            print(f"  !! {po} ({name}): {e}")
            rows = []
        allrows.extend(rows)
        oth = sum(1 for r in rows if r[4] == "OTH")
        summary.append((po, len(rows), oth))
        print(f"  {po} {name}: {len(rows)} terms (OTH={oth})")
        time.sleep(0.5)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["state_po", "fips", "ordinal", "name", "party_code", "party_raw", "start_year", "end_year"])
        w.writerows(allrows)
    print(f"\n총 {len(allrows)} terms -> {OUT}")
    low = [s for s in summary if s[1] < 5]
    if low:
        print("이상(행<5):", low)
    tot_oth = sum(s[2] for s in summary)
    print(f"OTH(미분류 정당) 총 {tot_oth}")


if __name__ == "__main__":
    main()

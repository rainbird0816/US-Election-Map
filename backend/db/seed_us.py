"""regions(50주+DC) + electoral_votes(사이클별) + senate_class 시드.
EV 는 census 배분 기간별로 인코딩. 각 사이클 합계가 538인지 자체 검증.
실행: init_db.py 가 호출 (단독: python backend/db/seed_us.py).
"""
import sqlite3
import pathlib
import sys

DB = pathlib.Path(__file__).parent / "election.sqlite"

# 주 FIPS(2자리) / 약칭 / 이름
STATES = [
    ("01", "AL", "Alabama"), ("02", "AK", "Alaska"), ("04", "AZ", "Arizona"),
    ("05", "AR", "Arkansas"), ("06", "CA", "California"), ("08", "CO", "Colorado"),
    ("09", "CT", "Connecticut"), ("10", "DE", "Delaware"),
    ("11", "DC", "District of Columbia"), ("12", "FL", "Florida"),
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

# 선거인단(EV) = 하원 의석 + 2 (상원). DC = 3. census 배분 기간별.
# 기간 매핑: 1970→1976,1980 / 1980→1984,1988 / 1990→1992,1996,2000 /
#           2000→2004,2008 / 2010→2012,2016,2020 / 2020→2024
EV_1970 = {  # 1976, 1980
    "AL": 9, "AK": 3, "AZ": 6, "AR": 6, "CA": 45, "CO": 7, "CT": 8, "DE": 3,
    "DC": 3, "FL": 17, "GA": 12, "HI": 4, "ID": 4, "IL": 26, "IN": 13, "IA": 8,
    "KS": 7, "KY": 9, "LA": 10, "ME": 4, "MD": 10, "MA": 14, "MI": 21, "MN": 10,
    "MS": 7, "MO": 12, "MT": 4, "NE": 5, "NV": 3, "NH": 4, "NJ": 17, "NM": 4,
    "NY": 41, "NC": 13, "ND": 3, "OH": 25, "OK": 8, "OR": 6, "PA": 27, "RI": 4,
    "SC": 8, "SD": 4, "TN": 10, "TX": 26, "UT": 4, "VT": 3, "VA": 12, "WA": 9,
    "WV": 6, "WI": 11, "WY": 3,
}
EV_1980 = {  # 1984, 1988
    "AL": 9, "AK": 3, "AZ": 7, "AR": 6, "CA": 47, "CO": 8, "CT": 8, "DE": 3,
    "DC": 3, "FL": 21, "GA": 12, "HI": 4, "ID": 4, "IL": 24, "IN": 12, "IA": 8,
    "KS": 7, "KY": 9, "LA": 10, "ME": 4, "MD": 10, "MA": 13, "MI": 20, "MN": 10,
    "MS": 7, "MO": 11, "MT": 4, "NE": 5, "NV": 4, "NH": 4, "NJ": 16, "NM": 5,
    "NY": 36, "NC": 13, "ND": 3, "OH": 23, "OK": 8, "OR": 7, "PA": 25, "RI": 4,
    "SC": 8, "SD": 3, "TN": 11, "TX": 29, "UT": 5, "VT": 3, "VA": 12, "WA": 10,
    "WV": 6, "WI": 11, "WY": 3,
}
EV_1990 = {  # 1992, 1996, 2000
    "AL": 9, "AK": 3, "AZ": 8, "AR": 6, "CA": 54, "CO": 8, "CT": 8, "DE": 3,
    "DC": 3, "FL": 25, "GA": 13, "HI": 4, "ID": 4, "IL": 22, "IN": 12, "IA": 7,
    "KS": 6, "KY": 8, "LA": 9, "ME": 4, "MD": 10, "MA": 12, "MI": 18, "MN": 10,
    "MS": 7, "MO": 11, "MT": 3, "NE": 5, "NV": 4, "NH": 4, "NJ": 15, "NM": 5,
    "NY": 33, "NC": 14, "ND": 3, "OH": 21, "OK": 8, "OR": 7, "PA": 23, "RI": 4,
    "SC": 8, "SD": 3, "TN": 11, "TX": 32, "UT": 5, "VT": 3, "VA": 13, "WA": 11,
    "WV": 5, "WI": 11, "WY": 3,
}
EV_2000 = {  # 2004, 2008
    "AL": 9, "AK": 3, "AZ": 10, "AR": 6, "CA": 55, "CO": 9, "CT": 7, "DE": 3,
    "DC": 3, "FL": 27, "GA": 15, "HI": 4, "ID": 4, "IL": 21, "IN": 11, "IA": 7,
    "KS": 6, "KY": 8, "LA": 9, "ME": 4, "MD": 10, "MA": 12, "MI": 17, "MN": 10,
    "MS": 6, "MO": 11, "MT": 3, "NE": 5, "NV": 5, "NH": 4, "NJ": 15, "NM": 5,
    "NY": 31, "NC": 15, "ND": 3, "OH": 20, "OK": 7, "OR": 7, "PA": 21, "RI": 4,
    "SC": 8, "SD": 3, "TN": 11, "TX": 34, "UT": 5, "VT": 3, "VA": 13, "WA": 11,
    "WV": 5, "WI": 10, "WY": 3,
}
EV_2010 = {  # 2012, 2016, 2020
    "AL": 9, "AK": 3, "AZ": 11, "AR": 6, "CA": 55, "CO": 9, "CT": 7, "DE": 3,
    "DC": 3, "FL": 29, "GA": 16, "HI": 4, "ID": 4, "IL": 20, "IN": 11, "IA": 6,
    "KS": 6, "KY": 8, "LA": 8, "ME": 4, "MD": 10, "MA": 11, "MI": 16, "MN": 10,
    "MS": 6, "MO": 10, "MT": 3, "NE": 5, "NV": 6, "NH": 4, "NJ": 14, "NM": 5,
    "NY": 29, "NC": 15, "ND": 3, "OH": 18, "OK": 7, "OR": 7, "PA": 20, "RI": 4,
    "SC": 9, "SD": 3, "TN": 11, "TX": 38, "UT": 6, "VT": 3, "VA": 13, "WA": 12,
    "WV": 5, "WI": 10, "WY": 3,
}
EV_2020 = {  # 2024
    "AL": 9, "AK": 3, "AZ": 11, "AR": 6, "CA": 54, "CO": 10, "CT": 7, "DE": 3,
    "DC": 3, "FL": 30, "GA": 16, "HI": 4, "ID": 4, "IL": 19, "IN": 11, "IA": 6,
    "KS": 6, "KY": 8, "LA": 8, "ME": 4, "MD": 10, "MA": 11, "MI": 15, "MN": 10,
    "MS": 6, "MO": 10, "MT": 4, "NE": 5, "NV": 6, "NH": 4, "NJ": 14, "NM": 5,
    "NY": 28, "NC": 16, "ND": 3, "OH": 17, "OK": 7, "OR": 8, "PA": 19, "RI": 4,
    "SC": 9, "SD": 3, "TN": 11, "TX": 40, "UT": 6, "VT": 3, "VA": 13, "WA": 12,
    "WV": 4, "WI": 10, "WY": 3,
}

EV_BY_CYCLE = {
    1976: EV_1970, 1980: EV_1970,
    1984: EV_1980, 1988: EV_1980,
    1992: EV_1990, 1996: EV_1990, 2000: EV_1990,
    2004: EV_2000, 2008: EV_2000,
    2012: EV_2010, 2016: EV_2010, 2020: EV_2010,
    2024: EV_2020,
}

# 상원 클래스(주별 보유 2개). DC 제외.
SENATE_CLASS = {
    "AL": (2, 3), "AK": (2, 3), "AZ": (1, 3), "AR": (2, 3), "CA": (1, 3),
    "CO": (2, 3), "CT": (1, 3), "DE": (1, 2), "FL": (1, 3), "GA": (2, 3),
    "HI": (1, 3), "ID": (2, 3), "IL": (2, 3), "IN": (1, 3), "IA": (2, 3),
    "KS": (2, 3), "KY": (2, 3), "LA": (2, 3), "ME": (1, 2), "MD": (1, 3),
    "MA": (1, 2), "MI": (1, 2), "MN": (1, 2), "MS": (1, 2), "MO": (1, 3),
    "MT": (1, 2), "NE": (1, 2), "NV": (1, 3), "NH": (2, 3), "NJ": (1, 2),
    "NM": (1, 2), "NY": (1, 3), "NC": (2, 3), "ND": (1, 3), "OH": (1, 3),
    "OK": (2, 3), "OR": (2, 3), "PA": (1, 3), "RI": (1, 2), "SC": (2, 3),
    "SD": (2, 3), "TN": (1, 2), "TX": (1, 2), "UT": (1, 3), "VT": (1, 3),
    "VA": (1, 2), "WA": (1, 3), "WV": (1, 2), "WI": (1, 3), "WY": (1, 2),
}
ROMAN = {1: "I", 2: "II", 3: "III"}


def verify_ev():
    """각 사이클 EV 합계 == 538, 모든 주 포함 확인."""
    pos = {po for _, po, _ in STATES}
    ok = True
    for cycle in sorted(EV_BY_CYCLE):
        table = EV_BY_CYCLE[cycle]
        total = sum(table.values())
        missing = pos - set(table)
        extra = set(table) - pos
        flag = "OK" if (total == 538 and not missing and not extra) else "FAIL"
        if flag == "FAIL":
            ok = False
        print(f"  EV {cycle}: total={total} {flag}"
              + (f" missing={missing}" if missing else "")
              + (f" extra={extra}" if extra else ""))
    return ok


def seed(con):
    cur = con.cursor()
    # regions: 50주 + DC
    cur.execute("DELETE FROM regions WHERE level='state'")
    for fips, po, name in STATES:
        cur.execute(
            "INSERT OR REPLACE INTO regions(code, name, level, parent_code, fips, state_po, census_vintage) "
            "VALUES (?,?,?,?,?,?,?)",
            (fips, name, "state", None, fips, po, None),
        )
    # electoral_votes
    cur.execute("DELETE FROM electoral_votes")
    for cycle, table in EV_BY_CYCLE.items():
        for po, ev in table.items():
            cur.execute("INSERT OR REPLACE INTO electoral_votes(state, cycle_year, ev) VALUES (?,?,?)",
                        (po, cycle, ev))
    # senate_class
    cur.execute("DELETE FROM senate_class")
    for po, classes in SENATE_CLASS.items():
        for c in classes:
            cur.execute("INSERT OR REPLACE INTO senate_class(state, senate_class) VALUES (?,?)",
                        (po, ROMAN[c]))
    con.commit()


def main():
    print("EV 사이클별 합계 검증:")
    if not verify_ev():
        print("EV 검증 실패 — 시드 중단", file=sys.stderr)
        sys.exit(1)
    con = sqlite3.connect(DB)
    seed(con)
    n_states = con.execute("SELECT COUNT(*) FROM regions WHERE level='state'").fetchone()[0]
    n_ev = con.execute("SELECT COUNT(*) FROM electoral_votes").fetchone()[0]
    n_sc = con.execute("SELECT COUNT(*) FROM senate_class").fetchone()[0]
    print(f"regions(state): {n_states}  electoral_votes: {n_ev}  senate_class: {n_sc}")
    con.close()


if __name__ == "__main__":
    main()

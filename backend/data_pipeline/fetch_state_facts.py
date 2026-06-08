"""주 정적정보(수도·면적·성립연도·주기 파일) -> data/raw/state_facts.csv.

수도(P36)·면적(P2046, km²)·주기 이미지(P41)는 Wikidata 에서 정확히 수집.
성립연도(연방 가입)는 정설값을 코드에 하드코딩(주별 고정 사실).
면적은 sq mi 로 변환(미국 관례). DC 는 주가 아니어서 성립연도 None.

실행: python backend/data_pipeline/fetch_state_facts.py
"""
import csv
import sys
import pathlib
import requests

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "data" / "raw" / "state_facts.csv"
UA = {"User-Agent": "us-election-map/1.0 (research; rainbird0816@gmail.com)"}
EP = "https://query.wikidata.org/sparql"
KM2_TO_SQMI = 0.386102

# po -> (fips, name). DC 포함. seed_us.py STATES + DC.
PO_META = {
    "AL": ("01", "Alabama"), "AK": ("02", "Alaska"), "AZ": ("04", "Arizona"),
    "AR": ("05", "Arkansas"), "CA": ("06", "California"), "CO": ("08", "Colorado"),
    "CT": ("09", "Connecticut"), "DE": ("10", "Delaware"), "DC": ("11", "District of Columbia"),
    "FL": ("12", "Florida"), "GA": ("13", "Georgia"), "HI": ("15", "Hawaii"),
    "ID": ("16", "Idaho"), "IL": ("17", "Illinois"), "IN": ("18", "Indiana"),
    "IA": ("19", "Iowa"), "KS": ("20", "Kansas"), "KY": ("21", "Kentucky"),
    "LA": ("22", "Louisiana"), "ME": ("23", "Maine"), "MD": ("24", "Maryland"),
    "MA": ("25", "Massachusetts"), "MI": ("26", "Michigan"), "MN": ("27", "Minnesota"),
    "MS": ("28", "Mississippi"), "MO": ("29", "Missouri"), "MT": ("30", "Montana"),
    "NE": ("31", "Nebraska"), "NV": ("32", "Nevada"), "NH": ("33", "New Hampshire"),
    "NJ": ("34", "New Jersey"), "NM": ("35", "New Mexico"), "NY": ("36", "New York"),
    "NC": ("37", "North Carolina"), "ND": ("38", "North Dakota"), "OH": ("39", "Ohio"),
    "OK": ("40", "Oklahoma"), "OR": ("41", "Oregon"), "PA": ("42", "Pennsylvania"),
    "RI": ("44", "Rhode Island"), "SC": ("45", "South Carolina"), "SD": ("46", "South Dakota"),
    "TN": ("47", "Tennessee"), "TX": ("48", "Texas"), "UT": ("49", "Utah"),
    "VT": ("50", "Vermont"), "VA": ("51", "Virginia"), "WA": ("53", "Washington"),
    "WV": ("54", "West Virginia"), "WI": ("55", "Wisconsin"), "WY": ("56", "Wyoming"),
}

# 연방 가입(성립) 연도 — 정설값. DC 는 주가 아님(None).
ADMITTED = {
    "DE": 1787, "PA": 1787, "NJ": 1787, "GA": 1788, "CT": 1788, "MA": 1788,
    "MD": 1788, "SC": 1788, "NH": 1788, "VA": 1788, "NY": 1788, "NC": 1789,
    "RI": 1790, "VT": 1791, "KY": 1792, "TN": 1796, "OH": 1803, "LA": 1812,
    "IN": 1816, "MS": 1817, "IL": 1818, "AL": 1819, "ME": 1820, "MO": 1821,
    "AR": 1836, "MI": 1837, "FL": 1845, "TX": 1845, "IA": 1846, "WI": 1848,
    "CA": 1850, "MN": 1858, "OR": 1859, "KS": 1861, "WV": 1863, "NV": 1864,
    "NE": 1867, "CO": 1876, "ND": 1889, "SD": 1889, "MT": 1889, "WA": 1889,
    "ID": 1890, "WY": 1890, "UT": 1896, "OK": 1907, "NM": 1912, "AZ": 1912,
    "AK": 1959, "HI": 1959,
}

QUERY = """
SELECT ?iso ?capitalLabel ?area ?flag WHERE {
  ?state wdt:P300 ?iso . FILTER(STRSTARTS(?iso,"US-"))
  OPTIONAL { ?state wdt:P36 ?capital. }
  OPTIONAL { ?state wdt:P2046 ?area. }
  OPTIONAL { ?state wdt:P41 ?flag. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def fetch():
    r = requests.get(EP, params={"query": QUERY, "format": "json"}, headers=UA, timeout=60)
    out = {}
    for b in r.json()["results"]["bindings"]:
        po = b["iso"]["value"][3:]
        if po not in PO_META:
            continue
        # area 가 여러 값이면 최대(총면적) 채택
        area = float(b["area"]["value"]) if "area" in b else None
        prev = out.get(po)
        if prev and area and prev.get("area_km2") and area < prev["area_km2"]:
            area = prev["area_km2"]
        flag = b.get("flag", {}).get("value", "")
        flag_file = flag.split("/")[-1] if flag else f"Flag_of_{PO_META[po][1].replace(' ', '_')}.svg"
        out[po] = {
            "capital": b.get("capitalLabel", {}).get("value", ""),
            "area_km2": area,
            "flag_file": requests.utils.unquote(flag_file),
        }
    return out


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wd = fetch()
    rows = []
    for po, (fips, name) in PO_META.items():
        w = wd.get(po, {})
        area_km2 = w.get("area_km2")
        area_sqmi = round(area_km2 * KM2_TO_SQMI) if area_km2 else ""
        rows.append([fips, po, name, w.get("capital", ""), ADMITTED.get(po, ""),
                     area_sqmi, w.get("flag_file", f"Flag_of_{name.replace(' ', '_')}.svg")])
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["fips", "po", "name", "capital", "admitted_year", "area_sqmi", "flag_file"])
        wr.writerows(rows)
    miss = [r[1] for r in rows if not r[3] or not r[5]]
    print(f"{len(rows)} states -> {OUT}")
    if miss:
        print("정보 누락:", miss)
    for r in rows[:5]:
        print(" ", r)


if __name__ == "__main__":
    main()

"""역대 대통령(47대) 정적 데이터 -> frontend/src/content/presidents_admin.js 생성.

초상화 파일명은 Wikidata(P18)에서 정확히 수집(오타 방지), 한글명·정당·임기연도는 하드코딩 병합.
'그해 현역 대통령' 조회용으로 start_year 기준(같은 해 교체 시 start 가 큰 쪽 채택).

실행: python backend/data_pipeline/gen_presidents_admin.py
"""
import sys
import json
import pathlib
import requests

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "frontend" / "src" / "content" / "presidents_admin.js"
UA = {"User-Agent": "us-election-map/1.0 (research; rainbird0816@gmail.com)"}
EP = "https://query.wikidata.org/sparql"

# 서수 -> (ko, party_code, start, end). end=None 은 현직.
ADMIN = {
    1: ("조지 워싱턴", "IND", 1789, 1797), 2: ("존 애덤스", "FED", 1797, 1801),
    3: ("토머스 제퍼슨", "DR", 1801, 1809), 4: ("제임스 매디슨", "DR", 1809, 1817),
    5: ("제임스 먼로", "DR", 1817, 1825), 6: ("존 퀸시 애덤스", "DR", 1825, 1829),
    7: ("앤드루 잭슨", "DEM", 1829, 1837), 8: ("마틴 밴 뷰런", "DEM", 1837, 1841),
    9: ("윌리엄 헨리 해리슨", "WHG", 1841, 1841), 10: ("존 타일러", "WHG", 1841, 1845),
    11: ("제임스 K. 포크", "DEM", 1845, 1849), 12: ("재커리 테일러", "WHG", 1849, 1850),
    13: ("밀러드 필모어", "WHG", 1850, 1853), 14: ("프랭클린 피어스", "DEM", 1853, 1857),
    15: ("제임스 뷰캐넌", "DEM", 1857, 1861), 16: ("에이브러햄 링컨", "REP", 1861, 1865),
    17: ("앤드루 존슨", "DEM", 1865, 1869), 18: ("율리시스 S. 그랜트", "REP", 1869, 1877),
    19: ("러더퍼드 B. 헤이스", "REP", 1877, 1881), 20: ("제임스 A. 가필드", "REP", 1881, 1881),
    21: ("체스터 A. 아서", "REP", 1881, 1885), 22: ("그로버 클리블랜드", "DEM", 1885, 1889),
    23: ("벤저민 해리슨", "REP", 1889, 1893), 24: ("그로버 클리블랜드", "DEM", 1893, 1897),
    25: ("윌리엄 매킨리", "REP", 1897, 1901), 26: ("시어도어 루스벨트", "REP", 1901, 1909),
    27: ("윌리엄 H. 태프트", "REP", 1909, 1913), 28: ("우드로 윌슨", "DEM", 1913, 1921),
    29: ("워런 G. 하딩", "REP", 1921, 1923), 30: ("캘빈 쿨리지", "REP", 1923, 1929),
    31: ("허버트 후버", "REP", 1929, 1933), 32: ("프랭클린 D. 루스벨트", "DEM", 1933, 1945),
    33: ("해리 S. 트루먼", "DEM", 1945, 1953), 34: ("드와이트 D. 아이젠하워", "REP", 1953, 1961),
    35: ("존 F. 케네디", "DEM", 1961, 1963), 36: ("린든 B. 존슨", "DEM", 1963, 1969),
    37: ("리처드 닉슨", "REP", 1969, 1974), 38: ("제럴드 포드", "REP", 1974, 1977),
    39: ("지미 카터", "DEM", 1977, 1981), 40: ("로널드 레이건", "REP", 1981, 1989),
    41: ("조지 H. W. 부시", "REP", 1989, 1993), 42: ("빌 클린턴", "DEM", 1993, 2001),
    43: ("조지 W. 부시", "REP", 2001, 2009), 44: ("버락 오바마", "DEM", 2009, 2017),
    45: ("도널드 트럼프", "REP", 2017, 2021), 46: ("조 바이든", "DEM", 2021, 2025),
    47: ("도널드 트럼프", "REP", 2025, None),
}

QUERY = """
SELECT ?ord ?personLabel ?img WHERE {
  ?person p:P39 ?st. ?st ps:P39 wd:Q11696.
  ?st pq:P1545 ?ord.
  OPTIONAL { ?person wdt:P18 ?img. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def fetch_imgs():
    import re
    r = requests.get(EP, params={"query": QUERY, "format": "json"}, headers=UA, timeout=60)
    out = {}
    for b in r.json()["results"]["bindings"]:
        o = re.sub(r"[^0-9]", "", b["ord"]["value"])
        if not o or not (1 <= int(o) <= 47):
            continue
        o = int(o)
        nm = b["personLabel"]["value"]
        img = requests.utils.unquote(b.get("img", {}).get("value", "").split("/")[-1])
        if o not in out and nm and not nm.startswith("Q"):
            out[o] = (nm, img)
    return out


def main():
    imgs = fetch_imgs()
    items = []
    for n in sorted(ADMIN):
        ko, party, start, end = ADMIN[n]
        en, img = imgs.get(n, ("", ""))
        items.append({"n": n, "ko": ko, "en": en, "party": party,
                      "start": start, "end": end, "img": img})
    body = ",\n  ".join(json.dumps(it, ensure_ascii=False) for it in items)
    js = (
        "// 역대 미국 대통령(47대). gen_presidents_admin.py 가 생성 — 직접 수정 금지.\n"
        "// 초상화: Wikimedia Special:FilePath. 그해 현역 = start 가 가장 큰(<=연도) 항목.\n"
        "// 정당색·한글은 content/parties.js(PARTY) 사용.\n"
        "export const POTUS_ADMIN = [\n  " + body + ",\n];\n\n"
        "// 주어진 연도의 현역 대통령(가장 최근 취임).\n"
        "export function presidentAt(year) {\n"
        "  let cur = null;\n"
        "  for (const p of POTUS_ADMIN) {\n"
        "    if (p.start <= year && (p.end == null || year <= p.end)) cur = p;\n"
        "  }\n"
        "  return cur;\n"
        "}\n"
    )
    OUT.write_text(js, encoding="utf-8")
    miss = [it["n"] for it in items if not it["img"]]
    print(f"{len(items)} presidents -> {OUT}")
    if miss:
        print("초상화 누락:", miss)


if __name__ == "__main__":
    main()

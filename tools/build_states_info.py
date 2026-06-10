"""state_base.py + aug_*.json 병합 → frontend/src/content/states_info.js 생성.
인구순위(popRank)·면적순위(areaRank)는 50개 주 기준으로 여기서 계산(DC 제외, null).
실행: python tools/build_states_info.py"""
import json, pathlib, sys, re
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from state_base import BASE, CAP_EN

_PERSON = re.compile(r"^(.*?)\s*\((.*)\)\s*$")
def split_person(s):
    m = _PERSON.match(s)
    return (m.group(1).strip(), m.group(2).strip()) if m else (s.strip(), "")

def biling(ko_list, en_list):
    """['요세미티 국립공원'] + ['Yosemite NP'] → ['요세미티 국립공원 (Yosemite NP)']."""
    out = []
    for i, k in enumerate(ko_list):
        e = en_list[i].strip() if i < len(en_list) and en_list[i] else ""
        out.append(f"{k} ({e})" if e and e != k else k)
    return out

def biling_obj(objs):
    """[{ko, en}] → ['한글 (English)']."""
    out = []
    for o in objs or []:
        k = o.get("ko", ""); e = (o.get("en") or "").strip()
        out.append(f"{k} ({e})" if e and e != k else k)
    return out

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUG_DIR = ROOT / "tools"
OUT = ROOT / "frontend" / "src" / "content" / "states_info.js"

# aug_*.json 병합
aug = {}
missing = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"aug_{tag}.json"
    if not p.exists():
        missing.append(tag); continue
    data = json.loads(p.read_text(encoding="utf-8"))
    aug.update(data)
if missing:
    print("경고: 누락된 aug 배치", missing)

# 역대 인구조사(census_*.json) 병합: {fips: {연도: 인구}}
census = {}
cmiss = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"census_{tag}.json"
    if not p.exists():
        cmiss.append(tag); continue
    data = json.loads(p.read_text(encoding="utf-8"))
    for f, m in data.items():
        census[f] = {int(y): int(v) for y, v in m.items()}
if cmiss:
    print("경고: 누락된 census 배치", cmiss)

# 랜드마크 분류·주요도시(geo_*.json) 병합: {fips: {cats:[...], cities:[...]}}
geo = {}
gmiss = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"geo_{tag}.json"
    if not p.exists():
        gmiss.append(tag); continue
    geo.update(json.loads(p.read_text(encoding="utf-8")))
if gmiss:
    print("경고: 누락된 geo 배치", gmiss)

# 영문 병기(en_*.json): {fips: {peopleEn, nationalParksEn, stateParksEn, teamsEn, landmarksEn, citiesEn}}
en = {}
emiss = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"en_{tag}.json"
    if not p.exists():
        emiss.append(tag); continue
    en.update(json.loads(p.read_text(encoding="utf-8")))
if emiss:
    print("경고: 누락된 en 배치", emiss)

# 정제(clean_*.json): 검증된 인물·주립공원으로 덮어쓰기. {fips:{people:{field:[{ko,en,note}]}, stateParks:[{ko,en}]}}
clean = {}
clmiss = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"clean_{tag}.json"
    if not p.exists():
        clmiss.append(tag); continue
    clean.update(json.loads(p.read_text(encoding="utf-8")))
if clmiss:
    print("경고: 누락된 clean 배치(미정제 → en 폴백)", clmiss)

# 주기 변천(flag_hist_*.json): {fips: {flags:[{from,to,file,label}]}}
flaghist = {}
fmiss = []
for tag in "ABCDEFG":
    p = AUG_DIR / f"flag_hist_{tag}.json"
    if not p.exists():
        fmiss.append(tag); continue
    flaghist.update(json.loads(p.read_text(encoding="utf-8")))
if fmiss:
    print("경고: 누락된 flag_hist 배치", fmiss)

# EV 타임라인(ev_by_year.json): {fips: {연도: ev}}
ev_path = AUG_DIR / "ev_by_year.json"
ev_by = {}
if ev_path.exists():
    ev_by = {f: {int(y): v for y, v in m.items()} for f, m in
             json.loads(ev_path.read_text(encoding="utf-8")).items()}
else:
    print("경고: ev_by_year.json 없음 — python tools/dump_ev.py 먼저 실행")

# 기반 + 리서치 병합
rec = {}
for fips, b in BASE.items():
    a = aug.get(fips, {})
    cen = census.get(fips, {})
    g = geo.get(fips, {})
    e = en.get(fips, {})
    cats = g.get("cats", [])
    lm_en = e.get("landmarksEn", [])
    # 랜드마크: 분류(cat)·영문(en) 부착
    lms = a.get("landmarks", [])
    landmarks = [{**lm, "cat": (cats[i] if i < len(cats) else "관광체험"),
                  "en": (lm_en[i] if i < len(lm_en) else None)}
                 for i, lm in enumerate(lms)]
    # 주요 도시: 영문 부착
    city_en = e.get("citiesEn", [])
    cities = [{**c, "en": (city_en[i] if i < len(city_en) else None)}
              for i, c in enumerate(g.get("cities", []))]
    # 주요 인물: 정제본(clean) 우선, 없으면 aug+en 구조화
    cl = clean.get(fips, {})
    if cl.get("people"):
        people = {field: [{"ko": p.get("ko"), "en": p.get("en"), "note": p.get("note", "")}
                          for p in arr]
                  for field, arr in cl["people"].items()}
    else:
        people_en = e.get("peopleEn", {})
        people = {}
        for field, arr in a.get("people", {}).items():
            ens = people_en.get(field, [])
            people[field] = [
                {"ko": (sp := split_person(s))[0], "en": (ens[i] if i < len(ens) else None), "note": sp[1]}
                for i, s in enumerate(arr)]
    evy = ev_by.get(fips, {})
    flags = sorted(flaghist.get(fips, {}).get("flags", []), key=lambda x: x["from"])
    rec[fips] = {
        "po": b["po"], "ko": b["ko"], "en": b["en"],
        "cap": b["cap"], "capEn": CAP_EN.get(fips),
        "adm": b["adm"], "order": b["order"], "area": b["area"], "ev": b["ev"],
        "evByYear": {str(y): evy[y] for y in sorted(evy)},
        "pop": a.get("pop2020"),
        "census": {str(y): cen[y] for y in sorted(cen)},
        "people": people,
        "nationalParks": biling(a.get("nationalParks", []), e.get("nationalParksEn", [])),
        "stateParks": (biling_obj(cl["stateParks"]) if cl.get("stateParks") is not None
                       else biling(a.get("stateParks", []), e.get("stateParksEn", []))),
        "teams": {lg: biling(ts, e.get("teamsEn", {}).get(lg, []))
                  for lg, ts in a.get("teams", {}).items()},
        "landmarks": landmarks,
        "cities": cities,
        "flags": flags,
    }

# census 2020 = pop2020 정합성 검증
for f in rec:
    c2020 = census.get(f, {}).get(2020)
    p2020 = rec[f]["pop"]
    if c2020 and p2020 and c2020 != p2020:
        print(f"  ⚠ {rec[f]['po']} census2020={c2020} ≠ pop2020={p2020}")

CENSUS_YEARS = sorted({y for m in census.values() for y in m})
EV_YEARS = sorted({y for m in ev_by.values() for y in m})

# 순위 계산: 50개 주(order != None)만, DC 제외
states50 = [f for f in rec if rec[f]["order"] is not None]
by_pop = sorted([f for f in states50 if rec[f]["pop"]], key=lambda f: rec[f]["pop"], reverse=True)
for i, f in enumerate(by_pop, 1):
    rec[f]["popRank"] = i
by_area = sorted(states50, key=lambda f: rec[f]["area"], reverse=True)
for i, f in enumerate(by_area, 1):
    rec[f]["areaRank"] = i
for f in rec:
    rec[f].setdefault("popRank", None)
    rec[f].setdefault("areaRank", None)

# 검증 로그
no_pop = [rec[f]["po"] for f in rec if rec[f]["pop"] is None]
no_lm = [rec[f]["po"] for f in rec if not rec[f]["landmarks"]]
no_cen = [rec[f]["po"] for f in rec if not rec[f]["census"]]
no_city = [rec[f]["po"] for f in rec if not rec[f]["cities"]]
no_ev = [rec[f]["po"] for f in rec if not rec[f]["evByYear"]]
bad_cat = [rec[f]["po"] for f in rec if len(geo.get(f, {}).get("cats", [])) != len(rec[f]["landmarks"]) and rec[f]["landmarks"]]
print(f"주 {len(rec)}개 · 인구누락 {no_pop} · 랜드마크누락 {no_lm} · census누락 {no_cen}")
no_flag = [rec[f]["po"] for f in rec if not rec[f]["flags"]]
multi_flag = sum(1 for f in rec if len(rec[f]["flags"]) > 1)
print(f"도시누락 {no_city} · EV누락 {no_ev} · cats길이불일치 {bad_cat}")
print(f"주기누락 {no_flag} · 변천(2기+) {multi_flag}개 주")
print(f"인물·공원 정제 적용: {len(clean)}개 주")
print(f"census 연도: {CENSUS_YEARS}")
print(f"EV 연도: {EV_YEARS[0]}~{EV_YEARS[-1]} ({len(EV_YEARS)}개)")

body = json.dumps(rec, ensure_ascii=False, indent=2)
OUT.write_text(
    "// AUTO-GENERATED by tools/build_states_info.py — 손으로 수정하지 말 것.\n"
    "// 기반 facts: tools/state_base.py · 리서치: tools/aug_*.json · 역대인구: tools/census_*.json\n"
    "// 랜드마크 분류·도시: tools/geo_*.json · EV타임라인: tools/ev_by_year.json(dump_ev.py)\n"
    "// 면적순위는 50개 주 기준(빌드 시 계산). 인구순위·EV는 연도별로 프런트에서 계산.\n"
    f"export const CENSUS_YEARS = {json.dumps(CENSUS_YEARS)};\n"
    f"export const EV_YEARS = {json.dumps(EV_YEARS)};\n"
    f"export const STATE_INFO = {body};\n",
    encoding="utf-8")
print("생성:", OUT)

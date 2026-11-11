"""의회 명단: 기준일(ref) 시점의 의석별 재직자·잔여 임기 계산.

의석 키: 상원 (주, class) / 하원 (주, 선거구). district=-1(19세기 일반명부)은 의원별 별도 의석.
회기(Congress): 73대까지 3월 4일, 74대(1935)부터 1월 3일 개원.
"""
import datetime as dt
import json
from collections import Counter

D = dt.date.fromisoformat


def cong_start(n: int) -> dt.date:
    y = 1789 + 2 * (n - 1)
    return dt.date(y, 1, 3) if n >= 74 else dt.date(y, 3, 4)


def congress_of(ref: dt.date) -> int:
    y = ref.year if ref.year % 2 == 1 else ref.year - 1
    n = (y - 1789) // 2 + 1
    return n - 1 if ref < cong_start(n) else n


def _term_end_date(y: int) -> dt.date:
    return dt.date(y, 1, 3) if y >= 1935 else dt.date(y, 3, 4)


def senate_sched_end(cls: int, start: dt.date) -> dt.date:
    """class 별 정규 임기 만료일: class c 는 (Y-1791-2(c-1)) % 6 == 0 인 해에 만료."""
    y = start.year
    while True:
        if (y - 1791 - 2 * (cls - 1)) % 6 == 0 and _term_end_date(y) > start:
            return _term_end_date(y)
        y += 1


def party_at(t, ref_iso):
    """기준일 시점 정당·교섭단체(임기 중 변경 반영)."""
    if t["affiliations"]:
        for a in json.loads(t["affiliations"]):
            if a["start"] <= ref_iso <= a["end"]:
                return a["party"], a["party_raw"], a["caucus"]
    return t["party"], t["party_raw"], t["caucus"]


# 회기 중 이임 사유(원본 congress-legislators 에는 사유가 없어 수동 기입) — bioguide → 사유
# 출처: 각 의원 사망·사임 보도(AP·Ballotpedia·Congressional Record 등). 새 이임이 생기면 여기에 추가.
DEPART_REASON = {
    "G000578": "법무장관 지명 후 사임 · 119대 취임 포기",   # Matt Gaetz (FL-1)
    "V000137": "부통령 취임으로 사임",                       # J.D. Vance (OH)
    "R000595": "국무장관 취임으로 사임",                     # Marco Rubio (FL)
    "W000823": "국가안보보좌관 취임으로 사임",               # Michael Waltz (FL-6)
    "T000489": "사망",                                       # Sylvester Turner (TX-18)
    "G000551": "사망",                                       # Raúl Grijalva (AZ-7)
    "C001078": "사망",                                       # Gerald Connolly (VA-11)
    "G000590": "사임(민간 부문 이직)",                       # Mark Green (TN-7)
    "S001207": "뉴저지 주지사 당선으로 사임",                # Mikie Sherrill (NJ-11)
    "G000596": "사임",                                       # Marjorie Taylor Greene (GA-14)
    "L000578": "사망",                                       # Doug LaMalfa (CA-1)
    "M001190": "국토안보부 장관 취임으로 사임",              # Markwayne Mullin (OK)
    "S001193": "사임(성비위 의혹·제명 압박)",                # Eric Swalwell (CA-14)
    "G000594": "사임(성비위 의혹·제명 압박)",                # Tony Gonzales (TX-23)
    "C001127": "사임(공금 유용 기소·제명 압박)",             # Sheila Cherfilus-McCormick (FL-20)
    "S001157": "사망",                                       # David Scott (GA-13)
    "G000359": "사망",                                       # Lindsey Graham (SC)
}


def seat_key(t):
    if t["chamber"] == "sen":
        return (t["state"], t["sen_class"])
    d = t["district"]
    return (t["state"], d if d != -1 else f"G:{t['bioguide']}")


def roster(con, chamber: str, ref: dt.date, last_change: str):
    n = congress_of(ref)
    c0, c1 = cong_start(n), cong_start(n + 1)
    ref_iso = ref.isoformat()
    # 이 회기와 겹치는 모든 임기
    terms = [dict(r) for r in con.execute(
        "SELECT * FROM congress_terms WHERE chamber=? AND start<? AND end>? ORDER BY start",
        (chamber, c1.isoformat(), c0.isoformat()))]
    # 선수(같은 원 첫 취임일·임기 수) — 회기 인원만 조회
    bios = sorted({t["bioguide"] for t in terms})
    first, nterms = {}, {}
    for i in range(0, len(bios), 500):
        chunk = bios[i:i + 500]
        for r in con.execute(
            f"SELECT bioguide, MIN(start) AS f, COUNT(*) AS k FROM congress_terms "
            f"WHERE chamber=? AND start<=? AND bioguide IN ({','.join('?' * len(chunk))}) GROUP BY bioguide",
            (chamber, ref_iso, *chunk)):
            first[r["bioguide"]], nterms[r["bioguide"]] = r["f"], r["k"]

    seats = {}
    for t in terms:
        seats.setdefault(seat_key(t), []).append(t)

    members, vacancies = [], []
    for key, ts in seats.items():
        started = [t for t in ts if t["start"] <= ref_iso]
        cur = next((t for t in reversed(started) if ref_iso < t["end"]), None)
        status = "serving"
        if cur is None and started:
            last = started[-1]
            # 임명직: 보궐선거일(end)이 지났어도 후임 기록 전이면 '결과 반영 대기'로 유지
            if last["how"] == "appointment" and not any(t["start"] >= last["end"] for t in ts):
                cur, status = last, "pending"
            else:
                vacancies.append({"state": key[0], "seat": key[1] if not str(key[1]).startswith("G:") else -1,
                                  "since": last["end"], "prev": last["name"], "prev_party": party_at(last, last["end"][:10])[0],
                                  "prev_reason": DEPART_REASON.get(last["bioguide"])})
                continue
        if cur is None:
            # 기준일 이후에야 첫 취임 — 그 주에 이미 재직자가 있으면 '회기 개원 시점부터 공석'
            # (예: 2025-01-03 FL-1, Gaetz 사퇴 → Patronis 4월 보궐). 아니면 신규 주 가입 전이므로 제외.
            if any(t["state"] == key[0] and t["start"] <= ref_iso < t["end"] for t in terms):
                vacancies.append({"state": key[0], "seat": key[1], "since": None,
                                  "prev": None, "prev_party": None, "next": ts[0]["name"],
                                  "next_start": ts[0]["start"]})
            continue
        party, party_raw, caucus = party_at(cur, ref_iso)
        # 회기 중 취임자: 같은 의석 직전 재직자와 이임 사유(승계 표시용)
        prev = None
        if cur["start"] > c0.isoformat():
            sk = "sen_class=?" if chamber == "sen" else "district=?"
            r = con.execute(
                f"SELECT bioguide, name, end FROM congress_terms WHERE chamber=? AND state=? AND {sk} "
                "AND end<=? AND bioguide<>? ORDER BY end DESC LIMIT 1",
                (chamber, cur["state"], cur["sen_class"] if chamber == "sen" else cur["district"],
                 cur["start"], cur["bioguide"])).fetchone()
            if r and r["end"][5:10] != "01-03" and (D(cur["start"]) - D(r["end"])).days < 400:
                prev = {"bioguide": r["bioguide"], "name": r["name"], "end": r["end"],
                        "reason": DEPART_REASON.get(r["bioguide"])}
        start = D(cur["start"])
        if cur["how"] == "appointment":
            sched = D(cur["end"])                    # 보궐선거일까지
        elif chamber == "sen" and cur["sen_class"]:
            sched = senate_sched_end(cur["sen_class"], start)
        else:
            sched = c1
        actual = D(cur["end"])
        members.append({
            "bioguide": cur["bioguide"], "name": cur["name"], "gender": cur["gender"],
            "state": cur["state"], "district": cur["district"], "sen_class": cur["sen_class"],
            "party": party, "party_raw": party_raw, "caucus": caucus,
            "start": cur["start"], "sched_end": sched.isoformat(),
            # 19세기 원본은 3월 3일 종료로 기록(계산값 3월 4일) → 며칠 차이는 정상 만료로 본다
            "left_early": cur["how"] != "appointment" and (sched - actual).days > 3,
            "actual_end": cur["end"], "how": cur["how"], "status": status,
            "remaining_days": max(0, (sched - ref).days),
            "first_start": first.get(cur["bioguide"]), "n_terms": nterms.get(cur["bioguide"], 1),
            "delegate": chamber == "rep" and cur["state"] in NON_STATES,
            "wikipedia": cur["wikipedia"], "prev": prev,
        })

    # 회기 중 변동: 회기 시작 이후 취임 / 회기 종료 전 이임
    # 19세기엔 임기 시작이 첫 회기 소집일(예: 1849-12-03)로 기록됨 → 회기 내 최빈 시작일까지는 정규 취임
    starts = Counter(t["start"] for t in terms if t["start"] >= c0.isoformat())
    convene = max(c0.isoformat(), starts.most_common(1)[0][0]) if starts else c0.isoformat()
    changes = []
    for t in terms:
        if t["start"] > convene:
            changes.append({"date": t["start"], "kind": "in", "how": t["how"], "name": t["name"],
                            "state": t["state"], "district": t["district"], "sen_class": t["sen_class"],
                            "party": party_at(t, t["start"])[0]})
        early = (c1 - D(t["end"])).days > 3
        if early and t["end"] <= last_change and t["how"] != "appointment":
            changes.append({"date": t["end"], "kind": "out", "how": None, "name": t["name"],
                            "reason": DEPART_REASON.get(t["bioguide"]),
                            "state": t["state"], "district": t["district"], "sen_class": t["sen_class"],
                            "party": party_at(t, t["end"])[0]})
        elif t["how"] == "appointment" and early:
            changes.append({"date": t["end"], "kind": "special", "how": None, "name": t["name"],
                            "state": t["state"], "district": t["district"], "sen_class": t["sen_class"],
                            "party": party_at(t, t["start"])[0]})
        # 회기 중 정당 변경
        if t["affiliations"]:
            for a in json.loads(t["affiliations"])[1:]:
                if c0.isoformat() < a["start"] < c1.isoformat():
                    changes.append({"date": a["start"], "kind": "party", "how": None, "name": t["name"],
                                    "state": t["state"], "district": t["district"],
                                    "sen_class": t["sen_class"], "party": a["party"]})
    changes.sort(key=lambda c: c["date"])

    return {
        "chamber": chamber, "ref": ref_iso, "congress": n,
        "congress_start": c0.isoformat(), "congress_end": c1.isoformat(),
        "last_change": last_change, "members": members, "vacancies": vacancies, "changes": changes,
    }


NON_STATES = {"DC", "PR", "GU", "VI", "AS", "MP", "DK", "OL", "PI"}

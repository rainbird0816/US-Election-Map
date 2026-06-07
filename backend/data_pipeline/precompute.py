"""results -> region_election_summary (모든 office: 대통령/상원/주지사=주 단위, 하원=주별 다수의석).

- president/senate/governor: results(level='state') 주별 승자(최다 득표) + top_parties_json(정당·득표).
- house: results(level='cd') 를 주별로 모아 정당별 의석수 집계 → 다수의석 정당색, top_parties_json=의석수.
turnout 은 미수집(NULL). election_id 는 office별 분리(대선=연도, 상원=1M+, 하원=2M+, 주지사=3M+).
실행: python backend/data_pipeline/precompute.py
"""
import json
import sqlite3
import pathlib
from collections import defaultdict

DB = pathlib.Path(__file__).resolve().parent.parent.parent / "api" / "db" / "election.sqlite"


def main():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    colors = {r[0]: (r[1], r[2], r[3]) for r in cur.execute("SELECT id, name, abbr, color_hex FROM parties")}
    office_of = {eid: typ for eid, typ in cur.execute("SELECT id, type FROM elections")}

    cur.execute("DELETE FROM region_election_summary")
    names = {}

    def cname(cid):
        if cid not in names:
            row = cur.execute("SELECT name FROM candidates WHERE id=?", (cid,)).fetchone()
            names[cid] = row[0] if row else "?"
        return names[cid]

    # ── 주 단위 office (president/senate/governor) ──
    by_state = defaultdict(list)
    for eid, code, cid, pid, votes, rate in cur.execute(
        """SELECT r.election_id, r.region_code, c.id, c.party_id, r.votes, r.vote_rate
           FROM results r JOIN candidates c ON c.id=r.candidate_id WHERE r.level='state'"""):
        by_state[(eid, code)].append({"cid": cid, "pid": pid, "votes": votes, "rate": rate})

    n_state = 0
    for (eid, code), lst in by_state.items():
        office = office_of.get(eid)
        if office is None:
            continue   # 보궐선거(elections 미등재, 지도 비표시) — 요약 생성 안 함, 상세는 직접 조회

        # rate 기준 정렬(주지사는 votes가 비어 있어 voteshare=rate 로만 승자 판정 가능; 타 office도 동일 결과).
        lst.sort(key=lambda x: (-(x["rate"] or 0), -(x["votes"] or 0)))
        win = lst[0]
        top = [{"party": colors.get(x["pid"], ("?",))[0], "abbr": colors.get(x["pid"], ("?", "?"))[1],
                "color": colors.get(x["pid"], (None, None, "#bbb"))[2],
                "name": cname(x["cid"]), "votes": x["votes"], "rate": x["rate"]} for x in lst[:4]]
        cur.execute(
            """INSERT INTO region_election_summary
               (region_code, election_id, office, winner_candidate_id, winner_party_id,
                winner_rate, turnout, top_parties_json) VALUES (?,?,?,?,?,?,?,?)""",
            (code, eid, office, win["cid"], win["pid"], win["rate"], None,
             json.dumps(top, ensure_ascii=False)))
        n_state += 1

    # ── 하원: 선거구(cd) → 주별 의석수 집계 ──
    seats = defaultdict(lambda: defaultdict(int))     # (eid, state)[pid] = 의석수
    for eid, cd, pid in cur.execute(
        """SELECT r.election_id, r.region_code, c.party_id
           FROM results r JOIN candidates c ON c.id=r.candidate_id
           WHERE r.level='cd' AND c.is_elected=1"""):
        seats[(eid, cd[:2])][pid] += 1

    n_house = 0
    for (eid, st), pid_seats in seats.items():
        office = office_of.get(eid, "house")
        total = sum(pid_seats.values()) or 1
        win_pid = max(pid_seats, key=lambda p: pid_seats[p])
        ranked = sorted(pid_seats.items(), key=lambda kv: -kv[1])
        top = [{"party": colors.get(p, ("?",))[0], "abbr": colors.get(p, ("?", "?"))[1],
                "color": colors.get(p, (None, None, "#bbb"))[2], "seats": s,
                "rate": round(s / total * 100, 1)} for p, s in ranked]
        cur.execute(
            """INSERT INTO region_election_summary
               (region_code, election_id, office, winner_candidate_id, winner_party_id,
                winner_rate, turnout, top_parties_json) VALUES (?,?,?,?,?,?,?,?)""",
            (st, eid, office, None, win_pid, round(pid_seats[win_pid] / total * 100, 1), None,
             json.dumps(top, ensure_ascii=False)))
        n_house += 1

    con.commit()
    print(f"region_election_summary: state-office={n_state}, house(state-agg)={n_house}")
    for office in ("president", "senate", "governor", "house"):
        rows = cur.execute(
            "SELECT COUNT(DISTINCT election_id), COUNT(*) FROM region_election_summary WHERE office=?",
            (office,)).fetchone()
        print(f"  {office}: cycles={rows[0]}, rows={rows[1]}")
    con.close()


if __name__ == "__main__":
    main()

import { useEffect, useState } from "react";
import { getStateDetail } from "../api";
import { portraitUrl } from "../content/presidents";
import { partyKo, partyColor } from "../content/parties";
import { STATE_INFO } from "../content/states_info";
import StateMap from "../maps/StateMap.jsx";

// 주기(州旗) — 로드 실패 시 숨김.
function Flag({ file, name }) {
  const [err, setErr] = useState(false);
  if (!file || err) return null;
  return (
    <img className="sf-flag" src={portraitUrl(file)} alt={`${name} 주기`}
      loading="lazy" onError={() => setErr(true)} />
  );
}

const LEAGUES = [
  { key: "MLB", ko: "야구 (MLB)" },
  { key: "NBA", ko: "농구 (NBA)" },
  { key: "NFL", ko: "미식축구 (NFL)" },
  { key: "NHL", ko: "하키 (NHL)" },
];
const nf = (n) => (n == null ? "—" : n.toLocaleString());

export default function StateFactPanel({ code, name, year, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pin, setPin] = useState(null);   // 호버 중인 랜드마크 인덱스

  useEffect(() => {
    setData(null); setError(null); setPin(null);
    getStateDetail(code).then(setData).catch((e) => setError(String(e)));
  }, [code]);

  const f = data?.state;
  const info = STATE_INFO[code];
  // 연표는 최신순(현직 먼저). 선택 연도의 현역은 강조.
  const govs = (data?.governors || []).slice().reverse();
  const isCurrent = (g) =>
    year != null && g.start_year <= year && (g.end_year == null || year <= g.end_year);

  const title = info?.ko || f?.name || name;
  const peopleFields = info ? Object.entries(info.people || {}).filter(([, v]) => v?.length) : [];
  const landmarks = info?.landmarks || [];

  return (
    <div className="state-fact">
      <button className="back-link" onClick={onBack}>← 주 목록</button>
      {error && <div className="error">불러오기 오류: {error}</div>}

      <div className="sf-head">
        <Flag file={f?.flag_file} name={title} />
        <div>
          <div className="sf-name">{title}</div>
          <div className="sf-sub">{info?.en || f?.name} · {f?.state_po || info?.po}</div>
        </div>
      </div>

      {/* ── 핵심 지표 ── */}
      <div className="sf-grid">
        <div className="sf-cell"><span>주도</span><b>{info?.cap || f?.capital || "—"}</b></div>
        <div className="sf-cell"><span>선거인단</span><b>{info?.ev ?? "—"}<i className="sf-u">표</i></b></div>
        <div className="sf-cell"><span>연방 가입</span>
          <b>{info?.adm ? `${info.adm}년` : (f?.state_po === "DC" ? "주 아님" : "—")}</b>
          {info?.order && <i className="sf-note">{info.order}번째 가입</i>}</div>
        <div className="sf-cell"><span>인구 (2020)</span>
          <b>{nf(info?.pop)}</b>
          {info?.popRank && <i className="sf-note">전국 {info.popRank}위</i>}</div>
        <div className="sf-cell"><span>면적</span>
          <b>{nf(info?.area || f?.area_sqmi)}<i className="sf-u">mi²</i></b>
          {info?.areaRank && <i className="sf-note">전국 {info.areaRank}위</i>}</div>
        <div className="sf-cell"><span>역대 주지사</span>
          <b>{data ? data.governors.length : "—"}<i className="sf-u">명</i></b></div>
      </div>

      {/* ── 지도 + 랜드마크 핀 ── */}
      {landmarks.length > 0 && (
        <section className="sf-sec">
          <div className="sf-sec-h">지도 · 주요 관광지/랜드마크</div>
          <StateMap code={code} landmarks={landmarks} active={pin} onPick={setPin} />
          <div className="sf-lm-list">
            {landmarks.map((m, i) => (
              <button key={`${m.name}-${i}`}
                className={`sf-lm${pin === i ? " on" : ""}`}
                onMouseEnter={() => setPin(i)} onMouseLeave={() => setPin(null)}>
                <span className="sf-lm-dot" />{m.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 주요 인물 ── */}
      {peopleFields.length > 0 && (
        <section className="sf-sec">
          <div className="sf-sec-h">주요 인물</div>
          <div className="sf-people">
            {peopleFields.map(([field, list]) => (
              <div key={field} className="sf-pf">
                <div className="sf-pf-h">{field}</div>
                <ul>{list.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 국립공원 · 주립공원 ── */}
      {(info?.nationalParks?.length || info?.stateParks?.length) ? (
        <section className="sf-sec">
          <div className="sf-sec-h">국립·주립공원</div>
          {info.nationalParks?.length > 0 && (
            <div className="sf-parks">
              <span className="sf-parks-lbl np">국립공원</span>
              {info.nationalParks.map((p, i) => <span key={i} className="sf-chip">{p}</span>)}
            </div>
          )}
          {info.stateParks?.length > 0 && (
            <div className="sf-parks">
              <span className="sf-parks-lbl sp">주립공원</span>
              {info.stateParks.map((p, i) => <span key={i} className="sf-chip">{p}</span>)}
            </div>
          )}
        </section>
      ) : null}

      {/* ── 프로 스포츠 ── */}
      {info?.teams && LEAGUES.some((l) => info.teams[l.key]?.length) && (
        <section className="sf-sec">
          <div className="sf-sec-h">프로 스포츠 구단</div>
          <div className="sf-teams">
            {LEAGUES.map((l) => {
              const ts = info.teams[l.key] || [];
              if (!ts.length) return null;
              return (
                <div key={l.key} className="sf-tg">
                  <div className={`sf-tg-h tg-${l.key.toLowerCase()}`}>{l.ko}</div>
                  <div className="sf-tg-list">
                    {ts.map((t, i) => <span key={i} className="sf-chip">{t}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 역대 주지사 ── */}
      <section className="sf-sec">
        <div className="sf-sec-h">역대 주지사 {f && `(${govs.length})`}</div>
        {f && f.state_po === "DC" && (
          <p className="hint">워싱턴 D.C.는 주(州)가 아니어서 주지사가 없습니다(시장이 행정 수반).</p>
        )}
        <ul className="gov-list">
          {govs.map((g, i) => (
            <li key={`${g.ordinal}-${g.start_year}-${i}`} className={isCurrent(g) ? "cur" : ""}>
              <span className="gl-yr">{g.start_year}–{g.end_year ?? "현재"}</span>
              <span className="gl-dot" style={{ background: partyColor(g.party) }} />
              <span className="gl-name">{g.governor_name}</span>
              <span className="gl-party" style={{ color: partyColor(g.party) }}>{partyKo(g.party)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

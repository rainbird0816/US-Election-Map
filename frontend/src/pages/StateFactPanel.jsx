import { useEffect, useState } from "react";
import { getStateDetail } from "../api";
import { portraitUrl } from "../content/presidents";
import { partyKo, partyColor } from "../content/parties";

// 주기(州旗) — 로드 실패 시 숨김.
function Flag({ file, name }) {
  const [err, setErr] = useState(false);
  if (!file || err) return null;
  return (
    <img className="sf-flag" src={portraitUrl(file)} alt={`${name} 주기`}
      loading="lazy" onError={() => setErr(true)} />
  );
}

export default function StateFactPanel({ code, name, year, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null); setError(null);
    getStateDetail(code).then(setData).catch((e) => setError(String(e)));
  }, [code]);

  const f = data?.state;
  // 연표는 최신순(현직 먼저). 선택 연도의 현역은 강조.
  const govs = (data?.governors || []).slice().reverse();
  const isCurrent = (g) =>
    year != null && g.start_year <= year && (g.end_year == null || year <= g.end_year);

  return (
    <div className="state-fact">
      <button className="back-link" onClick={onBack}>← 주 목록</button>
      {error && <div className="error">불러오기 오류: {error}</div>}

      <div className="sf-head">
        <Flag file={f?.flag_file} name={f?.name || name} />
        <div>
          <div className="sf-name">{f?.name || name}</div>
          <div className="sf-sub">{f?.state_po}</div>
        </div>
      </div>

      <div className="sf-grid">
        <div className="sf-cell"><span>수도</span><b>{f?.capital || "—"}</b></div>
        <div className="sf-cell"><span>연방 가입</span>
          <b>{f?.admitted_year ? `${f.admitted_year}년` : "—"}</b></div>
        <div className="sf-cell"><span>면적</span>
          <b>{f?.area_sqmi ? `${f.area_sqmi.toLocaleString()} mi²` : "—"}</b></div>
        <div className="sf-cell"><span>역대 주지사</span><b>{data ? `${data.governors.length}명` : "—"}</b></div>
      </div>

      <div className="sf-tl-title">역대 주지사 {f && `(${govs.length})`}</div>
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
    </div>
  );
}

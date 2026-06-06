// 선거인단(EC) 합계 바 — 민주 vs 공화, 270 당선 기준선.
const DEM = "#1565C0";
const REP = "#D32F2F";
const OTH = "#9E9E9E";

export default function ECBar({ ec }) {
  if (!ec) return null;
  const dem = ec.totals?.Democratic || 0;
  const rep = ec.totals?.Republican || 0;
  const oth = ec.totals?.Other || 0;
  const total = ec.total_ev || 538;
  const maj = ec.majority || 270;
  const pct = (v) => (v / total) * 100;
  const leaderName = ec.leader === "Democratic" ? "민주" : ec.leader === "Republican" ? "공화" : ec.leader;

  return (
    <div className="ec-bar-wrap">
      <div className="ec-head">
        <span className="ec-side dem">
          <b>{dem}</b> 민주
        </span>
        <span className="ec-mid">
          {ec.leader_won ? (
            <span className="ec-winner" style={{ color: ec.leader === "Democratic" ? DEM : REP }}>
              {leaderName} 당선 · {maj}석
            </span>
          ) : (
            <span className="ec-winner">{maj}석 필요</span>
          )}
        </span>
        <span className="ec-side rep">
          공화 <b>{rep}</b>
        </span>
      </div>
      <div className="ec-bar">
        <div className="seg dem" style={{ width: `${pct(dem)}%`, background: DEM }} />
        {oth > 0 && <div className="seg oth" style={{ width: `${pct(oth)}%`, background: OTH }} />}
        <div className="seg rep" style={{ width: `${pct(rep)}%`, background: REP }} />
        <div className="ec-majority" style={{ left: `${pct(maj)}%` }} title={`${maj} 당선선`} />
      </div>
      <div className="ec-foot">
        <span>총 {total} 선거인단</span>
        {oth > 0 && <span className="muted">· 기타 {oth}</span>}
      </div>
    </div>
  );
}

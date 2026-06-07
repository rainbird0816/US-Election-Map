import { ELECTION_NOTES } from "../content/elections";
import { CONGRESS_NOTES } from "../content/congress";

// 선택 사이클의 '선거 전 쟁점' + '결과 분석' 패널.
// 대통령=대선 노트, 상원/하원/주지사=의회/국가 정세 노트(짝수해). 없으면 표시 안 함.
export default function ElectionNotes({ office, cycleYear }) {
  const note = (office === "president" ? ELECTION_NOTES : CONGRESS_NOTES)[cycleYear];
  if (!note) return null;
  return (
    <section className="notes">
      <h3 className="notes-headline">{note.headline}</h3>
      <div className="notes-grid">
        <div className="notes-col">
          <h4>선거 전 주요 쟁점</h4>
          <ul className="issues">
            {note.issues.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div className="notes-col">
          <h4>결과 분석</h4>
          <p>{note.analysis}</p>
        </div>
      </div>
    </section>
  );
}

// 역대 대선 1·2위(+주목할 제3) 후보의 한글/영문 표기와 초상화.
// 선거인단·전국 득표율 등 수치는 백엔드 실데이터(/president/national)에서 가져오고,
// 여기서는 DB 의 혼재된 후보명(예: "CLINTON, HILLARY")을 깔끔한 표기로 덮어쓰는 역할만 한다.
// 초상화는 Wikimedia Commons 안정 URL(Special:FilePath). 파일명은 실제 존재를 확인했다.

const FILE = (name) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=240`;

export const portraitUrl = FILE;

// 인물 카드(연도 간 재사용). 부시·클린턴은 동명이인이라 키를 분리.
const P = {
  carter:   { ko: "지미 카터",      en: "Jimmy Carter",       img: "Jimmy_Carter.jpg" },
  ford:     { ko: "제럴드 포드",     en: "Gerald Ford",        img: "Gerald_Ford_presidential_portrait_(cropped).jpg" },
  reagan:   { ko: "로널드 레이건",   en: "Ronald Reagan",      img: "Official_Portrait_of_President_Reagan_1981.jpg" },
  mondale:  { ko: "월터 먼데일",     en: "Walter Mondale",     img: "Walter_Mondale_1977_vice_presidential_portrait.jpg" },
  bush41:   { ko: "조지 H. W. 부시", en: "George H. W. Bush",  img: "George_H._W._Bush_presidential_portrait_(cropped).jpg" },
  dukakis:  { ko: "마이클 듀카키스", en: "Michael Dukakis",    img: "Michael_Dukakis.jpg" },
  clinton:  { ko: "빌 클린턴",       en: "Bill Clinton",       img: "Bill_Clinton.jpg" },
  dole:     { ko: "밥 돌",          en: "Bob Dole",           img: "Bob_Dole,_PCCWW_photo_portrait.JPG" },
  bush43:   { ko: "조지 W. 부시",    en: "George W. Bush",     img: "George-W-Bush.jpeg" },
  gore:     { ko: "앨 고어",         en: "Al Gore",            img: "Al_Gore,_Vice_President_of_the_United_States,_official_portrait_1994.jpg" },
  kerry:    { ko: "존 케리",         en: "John Kerry",         img: "John_Kerry_official_Secretary_of_State_portrait.jpg" },
  obama:    { ko: "버락 오바마",     en: "Barack Obama",       img: "President_Barack_Obama.jpg" },
  mccain:   { ko: "존 매케인",       en: "John McCain",        img: "John_McCain_official_portrait_2009.jpg" },
  romney:   { ko: "밋 롬니",         en: "Mitt Romney",        img: "Mitt_Romney_by_Gage_Skidmore_6_cropped.jpg" },
  trump:    { ko: "도널드 트럼프",   en: "Donald Trump",       img: "Donald_Trump_official_portrait.jpg" },
  hclinton: { ko: "힐러리 클린턴",   en: "Hillary Clinton",    img: "Hillary_Clinton_official_Secretary_of_State_portrait_crop.jpg" },
  biden:    { ko: "조 바이든",       en: "Joe Biden",          img: "Joe_Biden_presidential_portrait.jpg" },
  harris:   { ko: "카멀라 해리스",   en: "Kamala Harris",      img: "Kamala_Harris_Vice_Presidential_Portrait.jpg" },
};

// 연도별 정당 대표 후보(DEM/REP) + 주목할 제3후보(있을 때).
export const POTUS = {
  1976: { DEM: P.carter,   REP: P.ford },
  1980: { DEM: P.carter,   REP: P.reagan,  third: { ko: "존 B. 앤더슨", en: "John B. Anderson", party: "무소속" } },
  1984: { DEM: P.mondale,  REP: P.reagan },
  1988: { DEM: P.dukakis,  REP: P.bush41 },
  1992: { DEM: P.clinton,  REP: P.bush41,  third: { ko: "로스 페로",   en: "Ross Perot",       party: "무소속" } },
  1996: { DEM: P.clinton,  REP: P.dole,    third: { ko: "로스 페로",   en: "Ross Perot",       party: "개혁당" } },
  2000: { DEM: P.gore,     REP: P.bush43 },
  2004: { DEM: P.kerry,    REP: P.bush43 },
  2008: { DEM: P.obama,    REP: P.mccain },
  2012: { DEM: P.obama,    REP: P.romney },
  2016: { DEM: P.hclinton, REP: P.trump },
  2020: { DEM: P.biden,    REP: P.trump },
  2024: { DEM: P.harris,   REP: P.trump },
};

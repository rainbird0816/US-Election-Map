"""역대 대선 후보 초상화 파일명 자동 추출 (Wikipedia REST summary API).

각 인물의 영문 위키 표제어로 대표 이미지(thumbnail/originalimage) URL을 받아
Commons 파일명만 추출 → 프론트는 Special:FilePath 로 안정 로드.
출력(JS 조각)을 presidents.js 에 붙여넣는다. 일회성 큐레이션 도구.

실행: python backend/data_pipeline/fetch_portraits.py > /tmp/portraits.txt
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

# key: (ko, en, wikipedia_title)
PEOPLE = {
    # 당선자
    "washington": ("조지 워싱턴", "George Washington", "George Washington"),
    "jadams": ("존 애덤스", "John Adams", "John Adams"),
    "jefferson": ("토머스 제퍼슨", "Thomas Jefferson", "Thomas Jefferson"),
    "madison": ("제임스 매디슨", "James Madison", "James Madison"),
    "monroe": ("제임스 먼로", "James Monroe", "James Monroe"),
    "jqadams": ("존 퀸시 애덤스", "John Quincy Adams", "John Quincy Adams"),
    "jackson": ("앤드루 잭슨", "Andrew Jackson", "Andrew Jackson"),
    "vanburen": ("마틴 밴 뷰런", "Martin Van Buren", "Martin Van Buren"),
    "whharrison": ("윌리엄 헨리 해리슨", "William Henry Harrison", "William Henry Harrison"),
    "polk": ("제임스 K. 포크", "James K. Polk", "James K. Polk"),
    "taylor": ("재커리 테일러", "Zachary Taylor", "Zachary Taylor"),
    "pierce": ("프랭클린 피어스", "Franklin Pierce", "Franklin Pierce"),
    "buchanan": ("제임스 뷰캐넌", "James Buchanan", "James Buchanan"),
    "lincoln": ("에이브러햄 링컨", "Abraham Lincoln", "Abraham Lincoln"),
    "grant": ("율리시스 S. 그랜트", "Ulysses S. Grant", "Ulysses S. Grant"),
    "hayes": ("러더퍼드 헤이스", "Rutherford B. Hayes", "Rutherford B. Hayes"),
    "garfield": ("제임스 가필드", "James A. Garfield", "James A. Garfield"),
    "cleveland": ("그로버 클리블랜드", "Grover Cleveland", "Grover Cleveland"),
    "bharrison": ("벤저민 해리슨", "Benjamin Harrison", "Benjamin Harrison"),
    "mckinley": ("윌리엄 매킨리", "William McKinley", "William McKinley"),
    "troosevelt": ("시어도어 루스벨트", "Theodore Roosevelt", "Theodore Roosevelt"),
    "taft": ("윌리엄 H. 태프트", "William Howard Taft", "William Howard Taft"),
    "wilson": ("우드로 윌슨", "Woodrow Wilson", "Woodrow Wilson"),
    "harding": ("워런 하딩", "Warren G. Harding", "Warren G. Harding"),
    "coolidge": ("캘빈 쿨리지", "Calvin Coolidge", "Calvin Coolidge"),
    "hoover": ("허버트 후버", "Herbert Hoover", "Herbert Hoover"),
    "fdr": ("프랭클린 D. 루스벨트", "Franklin D. Roosevelt", "Franklin D. Roosevelt"),
    "truman": ("해리 S. 트루먼", "Harry S. Truman", "Harry S. Truman"),
    "eisenhower": ("드와이트 D. 아이젠하워", "Dwight D. Eisenhower", "Dwight D. Eisenhower"),
    "kennedy": ("존 F. 케네디", "John F. Kennedy", "John F. Kennedy"),
    "lbj": ("린든 B. 존슨", "Lyndon B. Johnson", "Lyndon B. Johnson"),
    "nixon": ("리처드 닉슨", "Richard Nixon", "Richard Nixon"),
    # 차점자(당선자에 없는 인물)
    "burr": ("에런 버", "Aaron Burr", "Aaron Burr"),
    "cpinckney": ("찰스 핑크니", "Charles C. Pinckney", "Charles Cotesworth Pinckney"),
    "dclinton": ("디윗 클린턴", "DeWitt Clinton", "DeWitt Clinton"),
    "king": ("루퍼스 킹", "Rufus King", "Rufus King"),
    "clay": ("헨리 클레이", "Henry Clay", "Henry Clay"),
    "cass": ("루이스 캐스", "Lewis Cass", "Lewis Cass"),
    "scott": ("윈필드 스콧", "Winfield Scott", "Winfield Scott"),
    "fremont": ("존 C. 프리몬트", "John C. Frémont", "John C. Frémont"),
    "breckinridge": ("존 C. 브레킨리지", "John C. Breckinridge", "John C. Breckinridge"),
    "mcclellan": ("조지 매클렐런", "George B. McClellan", "George B. McClellan"),
    "seymour": ("호레이쇼 시모어", "Horatio Seymour", "Horatio Seymour"),
    "greeley": ("호러스 그릴리", "Horace Greeley", "Horace Greeley"),
    "tilden": ("새뮤얼 틸던", "Samuel J. Tilden", "Samuel J. Tilden"),
    "hancock": ("윈필드 S. 핸콕", "Winfield S. Hancock", "Winfield Scott Hancock"),
    "blaine": ("제임스 블레인", "James G. Blaine", "James G. Blaine"),
    "bryan": ("윌리엄 J. 브라이언", "William J. Bryan", "William Jennings Bryan"),
    "parker": ("올턴 파커", "Alton B. Parker", "Alton B. Parker"),
    "hughes": ("찰스 에번스 휴스", "Charles E. Hughes", "Charles Evans Hughes"),
    "cox": ("제임스 M. 콕스", "James M. Cox", "James M. Cox"),
    "davis": ("존 W. 데이비스", "John W. Davis", "John W. Davis (politician)"),
    "smith": ("앨 스미스", "Al Smith", "Al Smith"),
    "landon": ("알프 랜던", "Alf Landon", "Alf Landon"),
    "willkie": ("웬델 윌키", "Wendell Willkie", "Wendell Willkie"),
    "dewey": ("토머스 듀이", "Thomas E. Dewey", "Thomas E. Dewey"),
    "stevenson": ("애들레이 스티븐슨", "Adlai Stevenson II", "Adlai Stevenson II"),
    "goldwater": ("배리 골드워터", "Barry Goldwater", "Barry Goldwater"),
    "humphrey": ("휴버트 험프리", "Hubert Humphrey", "Hubert Humphrey"),
    "mcgovern": ("조지 맥거번", "George McGovern", "George McGovern"),
}


def commons_file(title):
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"))
    req = urllib.request.Request(url, headers={"User-Agent": "us-election-map/1.0 (curation; contact rainbird0816)"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(2 * (attempt + 1))   # 백오프
                continue
            raise
    src = (d.get("originalimage") or d.get("thumbnail") or {}).get("source")
    if not src:
        return None
    # .../commons/thumb/a/ab/File.jpg/320px-File.jpg  또는  .../commons/a/ab/File.jpg
    parts = src.split("/")
    return urllib.parse.unquote(parts[-2] if "thumb" in parts else parts[-1])


def main():
    out = pathlib.Path(__file__).resolve().parent / "portraits_out.txt"
    lines = []
    for key, (ko, en, title) in PEOPLE.items():
        try:
            f = commons_file(title)
            lines.append(f"{key}|{ko}|{en}|{f or ''}")
        except Exception as e:
            lines.append(f"{key}|{ko}|{en}|ERROR:{e}")
        time.sleep(1.0)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {len(lines)} -> {out}")


if __name__ == "__main__":
    main()

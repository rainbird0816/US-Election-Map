"""원본 데이터 다운로드 (모델 컨텍스트 금지 — 디스크에만 저장).

- 주별 대선 1976-2020: MIT Election Lab (HuggingFace 미러, MIT 포맷 CSV)
- 카운티 대선 2008-2024: tonmcg GitHub
- 2024 주별: 카운티 집계로 ingest_president.py 가 산출
- 미국 주 경계 TopoJSON: us-atlas

MIT Harvard Dataverse 원본(1976-2024 state, countypres 2000-2024)은 guestbook
제약으로 직접 다운로드 불가 → HF 미러(state 1976-2020) + tonmcg(county 2008-2024) 사용.
따라서 카운티는 2008~2024 제공(2000·2004 미수록), 주별은 1976~2024(2024는 집계).
실행: python backend/data_pipeline/fetch_data.py
"""
import urllib.request
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
RAW = ROOT / "data" / "raw"
GEO = ROOT / "frontend" / "public" / "geo"

TONMCG = "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master"
HF = "https://huggingface.co/datasets/fdaudens/us-presidential-elections/resolve/main"
# jacksonjude USA-Election-Map: 상원 1976-2020 · 하원 1976-2022 · 주지사(MIT 포맷/voteshare).
JJU = "https://raw.githubusercontent.com/jacksonjude/USA-Election-Map/master/csv-sources"
# MEDSL 2024 공식: 2024 상원 주 단위.
MEDSL24 = "https://raw.githubusercontent.com/MEDSL/2024-elections-official/main"

FILES = [
    (f"{HF}/1976-2020-president.csv", RAW / "1976-2020-president.csv"),
    (f"{TONMCG}/2016_US_County_Level_Presidential_Results.csv", RAW / "2016_county.csv"),
    (f"{TONMCG}/2020_US_County_Level_Presidential_Results.csv", RAW / "2020_county.csv"),
    (f"{TONMCG}/2024_US_County_Level_Presidential_Results.csv", RAW / "2024_county.csv"),
    (f"{TONMCG}/US_County_Level_Presidential_Results_08-16.csv", RAW / "county_08-16.csv"),
    (f"{JJU}/1976-2020-senate.csv", RAW / "1976-2020-senate.csv"),
    (f"{MEDSL24}/2024-senate-state.csv", RAW / "2024-senate-state.csv"),
    # 상원 2022(정규+보궐) 및 2024 보궐(NE — MEDSL 미수록) 보강. 실제 득표 포함.
    (f"{JJU}/past-senate.csv", RAW / "past-senate.csv"),
    (f"{JJU}/1976-2022-house.csv", RAW / "1976-2022-house.csv"),
    # 하원 2024 선거구별 실제 득표 보강.
    (f"{JJU}/past-house.csv", RAW / "past-house.csv"),
    (f"{JJU}/past-governor.csv", RAW / "past-governor.csv"),
    ("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json", GEO / "us-states-10m.json"),
    ("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json", GEO / "us-counties-10m.json"),
]


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    GEO.mkdir(parents=True, exist_ok=True)
    for url, dest in FILES:
        print(f"↓ {dest.name} …", end=" ", flush=True)
        urllib.request.urlretrieve(url, dest)
        print(f"{dest.stat().st_size:,} bytes")
    print("완료. 다음: ingest_president → ingest_county → ingest_senate → "
          "ingest_house → ingest_governor → precompute")


if __name__ == "__main__":
    main()

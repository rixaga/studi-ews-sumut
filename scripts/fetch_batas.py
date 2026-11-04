#!/usr/bin/env python3
"""Unduh batas ADM1 Indonesia (geoBoundaries gbOpen) dan simpan Sumatera Utara.

Geometri tidak diubah: satu fitur shapeName "North Sumatra" disalin apa adanya.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "batas"
GEOJSON_OUT = OUT_DIR / "sumatera_utara_adm1.geojson"
META_OUT = OUT_DIR / "sumber.json"

# Rilis gbOpen yang dikunci (commit geoBoundaries). Bukan geometri buatan.
COMMIT = "9469f09592ced973a3448cf66b6100b741b64c0d"
DOWNLOAD_URL = (
    "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/"
    f"{COMMIT}/releaseData/gbOpen/IDN/ADM1/geoBoundaries-IDN-ADM1.geojson"
)
API_URL = "https://www.geoboundaries.org/api/current/gbOpen/IDN/ADM1/"
SHAPE_NAME = "North Sumatra"


def bbox_of(geometry: dict) -> list[float]:
    lons: list[float] = []
    lats: list[float] = []

    def walk(node: object) -> None:
        if isinstance(node, list) and node and isinstance(node[0], (int, float)):
            lons.append(float(node[0]))
            lats.append(float(node[1]))
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(geometry["coordinates"])
    return [min(lons), min(lats), max(lons), max(lats)]


def main() -> int:
    print(f"mengunduh {DOWNLOAD_URL}")
    request = urllib.request.Request(DOWNLOAD_URL, headers={"User-Agent": "studi-ews-sumut"})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)

    match = None
    for feature in payload.get("features", []):
        if feature.get("properties", {}).get("shapeName") == SHAPE_NAME:
            match = feature
            break
    if match is None:
        print(f"fitur {SHAPE_NAME!r} tidak ditemukan", file=sys.stderr)
        return 1

    props = match["properties"]
    feature_out = {
        "type": "Feature",
        "properties": {
            "shapeName": props.get("shapeName"),
            "shapeISO": props.get("shapeISO"),
            "shapeID": props.get("shapeID"),
            "shapeGroup": props.get("shapeGroup"),
            "shapeType": props.get("shapeType"),
            "nama_tampil": "Sumatera Utara",
            "provinsi": "Sumatera Utara",
        },
        "geometry": match["geometry"],
    }
    collection = {
        "type": "FeatureCollection",
        "name": "sumatera_utara_adm1",
        "features": [feature_out],
    }
    box = bbox_of(match["geometry"])
    meta = {
        "nama_tampil": "Sumatera Utara",
        "shapeName": props.get("shapeName"),
        "shapeISO": props.get("shapeISO"),
        "shapeID": props.get("shapeID"),
        "penyedia": "geoBoundaries",
        "produk": "gbOpen",
        "tingkat": "ADM1",
        "negara": "IDN",
        "boundaryID": "IDN-ADM1-65028918",
        "boundaryYearRepresented": "2017",
        "buildDate": "Dec 12, 2023",
        "commit": COMMIT,
        "url_geojson": DOWNLOAD_URL,
        "url_api": API_URL,
        "lisensi": "Open Data Commons Open Database License 1.0",
        "url_lisensi": "https://opendatacommons.org/licenses/odbl/1.0/",
        "sumber_geometri": "OpenStreetMap, Wambacher",
        "atribusi": "Batas administrasi © geoBoundaries / OpenStreetMap contributors (ODbL)",
        "crs": "EPSG:4326",
        "bbox": box,
        "catatan": (
            "Satu fitur ADM1 (shapeName North Sumatra) disalin dari berkas "
            "geoBoundaries-IDN-ADM1.geojson tanpa menyederhanakan atau menggeser koordinat. "
            "Nama tampilan Sumatera Utara ditambahkan sebagai properti; geometri tidak diubah."
        ),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    GEOJSON_OUT.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    META_OUT.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"tersimpan {GEOJSON_OUT} bbox={box}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

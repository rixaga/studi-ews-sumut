#!/usr/bin/env python3
"""Bangun data/osm/sungai_sumut.geojson dari ekstrak OSM Sumatera.

Sumber: Geofabrik sumatra-latest.osm.pbf (data OpenStreetMap).
Hanya way waterway=river, stream, dan canal, dipotong ke batas provinsi.
Bukan HydroRIVERS. Berkas pbf disimpan di data/cache/osm/ dan tidak masuk git.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import osmium
from shapely.geometry import LineString, mapping, shape
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
PBF = ROOT / "data" / "cache" / "osm" / "sumatra-latest.osm.pbf"
URL = "https://download.geofabrik.de/asia/indonesia/sumatra-latest.osm.pbf"
KELUAR = ROOT / "data" / "osm" / "sungai_sumut.geojson"
JENIS = {"river": "Sungai", "canal": "Kanal", "stream": "Anak sungai"}


def pastikan_pbf() -> None:
    if PBF.exists() and PBF.stat().st_size > 1_000_000:
        return
    PBF.parent.mkdir(parents=True, exist_ok=True)
    print("unduh", URL, flush=True)
    urllib.request.urlretrieve(URL, PBF)


def provinsi():
    berkas = json.loads((ROOT / "data" / "batas" / "sumatera_utara_adm1.geojson").read_text(encoding="utf-8"))
    return unary_union([shape(fitur["geometry"]) for fitur in berkas["features"]])


class Pengumpul(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.baris: list[tuple[int, str, str, list[tuple[float, float]]]] = []

    def way(self, w) -> None:
        jenis = w.tags.get("waterway")
        if jenis not in JENIS:
            return
        try:
            titik = [(n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError:
            return
        if len(titik) < 2:
            return
        bujur = [item[0] for item in titik]
        lintang = [item[1] for item in titik]
        if max(bujur) < 96.85 or min(bujur) > 100.65 or max(lintang) < -0.85 or min(lintang) > 4.5:
            return
        self.baris.append((w.id, jenis, (w.tags.get("name") or "").strip(), titik))


def pecah(hasil) -> list[LineString]:
    if hasil.is_empty:
        return []
    if hasil.geom_type == "LineString":
        return [hasil]
    if hasil.geom_type == "MultiLineString":
        return list(hasil.geoms)
    if hasil.geom_type == "GeometryCollection":
        kumpulan: list[LineString] = []
        for bagian in hasil.geoms:
            kumpulan.extend(pecah(bagian))
        return kumpulan
    return []


def main() -> None:
    pastikan_pbf()
    batas = provinsi()
    siap = prep(batas)
    pengumpul = Pengumpul()
    pengumpul.apply_file(str(PBF), locations=True)
    fitur = []
    hitung = {nama: 0 for nama in JENIS}
    for identitas, jenis, nama, titik in pengumpul.baris:
        garis = LineString(titik)
        if not siap.intersects(garis):
            continue
        for bagian in pecah(garis.intersection(batas)):
            sederhana = LineString([(round(x, 5), round(y, 5)) for x, y in bagian.simplify(0.00005, preserve_topology=True).coords])
            if len(sederhana.coords) < 2:
                continue
            hitung[jenis] += 1
            fitur.append(
                {
                    "type": "Feature",
                    "properties": {"osm_id": identitas, "waterway": jenis, "jenis": JENIS[jenis], "nama": nama},
                    "geometry": mapping(sederhana),
                }
            )
    KELUAR.parent.mkdir(parents=True, exist_ok=True)
    KELUAR.write_text(
        json.dumps({"type": "FeatureCollection", "name": "Sungai dan anak sungai OpenStreetMap", "features": fitur}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print("jumlah", hitung, "fitur", len(fitur), "byte", KELUAR.stat().st_size)


if __name__ == "__main__":
    main()

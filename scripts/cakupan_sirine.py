#!/usr/bin/env python3
"""Hitung penduduk tercover dalam radius 1 km tiap sirine.

Metode (klasifikasi tampilan, bukan kelas resmi BNPB):
- Penduduk desa dari data/penduduk_terpapar.json digabung ke poligon desa HDX
  (data/wilayah/adm4_desa.geojson) lewat nama kabupaten, kecamatan, dan desa.
- Raster bahaya diunduh dari ImageServer InaRISK INDEKS_BAHAYA_BANJIR (EPSG:4326, ~111 m).
- Penduduk desa yang bernilai > 0 dibagi rata ke piksel desa dengan indeks >= 0,01.
- Kelas: rendah 0,01–0,333; sedang >0,333–0,666; tinggi >0,666–1,01.
- Radius 1 km dihitung di UTM zona 47N (EPSG:32647), lalu dikembalikan ke WGS84.
- Total gabungan memakai union buffer agar penduduk tidak dihitung dua kali.
"""

from __future__ import annotations

import json
import time
import urllib.request
from difflib import get_close_matches
from io import BytesIO
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask, rasterize
from rasterio.transform import from_origin
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache"
WEST, SOUTH, EAST, NORTH = 96.90, -0.90, 100.60, 4.50
RES = 0.001
LAYANAN = "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer/exportImage"


def norm(teks: str) -> str:
    import re
    import unicodedata

    mentah = unicodedata.normalize("NFKD", str(teks or "")).lower().replace("'", " ")
    mentah = re.sub(r"[^a-z0-9 ]", " ", mentah)
    mentah = re.sub(r"\s+", " ", mentah).strip()
    return re.sub(r"^(desa|kelurahan|kel|ds)\s+", "", mentah)


def kunci_kab(teks: str) -> str:
    import re

    return re.sub(r"^(kota|kabupaten|kab)\s+", "", norm(teks))


def unduh_petak(barat: float, selatan: float, timur: float, utara: float) -> np.ndarray:
    lebar = max(1, int(round((timur - barat) / RES)))
    tinggi = max(1, int(round((utara - selatan) / RES)))
    url = (
        f"{LAYANAN}?bbox={barat},{selatan},{timur},{utara}&bboxSR=4326&imageSR=4326"
        f"&size={lebar},{tinggi}&format=tiff&pixelType=F32&interpolation=RSP_NearestNeighbor&f=image"
    )
    permintaan = urllib.request.Request(url, headers={"User-Agent": "studi-ews-sumut"})
    terakhir = None
    for usaha in range(4):
        try:
            with urllib.request.urlopen(permintaan, timeout=120) as respons:
                data = respons.read()
            with rasterio.open(BytesIO(data)) as sumber:
                return sumber.read(1).astype(np.float32)
        except Exception as galat:  # noqa: BLE001 - ulang unduhan layanan
            terakhir = galat
            time.sleep(2 * (usaha + 1))
    raise RuntimeError(f"InaRISK gagal {barat},{selatan},{timur},{utara}: {terakhir}")


def muat_bahaya() -> tuple[np.ndarray, object]:
    CACHE.mkdir(parents=True, exist_ok=True)
    simpanan = CACHE / "inarisk_bahaya_sumut.npy"
    tinggi = int(round((NORTH - SOUTH) / RES))
    lebar = int(round((EAST - WEST) / RES))
    if simpanan.exists():
        return np.load(simpanan), from_origin(WEST, NORTH, RES, RES)
    kanvas = np.full((tinggi, lebar), np.nan, dtype=np.float32)
    langkah = 1.0
    lintang = SOUTH
    while lintang < NORTH - 1e-9:
        utara = min(NORTH, lintang + langkah)
        bujur = WEST
        while bujur < EAST - 1e-9:
            timur = min(EAST, bujur + langkah)
            petak = unduh_petak(bujur, lintang, timur, utara)
            baris0 = int(round((NORTH - utara) / RES))
            kolom0 = int(round((bujur - WEST) / RES))
            baris1 = min(tinggi, baris0 + petak.shape[0])
            kolom1 = min(lebar, kolom0 + petak.shape[1])
            cuplik = petak[: baris1 - baris0, : kolom1 - kolom0]
            kanvas[baris0:baris1, kolom0:kolom1] = cuplik
            print(f"petak {bujur:.2f},{lintang:.2f} {cuplik.shape}", flush=True)
            bujur = timur
        lintang = utara
    np.save(simpanan, kanvas)
    return kanvas, from_origin(WEST, NORTH, RES, RES)


def cocokkan_desa() -> tuple[list[dict], dict]:
    desa = json.loads((ROOT / "data" / "wilayah" / "adm4_desa.geojson").read_text(encoding="utf-8"))["features"]
    penduduk = json.loads((ROOT / "data" / "penduduk_terpapar.json").read_text(encoding="utf-8"))["baris"]
    tepat: dict[tuple[str, str, str], int] = {}
    per_kec: dict[tuple[str, str], list[tuple[str, int]]] = {}
    per_kab: dict[str, list[tuple[str, int]]] = {}
    for indeks, fitur in enumerate(desa):
        properti = fitur["properties"]
        kunci = (kunci_kab(properti["adm2_name"]), norm(properti["adm3_name"]), norm(properti["adm4_name"]))
        tepat.setdefault(kunci, indeks)
        per_kec.setdefault((kunci[0], kunci[1]), []).append((kunci[2], indeks))
        per_kab.setdefault(kunci[0], []).append((kunci[2], indeks))
    gabung: dict[int, float] = {}
    statistik = {"positif": 0, "tepat": 0, "fuzzy_kecamatan": 0, "fuzzy_kabupaten": 0, "gagal": 0, "penduduk_cocok": 0.0, "penduduk_gagal": 0.0}
    for baris in penduduk:
        nilai = baris["penduduk_terpapar"] or 0
        if nilai <= 0:
            continue
        statistik["positif"] += 1
        kunci = (kunci_kab(baris["kab_kota"]), norm(baris["kecamatan"]), norm(baris["desa"]))
        indeks = tepat.get(kunci)
        cara = "tepat"
        if indeks is None:
            calon = per_kec.get((kunci[0], kunci[1]), [])
            nama = get_close_matches(kunci[2], [item[0] for item in calon], n=1, cutoff=0.84)
            if nama:
                indeks = next(item[1] for item in calon if item[0] == nama[0])
                cara = "fuzzy_kecamatan"
        if indeks is None:
            calon = per_kab.get(kunci[0], [])
            unik = sorted({item[0] for item in calon})
            nama = get_close_matches(kunci[2], unik, n=2, cutoff=0.9)
            if len(nama) == 1:
                indeks = next(item[1] for item in calon if item[0] == nama[0])
                cara = "fuzzy_kabupaten"
        if indeks is None:
            statistik["gagal"] += 1
            statistik["penduduk_gagal"] += nilai
            continue
        geometri = make_valid(shape(desa[indeks]["geometry"]))
        if geometri.geom_type == "GeometryCollection":
            bagian = [bagian for bagian in geometri.geoms if bagian.geom_type in {"Polygon", "MultiPolygon"}]
            geometri = unary_union(bagian) if bagian else None
        if geometri is None or geometri.is_empty:
            statistik["gagal"] += 1
            statistik["penduduk_gagal"] += nilai
            continue
        statistik[cara] += 1
        statistik["penduduk_cocok"] += nilai
        gabung[indeks] = gabung.get(indeks, 0.0) + nilai
    hasil = []
    for indeks, nilai in gabung.items():
        geometri = make_valid(shape(desa[indeks]["geometry"]))
        if geometri.geom_type == "GeometryCollection":
            bagian = [bagian for bagian in geometri.geoms if bagian.geom_type in {"Polygon", "MultiPolygon"}]
            geometri = unary_union(bagian) if bagian else None
        if geometri is None or geometri.is_empty:
            continue
        hasil.append({"geometri": geometri, "penduduk": nilai, "id": indeks + 1})
    return hasil, statistik


def bagi_penduduk(bahaya: np.ndarray, transformasi, desa: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    bentuk = bahaya.shape
    zona = rasterize(
        [(item["geometri"], item["id"]) for item in desa],
        out_shape=bentuk,
        transform=transformasi,
        fill=0,
        dtype="int32",
    )
    kelas = np.zeros(bentuk, dtype=np.uint8)
    kelas[(bahaya >= 0.01) & (bahaya <= 0.333)] = 1
    kelas[(bahaya > 0.333) & (bahaya <= 0.666)] = 2
    kelas[(bahaya > 0.666) & (bahaya <= 1.01)] = 3
    baris, kolom = np.nonzero(kelas)
    identitas = zona[baris, kolom]
    kode = kelas[baris, kolom]
    tertinggi = int(zona.max())
    jumlah = np.zeros(tertinggi + 1, dtype=np.int64)
    for kode_kelas in (1, 2, 3):
        jumlah += np.bincount(identitas[kode == kode_kelas], minlength=tertinggi + 1)
    bobot = np.zeros(tertinggi + 1, dtype=np.float64)
    for item in desa:
        banyak = int(jumlah[item["id"]])
        if banyak:
            bobot[item["id"]] = item["penduduk"] / banyak
    nilai = bobot[identitas]
    rendah = np.zeros(bentuk, dtype=np.float32)
    sedang = np.zeros(bentuk, dtype=np.float32)
    tinggi = np.zeros(bentuk, dtype=np.float32)
    for kode_kelas, tujuan in ((1, rendah), (2, sedang), (3, tinggi)):
        pilih = kode == kode_kelas
        np.add.at(tujuan, (baris[pilih], kolom[pilih]), nilai[pilih].astype(np.float32))
    return rendah, sedang, tinggi


def lingkaran(lon: float, lat: float):
    ke_utm = Transformer.from_crs(4326, 32647, always_xy=True).transform
    ke_wgs = Transformer.from_crs(32647, 4326, always_xy=True).transform
    titik = transform(ke_utm, shape({"type": "Point", "coordinates": [lon, lat]}))
    return transform(ke_wgs, titik.buffer(1000, resolution=24))


def jumlah_dalam(geometri, rendah, sedang, tinggi, transformasi) -> dict[str, float]:
    if geometri.is_empty:
        return {"rendah": 0.0, "sedang": 0.0, "tinggi": 0.0, "total": 0.0}
    minx, miny, maxx, maxy = geometri.bounds
    from rasterio.windows import Window, from_bounds

    penuh = Window(0, 0, rendah.shape[1], rendah.shape[0])
    jendela = from_bounds(minx, miny, maxx, maxy, transformasi).round_offsets().round_lengths().intersection(penuh)
    if jendela.width <= 0 or jendela.height <= 0:
        return {"rendah": 0.0, "sedang": 0.0, "tinggi": 0.0, "total": 0.0}
    baris = slice(int(jendela.row_off), int(jendela.row_off + jendela.height))
    kolom = slice(int(jendela.col_off), int(jendela.col_off + jendela.width))
    potongan = rasterio.windows.transform(jendela, transformasi)
    tutup = geometry_mask([mapping(geometri)], (int(jendela.height), int(jendela.width)), potongan, invert=True)
    hasil = {
        "rendah": float(rendah[baris, kolom][tutup].sum()),
        "sedang": float(sedang[baris, kolom][tutup].sum()),
        "tinggi": float(tinggi[baris, kolom][tutup].sum()),
    }
    hasil["total"] = hasil["rendah"] + hasil["sedang"] + hasil["tinggi"]
    return hasil


def bulat(angka: float) -> float:
    return round(float(angka), 1)


def main() -> None:
    print("unduh bahaya", flush=True)
    bahaya, transformasi = muat_bahaya()
    print("cocokkan desa", flush=True)
    desa, statistik = cocokkan_desa()
    print("bagi penduduk", statistik, flush=True)
    rendah, sedang, tinggi = bagi_penduduk(bahaya, transformasi, desa)
    sirine = json.loads((ROOT / "data" / "sirine.geojson").read_text(encoding="utf-8"))["features"]
    if len(sirine) != 286:
        raise SystemExit(f"sirine {len(sirine)} bukan 286")
    lingkaran_fitur = []
    per_sirine = {}
    jumlah_baris = {"rendah": 0.0, "sedang": 0.0, "tinggi": 0.0, "total": 0.0}
    geometri = []
    for fitur in sirine:
        lon, lat = fitur["geometry"]["coordinates"]
        poligon = lingkaran(lon, lat)
        geometri.append(poligon)
        angka = jumlah_dalam(poligon, rendah, sedang, tinggi, transformasi)
        for kunci in jumlah_baris:
            jumlah_baris[kunci] += angka[kunci]
        identitas = fitur["properties"]["id"]
        tersimpan = {kunci: bulat(nilai) for kunci, nilai in angka.items()}
        tersimpan["tercover"] = tersimpan["total"]
        per_sirine[identitas] = tersimpan
        lingkaran_fitur.append(
            {
                "type": "Feature",
                "id": identitas,
                "properties": {"id": identitas, "radius_m": 1000, **tersimpan},
                "geometry": mapping(poligon),
            }
        )
    print("union", flush=True)
    gabungan = jumlah_dalam(unary_union(geometri), rendah, sedang, tinggi, transformasi)
    berkas = {
        "metode": (
            "Penduduk Terpapar desa dibagi rata ke piksel InaRISK INDEKS_BAHAYA_BANJIR "
            "(EPSG:4326, sekitar 111 m) di dalam poligon desa HDX yang indeksnya >= 0,01. "
            "Radius 1 km dihitung di UTM zona 47N, lalu dikembalikan ke WGS84. "
            "Kelas adalah klasifikasi tampilan, bukan kelas resmi BNPB: "
            "rendah 0,01–0,333; sedang >0,333–0,666; tinggi >0,666–1. "
            "Penduduk pada piksel < 0,01 tidak dihitung."
        ),
        "desa": statistik,
        "per_sirine": per_sirine,
        "jumlah_baris": {kunci: bulat(nilai) for kunci, nilai in jumlah_baris.items()},
        "gabungan": {kunci: bulat(nilai) for kunci, nilai in gabungan.items()} | {"tercover": bulat(gabungan["total"])},
        "sirine": len(sirine),
    }
    (ROOT / "data" / "sirine_cakupan.json").write_text(json.dumps(berkas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    kumpulan = {"type": "FeatureCollection", "name": "Radius sirine 1 km", "features": lingkaran_fitur}
    (ROOT / "data" / "sirine_buffer_1km.geojson").write_text(json.dumps(kumpulan) + "\n", encoding="utf-8")
    print("gabungan", berkas["gabungan"])
    print("jumlah baris", berkas["jumlah_baris"])
    print("desa", statistik)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Ubah Excel studi EWS Sumut menjadi GeoJSON, CSV, dan JSON.

Masukan (tidak diubah):
  data/raw/SEBARAN_SENSOR_DAN_SIREN.xlsx
  data/raw/20261105_Olah_Penduduk_Terpapar3.xlsx
  data/batas/sumatera_utara_adm1.geojson
  data/wilayah/das_sumut.geojson
  data/id_acuan/sirine.geojson dan data/id_acuan/sensor.geojson (ID sebelum pembaruan ini)

Masukan tambahan (dibaca, tidak ditulis ulang):
  data/status_override.csv

Keluaran:
  data/sirine.geojson
  data/sensor.geojson
  data/penduduk_terpapar.csv
  data/penduduk_terpapar.json
  data/penduduk_terdampak.json
  data/penduduk_sumut.json
  data/alternatif_lokasi.json
  data/tidak_disurvei.json
  data/points_das.csv
  data/status_override.csv
  data/QA.md

Nilai penduduk disimpan sebagai angka sumber (float Excel, dibersihkan ke 6
desimal bila setara). Pembulatan tampilan dilakukan di aplikasi, bukan di sini.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
RAW_SEBARAN = ROOT / "data" / "raw" / "SEBARAN_SENSOR_DAN_SIREN.xlsx"
RAW_PENDUDUK = ROOT / "data" / "raw" / "20261105_Olah_Penduduk_Terpapar3.xlsx"
BATAS_PATH = ROOT / "data" / "batas" / "sumatera_utara_adm1.geojson"
DAS_PATH = ROOT / "data" / "wilayah" / "das_sumut.geojson"
OLD_SIRINE = ROOT / "data" / "id_acuan" / "sirine.geojson"
OLD_SENSOR = ROOT / "data" / "id_acuan" / "sensor.geojson"
EXPECT_SIRINE = 295
EXPECT_SENSOR = 10

DMS_RE = re.compile(
    r"""(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*"\s*([NSEW])""",
    re.IGNORECASE,
)

# Nama pada judul peta. String "KABUPATEN PADANGSIDIMPUAN" tidak ada di sumber
# saat konversi ini ditulis; pemetaan tetap ada agar judul tidak mengulang
# kesalahan itu jika muncul.
NAMA_TAMPIL = {
    "KABUPATEN PADANGSIDIMPUAN": "Kota Padangsidimpuan",
    "KAB. PADANGSIDIMPUAN": "Kota Padangsidimpuan",
    "KABUPATEN PADANG SIDEMPUAN": "Kota Padangsidimpuan",
}

STATUS_PATH = ROOT / "data" / "status_override.csv"
DEFAULT_STATUS = "usulan_studi"
VALID_STATUS = {"usulan_studi", "usulan_bpbd", "hasil_survei", "belum_ditentukan"}
STATUS_CATATAN = (
    "Properti status bukan kolom pada Excel. Lembar sirine menyimpan KETERANGAN dan ALTERBATIF. "
    "Lembar sensor menyimpan KETERANGAN; teks yang diawali Rencana disimpan sebagai Rencana, "
    "teks yang diawali Eksisting sebagai Eksisting, dan nama pos pada kolom Name. "
    "Nilai awal semua titik adalah usulan_studi sesuai keputusan tampilan, "
    "dibaca dari data/status_override.csv (bukan inferensi lokasi). "
    "ID baru ditambahkan sebagai usulan_studi. ID yang hilang dari sumber dibuang dari berkas itu. "
    "Warna sirine pada peta mengikuti Alternatif, bukan status."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clean_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    number = float(value)
    rounded = round(number, 6)
    if abs(number - rounded) <= 1e-8:
        return rounded
    return round(number, 10)


def nama_tampil(kab: str | None) -> str | None:
    if kab is None:
        return None
    return NAMA_TAMPIL.get(kab.strip().upper(), kab)


def dms_to_dd(text: str) -> float:
    match = DMS_RE.search(text)
    if not match:
        raise ValueError(f"DMS tidak dikenali: {text!r}")
    deg, minute, sec, hem = match.groups()
    value = int(deg) + int(minute) / 60 + float(sec) / 3600
    if hem.upper() in {"S", "W"}:
        value = -value
    return round(value, 8)


def norm_keterangan_sensor(teks: str | None) -> str:
    nilai = (teks or "").strip().lower()
    if nilai.startswith("rencana"):
        return "Rencana"
    if nilai.startswith("eksisting"):
        return "Eksisting"
    return (teks or "").strip()


def load_sirine(ws) -> tuple[list[dict], int]:
    """SEBARAN SIRINE: WADMKK, WADMKC, WADMKD, KETERANGAN, ALTERBATIF, REMARK, X, Y."""
    parsed: list[dict] = []
    kab = kec = desa = ket = None
    blank_admin_before = 0
    for row_idx in range(5, ws.max_row + 1):
        raw = [ws.cell(row_idx, col).value for col in range(1, 9)]
        if any(clean_text(cell) == "Grand Total" for cell in raw):
            continue
        if all(cell is None for cell in raw):
            continue
        a, b, c, keterangan, alternatif, remark, x_text, y_text = raw
        if a is None or b is None or c is None:
            blank_admin_before += 1
        if a is not None:
            kab = clean_text(a)
        if b is not None:
            kec = clean_text(b)
        if c is not None:
            desa = clean_text(c)
        if keterangan is not None:
            ket = clean_text(keterangan)
        parsed.append(
            {
                "baris_excel": row_idx,
                "wadmkk": kab,
                "wadmkc": kec,
                "wadmkd": desa,
                "keterangan": ket or "",
                "alternatif": clean_text(alternatif) or "",
                "remark": clean_text(remark) or "",
                "x_dms": clean_text(x_text),
                "y_dms": clean_text(y_text),
            }
        )
    return parsed, blank_admin_before


def load_sensor(ws) -> tuple[list[dict], int]:
    """SEBARAN SENSOR: WADMKK, WADMKC, WADMKD, KETERANGAN, Name, X, Y."""
    parsed: list[dict] = []
    kab = kec = desa = None
    blank_admin_before = 0
    for row_idx in range(5, ws.max_row + 1):
        raw = [ws.cell(row_idx, col).value for col in range(1, 8)]
        if any(clean_text(cell) == "Grand Total" for cell in raw):
            continue
        if all(cell is None for cell in raw):
            continue
        a, b, c, ket, nama, x_text, y_text = raw
        if a is None or b is None or c is None:
            blank_admin_before += 1
        if a is not None:
            kab = clean_text(a)
        if b is not None:
            kec = clean_text(b)
        if c is not None:
            desa = clean_text(c)
        parsed.append(
            {
                "baris_excel": row_idx,
                "wadmkk": kab,
                "wadmkc": kec,
                "wadmkd": desa,
                "keterangan": norm_keterangan_sensor(clean_text(ket)),
                "alternatif": "",
                "remark": clean_text(nama) or "",
                "x_dms": clean_text(x_text),
                "y_dms": clean_text(y_text),
            }
        )
    return parsed, blank_admin_before


def to_geojson(rows: list[dict], prefix: str, jenis: str) -> dict:
    features = []
    failures = []
    for index, row in enumerate(rows, start=1):
        feature_id = f"{prefix}-{index:03d}"
        try:
            lon = dms_to_dd(row["x_dms"] or "")
            lat = dms_to_dd(row["y_dms"] or "")
        except ValueError as exc:
            failures.append({"id": feature_id, "alasan": str(exc), **row})
            continue
        kab = row["wadmkk"]
        features.append(
            {
                "type": "Feature",
                "id": feature_id,
                "properties": {
                    "id": feature_id,
                    "jenis": jenis,
                    "wadmkk": kab,
                    "wadmkk_tampil": nama_tampil(kab),
                    "wadmkc": row["wadmkc"],
                    "wadmkd": row["wadmkd"],
                    "keterangan": row["keterangan"],
                    "alternatif": row.get("alternatif") or "",
                    "remark": row["remark"],
                    "x_dms": row["x_dms"],
                    "y_dms": row["y_dms"],
                    "baris_excel": row["baris_excel"],
                },
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
    return {
        "type": "FeatureCollection",
        "name": jenis,
        "crs_catatan": (
            "WGS84 (EPSG:4326). Bujur/lintang dihitung dari teks DMS kolom X dan Y. "
            "Hemisfer mengikuti akhiran E/W dan N/S pada sumber."
        ),
        "features": features,
        "_failures": failures,
    }


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_geometry(x: float, y: float, geometry: dict) -> bool:
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    for polygon in polygons:
        if not point_in_ring(x, y, polygon[0]):
            continue
        if any(point_in_ring(x, y, hole) for hole in polygon[1:]):
            continue
        return True
    return False


def bbox_of_features(features: list[dict]) -> list[float] | None:
    if not features:
        return None
    lons = [f["geometry"]["coordinates"][0] for f in features]
    lats = [f["geometry"]["coordinates"][1] for f in features]
    return [min(lons), min(lats), max(lons), max(lats)]


def read_penduduk_sheet(ws, extra_col: bool) -> list[dict]:
    rows = []
    for row_idx in range(2, ws.max_row + 1):
        kab = clean_text(ws.cell(row_idx, 1).value)
        kec = clean_text(ws.cell(row_idx, 2).value)
        desa = clean_text(ws.cell(row_idx, 3).value)
        pop = clean_float(ws.cell(row_idx, 4).value)
        extra = clean_float(ws.cell(row_idx, 5).value) if extra_col else None
        if kab is None and kec is None and desa is None and pop is None:
            continue
        item = {
            "kab_kota": kab,
            "kecamatan": kec,
            "desa": desa,
            "penduduk_terpapar": pop,
        }
        if extra_col:
            item["kolom_e_tanpa_judul"] = extra
        rows.append(item)
    return rows


def row_key(item: dict) -> tuple:
    return (
        item.get("kab_kota"),
        item.get("kecamatan"),
        item.get("desa"),
        item.get("penduduk_terpapar"),
    )


def kunci_koordinat(lon: float, lat: float) -> tuple[float, float]:
    return (round(lon, 5), round(lat, 5))


def indeks_id_lama(path: Path) -> tuple[dict[tuple[float, float], list[str]], int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    oleh: dict[tuple[float, float], list[str]] = {}
    tertinggi = 0
    for feature in data.get("features", []):
        lon, lat = feature["geometry"]["coordinates"]
        point_id = str(feature["properties"]["id"])
        oleh.setdefault(kunci_koordinat(lon, lat), []).append(point_id)
        tertinggi = max(tertinggi, int(point_id.rsplit("-", 1)[-1]))
    return oleh, tertinggi


def tetapkan_id(features: list[dict], path_lama: Path, awalan: str) -> dict[str, list[str]]:
    """Jaga ID lama bila koordinat (5 desimal) cocok. ID baru melanjutkan nomor tertinggi."""
    oleh, tertinggi = indeks_id_lama(path_lama)
    terpakai: set[str] = set()
    dipakai_ulang: list[str] = []
    dibuat: list[str] = []
    for feature in features:
        lon, lat = feature["geometry"]["coordinates"]
        pilihan = None
        for calon in oleh.get(kunci_koordinat(lon, lat), []):
            if calon not in terpakai:
                pilihan = calon
                break
        if pilihan:
            terpakai.add(pilihan)
            point_id = pilihan
            dipakai_ulang.append(point_id)
        else:
            tertinggi += 1
            point_id = f"{awalan}-{tertinggi:03d}"
            dibuat.append(point_id)
        feature["id"] = point_id
        feature["properties"]["id"] = point_id
    lama = {point_id for daftar in oleh.values() for point_id in daftar}
    return {"dipakai_ulang": dipakai_ulang, "dibuat": dibuat, "dihapus": sorted(lama - terpakai)}


def nama_das_pada(lon: float, lat: float, fitur_das: list[dict]) -> str:
    for feature in fitur_das:
        if point_in_geometry(lon, lat, feature["geometry"]):
            return str((feature.get("properties") or {}).get("nama_das") or "")
    return ""


def tulis_points_das(path: Path, features: list[dict], fitur_das: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "das", "sub_das"])
        for feature in features:
            lon, lat = feature["geometry"]["coordinates"]
            writer.writerow([feature["properties"]["id"], nama_das_pada(lon, lat, fitur_das), ""])


def tulis_status(path: Path, features: list[dict], overrides: dict[str, str]) -> None:
    baris = []
    for feature in features:
        point_id = feature["properties"]["id"]
        status = overrides.get(point_id, DEFAULT_STATUS)
        feature["properties"]["status"] = status
        feature["properties"]["status_sumber"] = "status_override.csv"
        baris.append((point_id, status))
    baris.sort(key=lambda item: (item[0][:3], int(item[0].rsplit("-", 1)[-1])))
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "status"])
        writer.writerows(baris)


def read_tidak_disurvei(ws) -> list[dict]:
    rows = []
    for row_idx in range(2, ws.max_row + 1):
        penanda, kab, kec, desa, pop = [ws.cell(row_idx, col).value for col in range(1, 6)]
        if clean_text(kab) is None and clean_text(kec) is None and clean_text(desa) is None:
            continue
        rows.append(
            {
                "penanda_angka": clean_float(penanda),
                "kab_kota": clean_text(kab),
                "kecamatan": clean_text(kec),
                "desa": clean_text(desa),
                "penduduk_terpapar": clean_float(pop),
                "baris_excel": row_idx,
            }
        )
    return rows


def read_alternatif(ws) -> dict:
    """Satu tabel. Header tertulis: kota/kab, kecamatan, desa, Alt sirine, dan tiga kolom sensor."""
    rows = []
    for row_idx in range(2, ws.max_row + 1):
        raw = [ws.cell(row_idx, col).value for col in range(1, 12)]
        if all(cell is None for cell in raw):
            continue
        penanda_a, penanda_b, kab, kec, desa, nilai, penanda_g, alt_sirine, sensor_desa, nama_desa, beda = raw
        if clean_text(kab) is None and clean_text(desa) is None and nilai is None:
            continue
        rows.append(
            {
                "penanda_a": clean_float(penanda_a),
                "penanda_b": clean_float(penanda_b),
                "kab_kota": clean_text(kab),
                "kecamatan": clean_text(kec),
                "desa": clean_text(desa),
                "nilai": clean_float(nilai),
                "penanda_g": clean_text(penanda_g),
                "alt_sirine": clean_float(alt_sirine),
                "sensor_di_desa": clean_text(sensor_desa),
                "nama_desa_sensor": clean_text(nama_desa),
                "sensor_beda_desa": clean_text(beda),
                "baris_excel": row_idx,
            }
        )
    return {
        "sumber_berkas": RAW_PENDUDUK.name,
        "sumber_lembar": "Alternatif Lokasi",
        "catatan": (
            "Satu tabel, bukan dua panel. Judul yang tertulis: kota/kab, kecamatan, desa, "
            "Alt sirine, Sensor eksisting di desa yang direncanakan sirine, Nama desa ada sensor, "
            "dan Sensor eksisting, beda desa. Kolom A, B, F, dan G tidak berjudul. "
            "Kolom F disimpan sebagai nilai. Makna resmi angka tanpa judul tidak tertulis di berkas."
        ),
        "baris": rows,
    }


def load_status_overrides(path: Path) -> tuple[dict[str, str], list[str]]:
    """Baca id,status. Berkas tidak ditulis ulang oleh skrip ini."""
    issues: list[str] = []
    overrides: dict[str, str] = {}
    if not path.exists():
        issues.append("data/status_override.csv tidak ada. Semua titik memakai bawaan usulan_studi.")
        return overrides, issues
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        if "id" not in fields or "status" not in fields:
            issues.append("Header data/status_override.csv harus memuat kolom id dan status.")
            return overrides, issues
        seen: set[str] = set()
        for line_no, row in enumerate(reader, start=2):
            point_id = (row.get("id") or "").strip()
            status = (row.get("status") or "").strip()
            if not point_id and not status:
                continue
            if not point_id:
                issues.append(f"baris {line_no}: id kosong")
                continue
            if point_id in seen:
                issues.append(f"baris {line_no}: id duplikat {point_id}")
            seen.add(point_id)
            if status not in VALID_STATUS:
                issues.append(f"baris {line_no}: status {status!r} tidak dikenal untuk {point_id}")
                continue
            overrides[point_id] = status
    return overrides, issues


def apply_status(features: list[dict], overrides: dict[str, str]) -> None:
    for feature in features:
        point_id = feature["properties"]["id"]
        if point_id in overrides:
            feature["properties"]["status"] = overrides[point_id]
            feature["properties"]["status_sumber"] = "status_override.csv"
        else:
            feature["properties"]["status"] = DEFAULT_STATUS
            feature["properties"]["status_sumber"] = "bawaan_usulan_studi"


def dump_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = ["kab_kota", "kecamatan", "desa", "penduduk_terpapar", "kolom_e_tanpa_judul"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: "" if row.get(key) is None else row.get(key) for key in fields})


def count_by(rows: list[dict], key: str) -> list[tuple[str, int]]:
    counter = Counter(row[key] for row in rows)
    return sorted(counter.items(), key=lambda item: (-item[1], item[0] or ""))


def nonunique(values: list[str | None]) -> list[tuple[str, int]]:
    counter = Counter(value for value in values if value)
    return sorted(((text, count) for text, count in counter.items() if count > 1), key=lambda item: (-item[1], item[0]))


def md_table(headers: list[str], rows: list[list[object]]) -> str:
    head = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]
    return "\n".join([head, sep, *body])


def main() -> int:
    if not RAW_SEBARAN.exists() or not RAW_PENDUDUK.exists():
        print("berkas mentah tidak ditemukan di data/raw/", file=sys.stderr)
        return 1
    if not BATAS_PATH.exists():
        print("batas Sumatera Utara belum ada. Jalankan scripts/fetch_batas.py", file=sys.stderr)
        return 1

    batas = json.loads(BATAS_PATH.read_text(encoding="utf-8"))
    geometry = batas["features"][0]["geometry"]
    batas_bbox = json.loads((ROOT / "data" / "batas" / "sumber.json").read_text(encoding="utf-8"))["bbox"]

    sebaran = openpyxl.load_workbook(RAW_SEBARAN, data_only=True)
    penduduk_wb = openpyxl.load_workbook(RAW_PENDUDUK, data_only=True)

    sirine_rows, sirine_blank = load_sirine(sebaran["SEBARAN SIRINE"])
    sensor_rows, sensor_blank = load_sensor(sebaran["SEBARAN SENSOR"])
    sirine_gj = to_geojson(sirine_rows, "SRN-DS", "sirine")
    sensor_gj = to_geojson(sensor_rows, "SNS-DS", "sensor")
    sirine_fail = sirine_gj.pop("_failures")
    sensor_fail = sensor_gj.pop("_failures")
    id_sirine = tetapkan_id(sirine_gj["features"], OLD_SIRINE, "SRN-DS")
    id_sensor = tetapkan_id(sensor_gj["features"], OLD_SENSOR, "SNS-DS")

    terpapar = read_penduduk_sheet(penduduk_wb["Terpapar"], extra_col=True)
    terdampak = read_penduduk_sheet(penduduk_wb["Terdampak"], extra_col=False)
    sumut = read_penduduk_sheet(penduduk_wb["Sumut"], extra_col=False)
    tidak_disurvei = read_tidak_disurvei(penduduk_wb["Tidak disurvei"])
    alternatif = read_alternatif(penduduk_wb["Alternatif Lokasi"])

    ter_keys = Counter(row_key(row) for row in terpapar)
    tdk_keys = Counter(row_key(row) for row in terdampak)
    identik = ter_keys == tdk_keys

    sumut_lookup = {
        (row["kab_kota"], row["kecamatan"], row["desa"]): row["penduduk_terpapar"] for row in sumut
    }
    ter_missing = 0
    ter_diff = 0
    for row in terpapar:
        key = (row["kab_kota"], row["kecamatan"], row["desa"])
        if key not in sumut_lookup:
            ter_missing += 1
        elif sumut_lookup[key] != row["penduduk_terpapar"]:
            ter_diff += 1

    def cocok_alternatif(baris: list[dict]) -> tuple[int, int]:
        cocok = 0
        beda = 0
        for row in baris:
            key = (row["kab_kota"], row["kecamatan"], row["desa"])
            if key not in sumut_lookup or row["nilai"] is None:
                continue
            if sumut_lookup[key] == row["nilai"]:
                cocok += 1
            else:
                beda += 1
        return cocok, beda

    alt_cocok, alt_beda = cocok_alternatif(alternatif["baris"])

    def outside(features: list[dict]) -> list[str]:
        hasil = []
        for feature in features:
            lon, lat = feature["geometry"]["coordinates"]
            if not point_in_geometry(lon, lat, geometry):
                props = feature["properties"]
                hasil.append(f"{props['id']} {props['wadmkk']} / {props['remark']} ({lon}, {lat})")
        return hasil

    sirine_out = outside(sirine_gj["features"])
    sensor_out = outside(sensor_gj["features"])

    def dup_coords(features: list[dict]) -> list[str]:
        seen: dict[tuple, list[str]] = {}
        for feature in features:
            lon, lat = feature["geometry"]["coordinates"]
            seen.setdefault((lon, lat), []).append(feature["properties"]["id"])
        return [f"{ids} @ {coord}" for coord, ids in seen.items() if len(ids) > 1]

    def blanks(features: list[dict]) -> Counter:
        counter: Counter = Counter()
        for feature in features:
            props = feature["properties"]
            for key in ("wadmkk", "wadmkc", "wadmkd", "keterangan", "remark", "x_dms", "y_dms"):
                if not props.get(key):
                    counter[key] += 1
        return counter

    sirine_box = bbox_of_features(sirine_gj["features"])
    sensor_box = bbox_of_features(sensor_gj["features"])

    def inside_bbox(box: list[float] | None, outer: list[float]) -> bool:
        if box is None:
            return False
        return box[0] >= outer[0] and box[1] >= outer[1] and box[2] <= outer[2] and box[3] <= outer[3]

    padang_strings = sorted(
        {
            feature["properties"]["wadmkk"]
            for feature in sirine_gj["features"] + sensor_gj["features"]
            if feature["properties"]["wadmkk"] and "PADANGSIDIMPUAN" in feature["properties"]["wadmkk"].upper().replace(" ", "")
            or (feature["properties"]["wadmkk"] and "PADANG SIDEMPUAN" in feature["properties"]["wadmkk"].upper())
        }
    )
    padang_penduduk = sorted({row["kab_kota"] for row in terpapar + sumut if row["kab_kota"] and "PADANGSIDIMPUAN" in row["kab_kota"].upper().replace(" ", "")})

    status_overrides, status_issues = load_status_overrides(STATUS_PATH)
    sensor_lembar = list(sensor_gj["features"])
    sensor_gj["features"] = [fitur for fitur in sensor_lembar if fitur["properties"]["keterangan"] == "Rencana"]
    sensor_gj["catatan_lapisan"] = (
        "Hanya baris Excel KETERANGAN=Rencana. Baris Eksisting tidak ditulis ke lapisan ini "
        "karena koordinatnya sama dengan pos PDA pada data/pos_hidrologi_bbws2.geojson."
    )
    semua_fitur = sirine_gj["features"] + sensor_gj["features"]
    tulis_status(STATUS_PATH, semua_fitur, status_overrides)
    known_ids = {feature["properties"]["id"] for feature in semua_fitur}
    hilang_override = sorted(set(status_overrides) - known_ids)
    sirine_gj["status_catatan"] = STATUS_CATATAN
    sensor_gj["status_catatan"] = STATUS_CATATAN
    status_counts = Counter(
        feature["properties"]["status"] for feature in sirine_gj["features"] + sensor_gj["features"]
    )

    dump_json(ROOT / "data" / "sirine.geojson", sirine_gj)
    dump_json(ROOT / "data" / "sensor.geojson", sensor_gj)
    write_csv(ROOT / "data" / "penduduk_terpapar.csv", terpapar)
    dump_json(
        ROOT / "data" / "penduduk_terpapar.json",
        {
            "sumber_berkas": RAW_PENDUDUK.name,
            "sumber_lembar": "Terpapar",
            "catatan": (
                "Nilai penduduk_terpapar disalin dari kolom 'Penduduk Terpapar'. "
                "Metode penghitungan dan sumber penduduk tidak tertulis di berkas; jangan ditafsirkan di luar angka ini. "
                "kolom_e_tanpa_judul adalah kolom E tanpa header (108 sel terisi, selebihnya kosong). "
                "Angka pecahan dipertahankan. Aplikasi membulatkan hanya untuk tampilan."
            ),
            "jumlah_baris": len(terpapar),
            "jumlah_kab_kota": len({row["kab_kota"] for row in terpapar}),
            "baris": terpapar,
        },
    )
    dump_json(
        ROOT / "data" / "penduduk_terdampak.json",
        {
            "sumber_berkas": RAW_PENDUDUK.name,
            "sumber_lembar": "Terdampak",
            "isu": (
                "Multiset (kab/kota, kecamatan, desa, penduduk) identik dengan lembar Terpapar. "
                "Urutan baris berbeda. Header kolom nilai tetap 'Penduduk Terpapar'. "
                "Kemungkinan salinan. Lembar dipertahankan dan tidak dipakai sebagai angka terpisah di peta."
            ),
            "identik_dengan_terpapar": identik,
            "jumlah_baris": len(terdampak),
            "baris": terdampak,
        },
    )
    dump_json(
        ROOT / "data" / "penduduk_sumut.json",
        {
            "sumber_berkas": RAW_PENDUDUK.name,
            "sumber_lembar": "Sumut",
            "catatan": (
                "Seluruh baris lembar Sumut. Header kolom nilai sama: 'Penduduk Terpapar'. "
                "Metode dan sumber penduduk tidak tertulis di berkas. "
                "Lembar Terpapar adalah himpunan bagian kunci desa dari lembar ini."
            ),
            "jumlah_baris": len(sumut),
            "jumlah_kab_kota": len({row["kab_kota"] for row in sumut}),
            "baris": sumut,
        },
    )
    dump_json(ROOT / "data" / "alternatif_lokasi.json", alternatif)
    kab_tidak = sorted({row["kab_kota"] for row in tidak_disurvei if row["kab_kota"]})
    dump_json(
        ROOT / "data" / "tidak_disurvei.json",
        {
            "sumber_berkas": RAW_PENDUDUK.name,
            "sumber_lembar": "Tidak disurvei",
            "catatan": (
                "Desa pada lembar Tidak disurvei. Angka di kolom tanpa judul disimpan sebagai penduduk_terpapar "
                "karena angkanya sejenis dengan kolom Penduduk Terpapar pada lembar lain; header kolom itu tidak tertulis. "
                "penanda_angka adalah kolom A, juga tanpa judul, hanya terisi pada baris pertama tiap kabupaten/kota."
            ),
            "jumlah_baris": len(tidak_disurvei),
            "kabupaten_kota": kab_tidak,
            "baris": tidak_disurvei,
        },
    )
    fitur_das = json.loads(DAS_PATH.read_text(encoding="utf-8"))["features"]
    tulis_points_das(ROOT / "data" / "points_das.csv", semua_fitur, fitur_das)
    tanpa_das = sum(1 for feature in semua_fitur if not nama_das_pada(*feature["geometry"]["coordinates"], fitur_das))

    sirine_remarks = nonunique([f["properties"]["remark"] for f in sirine_gj["features"]])
    sensor_remarks = nonunique([f["properties"]["remark"] for f in sensor_gj["features"]])
    jembatan = sum(1 for f in sensor_gj["features"] if f["properties"]["remark"] == "Jembatan")

    alt_sirine = count_by(
        [{"alternatif": f["properties"].get("alternatif") or "(kosong)"} for f in sirine_gj["features"]],
        "alternatif",
    )
    kab_sirine = count_by([f["properties"] for f in sirine_gj["features"]], "wadmkk")
    kab_sensor = count_by([f["properties"] for f in sensor_gj["features"]], "wadmkk")
    kab_ter = count_by(terpapar, "kab_kota")
    kab_sumut = count_by(sumut, "kab_kota")

    titik_kab = {name for name, _ in kab_sirine} | {name for name, _ in kab_sensor}
    ter_kab = {name for name, _ in kab_ter}
    sumut_kab = {name for name, _ in kab_sumut}

    qa = f"""# Laporan QA data Studi EWS Sumut

Dihasilkan oleh `scripts/convert_data.py`. Berkas mentah di `data/raw/` tidak diubah.

## Berkas sumber

| Berkas | SHA-256 |
| --- | --- |
| data/raw/{RAW_SEBARAN.name} | `{sha256(RAW_SEBARAN)}` |
| data/raw/{RAW_PENDUDUK.name} | `{sha256(RAW_PENDUDUK)}` |

## Jumlah

| Lapisan | Jumlah | Keterangan |
| --- | --- | --- |
| Sirine | {len(sirine_gj["features"])} | diharapkan {EXPECT_SIRINE} |
| Sensor digambar | {len(sensor_gj["features"])} | hanya Rencana; diharapkan 10 |
| Sensor Eksisting tidak digambar | {sum(1 for f in sensor_lembar if f["properties"]["keterangan"] == "Eksisting")} | diharapkan 0. Berkas ini tidak memuat baris Eksisting. |
| Kabupaten/kota pada titik | {len(titik_kab)} | diharapkan 12 |
| Desa lembar Terpapar | {len(terpapar)} | |
| Desa lembar Terdampak | {len(terdampak)} | identik dengan Terpapar: {identik} |
| Desa lembar Sumut | {len(sumut)} | {len(sumut_kab)} kabupaten/kota |
| Tidak disurvei | {len(tidak_disurvei)} | {len(kab_tidak)} kabupaten/kota |
| Alternatif lokasi | {len(alternatif["baris"])} | |
| Gagal konversi DMS sirine | {len(sirine_fail)} | |
| Gagal konversi DMS sensor | {len(sensor_fail)} | |

Baris `Grand Total` pada lembar SIRINE dan SENSOR dibuang (bukan titik).

## Sirine per kabupaten/kota

{md_table(["Kabupaten/kota", "Sirine"], [[name, count] for name, count in kab_sirine])}

## Alternatif sirine

Kolom sumber bernama `ALTERBATIF`. Nilai kosong tidak diisi.

{md_table(["Alternatif", "Sirine"], [[name, count] for name, count in alt_sirine])}

## Sensor per kabupaten/kota

{md_table(["Kabupaten/kota", "Eksisting (tidak digambar)", "Rencana (digambar)"], [
    [
        name,
        sum(1 for f in sensor_lembar if f["properties"]["wadmkk"] == name and f["properties"]["keterangan"] == "Eksisting"),
        sum(1 for f in sensor_lembar if f["properties"]["wadmkk"] == name and f["properties"]["keterangan"] == "Rencana"),
    ]
    for name in sorted({f["properties"]["wadmkk"] for f in sensor_lembar})
])}

ID Rencana yang digambar: {", ".join(f["properties"]["id"] for f in sensor_gj["features"])}.

## ID

Koordinat dicocokkan pada 5 angka desimal.

| Lapisan | Dipakai ulang | Dibuat | Dihapus |
| --- | --- | --- | --- |
| Sirine | {len(id_sirine["dipakai_ulang"])} | {len(id_sirine["dibuat"])} | {len(id_sirine["dihapus"])} ({", ".join(id_sirine["dihapus"]) or "—"}) |
| Sensor | {len(id_sensor["dipakai_ulang"])} | {len(id_sensor["dibuat"])} | {len(id_sensor["dihapus"])} |

ID sirine baru: {id_sirine["dibuat"][0] if id_sirine["dibuat"] else "—"} … {id_sirine["dibuat"][-1] if id_sirine["dibuat"] else "—"}.
ID sensor baru: {id_sensor["dibuat"][0] if id_sensor["dibuat"] else "—"} … {id_sensor["dibuat"][-1] if id_sensor["dibuat"] else "—"}.
ID sensor yang dipertahankan: {", ".join(id_sensor["dipakai_ulang"]) or "—"}.
Titik tanpa nama DAS pada poligon KLHK: {tanpa_das}.

## Tidak disurvei

Kabupaten/kota: {", ".join(kab_tidak)}.

## Penduduk terpapar per kabupaten/kota

Lembar Terpapar. Nilai dijumlahkan dari angka sumber, lalu dibulatkan ke 6 desimal pada penjumlahan di kolom ini.

{md_table(
    ["Kabupaten/kota", "Desa", "Jumlah penduduk (6 desimal)"],
    [
        [
            name,
            count,
            round(sum(row["penduduk_terpapar"] or 0 for row in terpapar if row["kab_kota"] == name), 6),
        ]
        for name, count in kab_ter
    ],
)}

## Lembar Sumut per kabupaten/kota

{md_table(["Kabupaten/kota", "Desa"], [[name, count] for name, count in kab_sumut])}

Kabupaten/kota pada lembar Sumut yang tidak ada di Terpapar: {", ".join(sorted(sumut_kab - ter_kab)) or "—"}.

Kabupaten/kota titik yang tidak ada di Terpapar: {", ".join(sorted(titik_kab - ter_kab)) or "—"}.

## Isian kosong

Sebelum isi-ke-depan, sel kab/kec/desa/keterangan kosong pada baris titik: sirine {sirine_blank}, sensor {sensor_blank}. Setelah isi-ke-depan:

| Kolom | Sirine kosong | Sensor kosong |
| --- | --- | --- |
| wadmkk | {blanks(sirine_gj["features"])["wadmkk"]} | {blanks(sensor_gj["features"])["wadmkk"]} |
| wadmkc | {blanks(sirine_gj["features"])["wadmkc"]} | {blanks(sensor_gj["features"])["wadmkc"]} |
| wadmkd | {blanks(sirine_gj["features"])["wadmkd"]} | {blanks(sensor_gj["features"])["wadmkd"]} |
| keterangan | {blanks(sirine_gj["features"])["keterangan"]} | {blanks(sensor_gj["features"])["keterangan"]} |
| remark | {blanks(sirine_gj["features"])["remark"]} | {blanks(sensor_gj["features"])["remark"]} |
| x/y | {blanks(sirine_gj["features"])["x_dms"] + blanks(sirine_gj["features"])["y_dms"]} | {blanks(sensor_gj["features"])["x_dms"] + blanks(sensor_gj["features"])["y_dms"]} |

Lembar penduduk: baris tanpa kab/kec/desa/nilai tidak ditemukan pada pemeriksaan konversi (baris kosong dilewati).

## Duplikat

Koordinat identik dalam lapisan sirine: {len(dup_coords(sirine_gj["features"]))}.
Koordinat identik dalam lapisan sensor: {len(dup_coords(sensor_gj["features"]))}.

Remark sirine yang tidak unik:

{md_table(["Remark", "Jumlah"], sirine_remarks) if sirine_remarks else "Tidak ada."}

Remark sensor yang tidak unik (ID unik tetap diberikan; remark sumber tidak diubah):

{md_table(["Remark", "Jumlah"], sensor_remarks) if sensor_remarks else "Tidak ada."}

Remark sensor persis `Jembatan`: {jembatan} titik. Itu sebab ID `SNS-DS-###` dipakai, bukan teks remark.

## Bbox dan batas provinsi

Batas referensi: geoBoundaries ADM1 `North Sumatra` / tampilan Sumatera Utara. Bbox verteks: {batas_bbox}.

| Lapisan | Bbox [barat, selatan, timur, utara] | Di dalam bbox batas |
| --- | --- | --- |
| Sirine | {sirine_box} | {inside_bbox(sirine_box, batas_bbox)} |
| Sensor | {sensor_box} | {inside_bbox(sensor_box, batas_bbox)} |

Titik di luar poligon batas (ray casting, tidak dihapus):

- Sirine: {len(sirine_out)}
{chr(10).join("- " + item for item in sirine_out) if sirine_out else "- tidak ada"}
- Sensor: {len(sensor_out)}
{chr(10).join("- " + item for item in sensor_out) if sensor_out else "- tidak ada"}

Semua teks koordinat sumber yang terbaca berakhiran `E` (kolom X, bujur) dan `N` (kolom Y, lintang).

## Isu yang diketahui

1. Lembar Terdampak identik dengan Terpapar sebagai multiset: {identik}. Urutan baris berbeda. Header nilai tetap "Penduduk Terpapar". Dipertahankan di `data/penduduk_terdampak.json` dan tidak ditampilkan sebagai angka kedua.
2. Remark tidak unik pada sebagian sirine. Nama sensor diambil dari kolom Name. ID yang koordinatnya masih sama dipertahankan; ID baru melanjutkan nomor tertinggi dan ID yang hilang tidak dipakai lagi.
3. String `KABUPATEN PADANGSIDIMPUAN` tidak muncul pada kolom kabupaten/kota. Nama yang tertulis sudah `Kota Padangsidimpuan` (titik: {", ".join(padang_strings) or "—"}; penduduk: {", ".join(padang_penduduk) or "—"}). Judul dan filter memakai nama sumber itu. Pemetaan cadangan di skrip mengubah `KABUPATEN PADANGSIDIMPUAN` menjadi `Kota Padangsidimpuan` pada `wadmkk_tampil` jika string itu muncul.
4. Kolom E lembar Terpapar tidak berjudul. {sum(1 for row in terpapar if row["kolom_e_tanpa_judul"] is not None)} sel terisi (nilai {min((row["kolom_e_tanpa_judul"] for row in terpapar if row["kolom_e_tanpa_judul"] is not None), default="—")}–{max((row["kolom_e_tanpa_judul"] for row in terpapar if row["kolom_e_tanpa_judul"] is not None), default="—")}). Disimpan sebagai `kolom_e_tanpa_judul`, bukan sebagai peringkat resmi.
5. Angka kolom F (tanpa judul) pada Alternatif Lokasi yang se-desa dengan lembar Sumut: cocok {alt_cocok}, beda {alt_beda}. Pengamatan, bukan penamaan ulang kolom.
6. Lembar Terpapar terhadap Sumut: kunci desa hilang {ter_missing}, nilai berbeda {ter_diff}.
7. Metode dan sumber penduduk tidak ada di berkas. Tidak diperkirakan di laporan ini.
8. Tidak ada poligon desa pada masukan. Peta tidak mengarang batas desa.
9. Ejaan teks remark (contoh pada sumber: "Hampaaran", "Percuit", "Padang Sidempuan") dibiarkan apa adanya.
10. Excel tidak memuat kolom status. {STATUS_CATATAN} Ringkasan status saat konversi: {", ".join(f"{name}={count}" for name, count in sorted(status_counts.items())) or "—"}. Catatan berkas override: {"; ".join(status_issues) if status_issues else "tidak ada"}.

## CRS

EPSG:4326 (WGS84), derajat desimal, urutan GeoJSON `[bujur, lintang]`.
"""

    cakupan_path = ROOT / "data" / "sirine_cakupan.json"
    if cakupan_path.exists():
        cakupan = json.loads(cakupan_path.read_text(encoding="utf-8"))
        desa = cakupan["desa"]
        baris = cakupan["jumlah_baris"]
        gabungan = cakupan["gabungan"]
        def satu(nilai: float) -> str:
            return f"{float(nilai):.1f}"

        qa += f"""

## Radius sirine 1 km

{cakupan["metode"]}
Desa bernilai positif {desa["positif"]}: cocok tepat {desa["tepat"]}, fuzzy kecamatan {desa["fuzzy_kecamatan"]}, fuzzy kabupaten {desa["fuzzy_kabupaten"]}, gagal {desa["gagal"]}. Penduduk cocok {satu(desa["penduduk_cocok"])}; penduduk tanpa poligon {satu(desa["penduduk_gagal"])}.
Sirine berangka {cakupan["sirine"]}. Jumlah tiap baris, boleh tumpang tindih: tinggi {satu(baris["tinggi"])}, sedang {satu(baris["sedang"])}, rendah {satu(baris["rendah"])}, total {satu(baris["total"])}.
Gabungan tanpa hitung ganda: tinggi {satu(gabungan["tinggi"])}, sedang {satu(gabungan["sedang"])}, rendah {satu(gabungan["rendah"])}, total {satu(gabungan["total"])}.
Sensor tidak punya radius. Kelas adalah klasifikasi tampilan, bukan kelas resmi BNPB.
"""

    (ROOT / "data" / "QA.md").write_text(qa, encoding="utf-8")

    print(f"sirine {len(sirine_gj['features'])} sensor {len(sensor_gj['features'])} kab {len(titik_kab)}")
    print(f"terpapar {len(terpapar)} terdampak identik {identik} sumut {len(sumut)}")
    print(f"luar poligon sirine {len(sirine_out)} sensor {len(sensor_out)}")
    ket_sensor = Counter(f["properties"]["keterangan"] for f in sensor_lembar)
    if (
        len(sirine_gj["features"]) != EXPECT_SIRINE
        or len(sensor_lembar) != EXPECT_SENSOR
        or         len(sensor_gj["features"]) != 10
        or len(titik_kab) != 12
        or ket_sensor.get("Eksisting", 0) != 0
        or ket_sensor.get("Rencana") != 10
        or len(tidak_disurvei) != 28
        or len(kab_tidak) != 7
    ):
        print("jumlah tidak sesuai harapan", ket_sensor, len(tidak_disurvei), kab_tidak, file=sys.stderr)
        return 1
    print(
        f"id sirine ulang {len(id_sirine['dipakai_ulang'])} baru {len(id_sirine['dibuat'])} hapus {id_sirine['dihapus']}"
    )
    print(
        f"id sensor ulang {len(id_sensor['dipakai_ulang'])} baru {len(id_sensor['dibuat'])} hapus {len(id_sensor['dihapus'])}"
    )
    if sirine_fail or sensor_fail:
        print("ada DMS gagal", file=sys.stderr)
        return 1
    hard_status = [issue for issue in status_issues if not issue.startswith("data/status_override.csv tidak ada")]
    if hard_status:
        print("status override tidak valid:", *hard_status, sep="\n", file=sys.stderr)
        return 1
    print("status", dict(status_counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

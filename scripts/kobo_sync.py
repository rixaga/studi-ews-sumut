#!/usr/bin/env python3
"""Tarik kiriman KoboToolbox ke data/survei.geojson dan foto JPEG.

Tanpa KOBO_TOKEN skrip berhenti dengan kode 0 dan peringatan, tanpa mengubah berkas.
Uji lokal: python scripts/kobo_sync.py --mock scripts/fixtures/kobo_contoh.json --keluar /tmp/kobo-uji
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

SERVER = "https://kf.kobotoolbox.org"
ASET = "arcF6t2Vha9XPoM6orgw3W"
BIDANG = (
    "lokasi",
    "titik_id",
    "tipe_survei",
    "jenis",
    "nama_lokasi",
    "surveyor",
    "kelayakan",
    "alasan",
    "foto_1",
    "foto_2",
    "foto_3",
)

AKAR = Path(__file__).resolve().parents[1]


def peringatan(teks: str) -> None:
    print(f"peringatan: {teks}", file=sys.stderr)


PILIHAN = {
    "existing": "Verifikasi titik existing",
    "baru": "Usulan titik baru",
    "sirine": "Sirine",
    "sensor": "Sensor",
    "ya": "Ya",
    "tidak": "Tidak",
    "lahan_kosong": "Lahan kosong",
    "halaman_bangunan": "Halaman bangunan",
    "atap_bangunan": "Atap bangunan",
    "lainnya": "Lainnya",
    "pemerintah": "Pemerintah",
    "sekolah": "Sekolah",
    "desa": "Desa",
    "swasta": "Swasta",
    "none": "None",
    "2g": "2G",
    "3g": "3G",
    "4g": "4G",
    "mobil": "Mobil",
    "motor_saja": "Motor saja",
    "jalan_kaki": "Jalan kaki",
    "sulit_tidak_ada": "Sulit/tidak ada",
    "jembatan": "Jembatan",
    "tanggul": "Tanggul",
    "bendung": "Bendung",
    "batu": "Batu",
    "kerikil": "Kerikil",
    "pasir": "Pasir",
    "lumpur": "Lumpur",
    "beton": "Beton",
    "deli_serdang": "Deli Serdang",
    "humbang_hasundutan": "Humbang Hasundutan",
    "kota_binjai": "Kota Binjai",
    "kota_medan": "Kota Medan",
    "kota_padangsidimpuan": "Kota Padangsidimpuan",
    "kota_sibolga": "Kota Sibolga",
    "kota_tebing_tinggi": "Kota Tebing Tinggi",
    "langkat": "Langkat",
    "serdang_bedagai": "Serdang Bedagai",
    "tapanuli_selatan": "Tapanuli Selatan",
    "tapanuli_tengah": "Tapanuli Tengah",
    "tapanuli_utara": "Tapanuli Utara",
}


def ratakan(baris: dict) -> dict:
    hasil: dict = {}

    def jalan(obj: dict, awalan: str) -> None:
        for kunci, nilai in obj.items():
            nama = f"{awalan}/{kunci}" if awalan else str(kunci)
            if isinstance(nilai, dict) and not ({"lat", "lon", "lng"} & set(nilai)):
                jalan(nilai, nama)
            else:
                hasil[nama] = nilai

    jalan(baris, "")
    return hasil


def nilai_bidang(baris: dict, nama: str):
    if nama in baris and baris[nama] not in (None, ""):
        return baris[nama]
    akhir = f"/{nama}"
    for kunci, nilai in baris.items():
        if not isinstance(kunci, str):
            continue
        if kunci == nama or kunci.endswith(akhir):
            if nilai not in (None, ""):
                return nilai
    return ""


def teks(nilai, batas: int = 500) -> str:
    if isinstance(nilai, list):
        nilai = nilai[0] if nilai else ""
    if isinstance(nilai, dict):
        return ""
    return str(nilai or "").strip()[:batas]


def norm_id(nilai: str) -> str:
    token = teks(nilai, 64).upper().replace(" ", "")
    pendek = re.fullmatch(r"(SRN|SNS)-(\d+)", token)
    if pendek:
        return f"{pendek.group(1)}-DS-{int(pendek.group(2)):03d}"
    panjang = re.fullmatch(r"(SRN|SNS)-DS-(\d+)", token)
    if panjang:
        return f"{panjang.group(1)}-DS-{int(panjang.group(2)):03d}"
    return token


def kelayakan(nilai: str) -> tuple[str, str]:
    mentah = teks(nilai, 80).lower().replace("-", " ").replace("_", " ")
    mentah = re.sub(r"\s+", " ", mentah).strip()
    if mentah in {"layak dengan catatan", "dengan catatan"}:
        return "layak_dengan_catatan", "Layak dengan catatan"
    if mentah in {"tidak layak", "tidak"}:
        return "tidak_layak", "Tidak layak"
    if mentah == "layak":
        return "layak", "Layak"
    if not mentah:
        return "", ""
    return "layak_dengan_catatan", teks(nilai, 80)


def label_pilihan(nilai: str) -> str:
    token = teks(nilai, 80)
    return PILIHAN.get(token, token)


def parse_lokasi(nilai) -> tuple[float, float, float | None, float | None] | None:
    if isinstance(nilai, dict):
        try:
            return float(nilai["lat"]), float(nilai.get("lon", nilai.get("lng"))), None, None
        except (KeyError, TypeError, ValueError):
            return None
    bagian = str(nilai or "").replace(",", " ").split()
    if len(bagian) < 2:
        return None
    try:
        lat = float(bagian[0])
        lon = float(bagian[1])
    except ValueError:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    alt = None
    acc = None
    if len(bagian) > 2:
        try:
            alt = float(bagian[2])
        except ValueError:
            alt = None
    if len(bagian) > 3:
        try:
            acc = float(bagian[3])
        except ValueError:
            acc = None
    return lat, lon, alt, acc


def muat_json(url: str, token: str) -> dict:
    permintaan = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
    with urllib.request.urlopen(permintaan, timeout=60) as respons:
        return json.load(respons)


def tarik(token: str) -> list[dict]:
    uid = os.environ.get("KOBO_ASSET_UID", "").strip() or ASET
    url = f"{SERVER}/api/v2/assets/{uid}/data/?format=json"
    semua: list[dict] = []
    while url:
        muatan = muat_json(url, token)
        semua.extend(muatan.get("results") or [])
        berikut = muatan.get("next")
        url = berikut if isinstance(berikut, str) else ""
    return semua


def baca_masukan(path_mock: str | None, token: str) -> list[dict]:
    if path_mock:
        return json.loads(Path(path_mock).read_text(encoding="utf-8")).get("results") or []
    return tarik(token)


def unduh(url: str, token: str) -> bytes:
    if url.startswith("/"):
        url = SERVER + url
    permintaan = urllib.request.Request(url, headers={"Authorization": f"Token {token}"})
    with urllib.request.urlopen(permintaan, timeout=60) as respons:
        return respons.read()


def simpan_jpeg(data: bytes, tujuan: Path) -> None:
    from PIL import Image

    gambar = Image.open(BytesIO(data))
    gambar = gambar.convert("RGB")
    batas = 1200
    if max(gambar.size) > batas:
        gambar.thumbnail((batas, batas))
    tujuan.parent.mkdir(parents=True, exist_ok=True)
    gambar.save(tujuan, format="JPEG", quality=82, optimize=True)


def foto_dari(baris: dict, nama_bidang: str, token: str, folder: Path, urut: int, identitas: str) -> str:
    nama = teks(nilai_bidang(baris, nama_bidang), 300)
    if not nama:
        return ""
    lampiran = baris.get("_attachments") or []
    if not isinstance(lampiran, list):
        return ""
    cocok = None
    for item in lampiran:
        if not isinstance(item, dict):
            continue
        berkas = str(item.get("filename") or item.get("media_file") or "")
        if nama == berkas or berkas.endswith("/" + nama) or berkas.endswith(nama):
            cocok = item
            break
    if cocok is None:
        return ""
    tujuan = folder / f"{identitas}-{urut}.jpg"
    lokal = cocok.get("local_path")
    try:
        if lokal:
            data = Path(lokal).read_bytes()
        else:
            tautan = str(cocok.get("download_url") or cocok.get("download_large_url") or "")
            if not tautan or not token:
                return ""
            data = unduh(tautan, token)
        simpan_jpeg(data, tujuan)
    except (OSError, urllib.error.URLError, ValueError) as galat:
        peringatan(f"foto {nama} gagal: {galat}")
        return ""
    return f"survei_foto/{tujuan.name}"


def isi(properti: dict, kunci: str, nilai: str) -> None:
    if nilai:
        properti[kunci] = nilai


def jadi_fitur(baris: dict, token: str, folder: Path) -> dict | None:
    if not isinstance(baris, dict):
        return None
    baris = ratakan(baris)
    titik = parse_lokasi(nilai_bidang(baris, "lokasi"))
    if not titik:
        peringatan(f"lewati kiriman tanpa geopoint: {baris.get('_uuid') or baris.get('_id')}")
        return None
    lat, lon, alt, acc = titik
    identitas = teks(baris.get("_uuid") or baris.get("_id") or f"{lon:.5f}-{lat:.5f}", 80)
    identitas = re.sub(r"[^A-Za-z0-9_-]", "", identitas) or "survei"
    kode, label = kelayakan(teks(nilai_bidang(baris, "kelayakan")))
    foto = []
    for indeks, bidang in enumerate(("foto_1", "foto_2", "foto_3"), start=1):
        jalur = foto_dari(baris, bidang, token, folder, indeks, identitas)
        if jalur:
            foto.append(jalur)
    titik_id = norm_id(teks(nilai_bidang(baris, "titik_id")))
    jenis = teks(nilai_bidang(baris, "jenis"), 40).lower()
    if jenis not in {"sirine", "sensor"}:
        if titik_id.startswith("SRN"):
            jenis = "sirine"
        elif titik_id.startswith("SNS"):
            jenis = "sensor"
        else:
            jenis = ""
    properti = {
        "id": identitas,
        "titik_id": titik_id,
        "tipe_survei": teks(nilai_bidang(baris, "tipe_survei"), 40),
        "tipe_survei_label": label_pilihan(teks(nilai_bidang(baris, "tipe_survei"), 40)),
        "jenis": jenis,
        "nama_lokasi": teks(nilai_bidang(baris, "nama_lokasi"), 255),
        "surveyor": teks(nilai_bidang(baris, "surveyor"), 120),
        "kelayakan": kode,
        "kelayakan_label": label,
        "alasan": teks(nilai_bidang(baris, "alasan"), 2000),
        "tanggal": teks(nilai_bidang(baris, "tanggal"), 40),
        "waktu": teks(baris.get("_submission_time") or nilai_bidang(baris, "end"), 40),
        "foto_1": foto[0] if len(foto) > 0 else "",
        "foto_2": foto[1] if len(foto) > 1 else "",
        "foto_3": foto[2] if len(foto) > 2 else "",
    }
    for kunci in (
        "filter_kab",
        "kabupaten",
        "kecamatan",
        "desa",
        "kondisi_lahan",
        "kepemilikan",
        "kepemilikan_lain",
        "listrik_pln",
        "sinyal",
        "jangkauan_m",
        "akses_kendaraan",
        "tinggi_bangunan",
        "nama_sungai",
        "tipe_struktur",
        "struktur_lain",
        "lebar_sungai",
        "tinggi_jembatan",
        "riwayat_banjir",
        "tahun_banjir",
        "tinggi_genangan",
        "material_dasar",
        "akses_pemeliharaan",
        "ket_foto_1",
        "ket_foto_2",
        "ket_foto_3",
        "kontak_nama",
        "kontak_jabatan",
        "kontak_hp",
        "catatan",
    ):
        isi(properti, kunci, label_pilihan(teks(nilai_bidang(baris, kunci), 500)))
    geser = parse_lokasi(nilai_bidang(baris, "lokasi_geser"))
    if geser:
        properti["lokasi_geser"] = f"{geser[0]} {geser[1]}"
    if alt is not None:
        properti["altitude"] = alt
    if acc is not None:
        properti["akurasi_m"] = acc
    return {
        "type": "Feature",
        "id": identitas,
        "properties": properti,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


def tulis(folder_data: Path, fitur: list[dict], saat: str) -> None:
    foto = folder_data / "survei_foto"
    foto.mkdir(parents=True, exist_ok=True)
    dipakai = set()
    for item in fitur:
        for kunci in ("foto_1", "foto_2", "foto_3"):
            jalur = item["properties"].get(kunci) or ""
            if jalur:
                dipakai.add(Path(jalur).name)
    for berkas in foto.glob("*.jpg"):
        if berkas.name not in dipakai:
            berkas.unlink()
    kumpulan = {
        "type": "FeatureCollection",
        "name": "Hasil survei KoboToolbox",
        "disinkronkan": saat,
        "features": fitur,
    }
    tujuan = folder_data / "survei.geojson"
    tujuan.write_text(json.dumps(kumpulan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(fitur)} kiriman -> {tujuan}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", help="Berkas JSON hasil API, tanpa jaringan")
    parser.add_argument("--keluar", help="Folder data keluaran", default=str(AKAR / "data"))
    args = parser.parse_args()
    token = os.environ.get("KOBO_TOKEN", "").strip()
    if not args.mock and not token:
        peringatan("KOBO_TOKEN tidak ada. Sinkron dilewati. Tambahkan secret Actions KOBO_TOKEN.")
        return 0
    try:
        baris = baca_masukan(args.mock, token)
    except urllib.error.HTTPError as galat:
        peringatan(f"Kobo menolak permintaan ({galat.code}).")
        return 1
    except urllib.error.URLError as galat:
        peringatan(f"Kobo tidak terjangkau: {galat.reason}")
        return 1
    folder = Path(args.keluar)
    folder.mkdir(parents=True, exist_ok=True)
    saat = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    fitur = []
    for item in baris:
        hasil = jadi_fitur(item, "" if args.mock else token, folder / "survei_foto")
        if hasil:
            fitur.append(hasil)
    tulis(folder, fitur, saat)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

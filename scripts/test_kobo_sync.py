#!/usr/bin/env python3
"""Uji parser Kobo dengan berkas lokal. Tidak mengirim apa pun ke Kobo."""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

AKAR = Path(__file__).resolve().parents[1]
SKRIP = AKAR / "scripts" / "kobo_sync.py"


def gambar(path: Path) -> None:
    Image.new("RGB", (1600, 40), (20, 120, 40)).save(path, format="JPEG")


def main() -> int:
    env = os.environ.copy()
    env.pop("KOBO_TOKEN", None)
    kosong = subprocess.run([sys.executable, str(SKRIP)], cwd=AKAR, env=env, capture_output=True, text=True)
    if kosong.returncode != 0 or "KOBO_TOKEN" not in kosong.stderr:
        print(kosong.stdout, kosong.stderr)
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        foto = folder / "uji.jpg"
        gambar(foto)
        mock = {
            "results": [
                {
                    "_uuid": "uji-layak",
                    "_submission_time": "2026-11-01T08:00:00+00:00",
                    "lokasi": "3.611376 98.803491 12 4.5",
                    "titik_id": "SRN-001",
                    "tipe_survei": "titik_lama",
                    "jenis": "sirine",
                    "nama_lokasi": "Kantor uji",
                    "surveyor": "Penguji",
                    "kelayakan": "Layak",
                    "alasan": "Akses baik",
                    "foto_1": "uji.jpg",
                    "_attachments": [{"filename": "uji.jpg", "local_path": str(foto)}],
                },
                {
                    "_uuid": "uji/tidak",
                    "grup/lokasi": "3.70 98.90 0 8",
                    "grup/kelayakan": "tidak layak",
                    "nama_lokasi": "Lokasi baru uji",
                    "jenis": "sensor",
                    "alasan": "Tergenang",
                },
                {"_uuid": "tanpa-titik", "nama_lokasi": "Rusak"},
            ]
        }
        berkas = folder / "mock.json"
        berkas.write_text(json.dumps(mock), encoding="utf-8")
        keluar = folder / "keluar"
        hasil = subprocess.run(
            [sys.executable, str(SKRIP), "--mock", str(berkas), "--keluar", str(keluar)],
            cwd=AKAR,
            capture_output=True,
            text=True,
        )
        if hasil.returncode != 0:
            print(hasil.stdout, hasil.stderr)
            return 1
        data = json.loads((keluar / "survei.geojson").read_text(encoding="utf-8"))
        if data["type"] != "FeatureCollection" or len(data["features"]) != 2:
            print("jumlah fitur", data)
            return 1
        pertama = data["features"][0]
        if pertama["properties"]["titik_id"] != "SRN-DS-001":
            print("id", pertama["properties"]["titik_id"])
            return 1
        if pertama["properties"]["kelayakan"] != "layak":
            return 1
        if pertama["geometry"]["coordinates"] != [98.803491, 3.611376]:
            print(pertama["geometry"])
            return 1
        jpeg = keluar / "survei_foto" / "uji-layak-1.jpg"
        if not jpeg.exists() or jpeg.stat().st_size < 100:
            print("foto hilang")
            return 1
        with Image.open(jpeg) as gambar_hasil:
            if max(gambar_hasil.size) > 1200 or gambar_hasil.format != "JPEG":
                print(gambar_hasil.size, gambar_hasil.format)
                return 1
        kedua = data["features"][1]
        if kedua["properties"]["kelayakan"] != "tidak_layak":
            print(kedua["properties"])
            return 1
        if "/" in kedua["properties"]["id"]:
            return 1
    print("uji kobo lulus")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

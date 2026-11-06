import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = [
  "sirine.geojson",
  "sirine_buffer_1km.geojson",
  "sirine_cakupan.json",
  "sensor.geojson",
  "penduduk_terpapar.json",
  "alternatif_lokasi.json",
  "tidak_disurvei.json",
  "batas/sumatera_utara_adm1.geojson",
  "points_das.csv",
  "mismatch_points.csv",
  "wilayah/das_sumut.geojson",
  "wilayah/adm2_kab.geojson",
  "wilayah/adm3_kec.geojson",
  "wilayah/adm4_desa.geojson",
  "survei.geojson",
  "pos_hidrologi_bbws2.geojson",
];

for (const rel of files) {
  const from = resolve("data", rel);
  const to = resolve("public/data", rel);
  if (!existsSync(from)) {
    console.error(`Berkas data hilang: ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

const fotoDari = resolve("data", "survei_foto");
const fotoKe = resolve("public/data", "survei_foto");
if (existsSync(fotoDari)) {
  mkdirSync(fotoKe, { recursive: true });
  cpSync(fotoDari, fotoKe, { recursive: true });
}

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = [
  "sirine.geojson",
  "sensor.geojson",
  "penduduk_terpapar.json",
  "alternatif_lokasi.json",
  "batas/sumatera_utara_adm1.geojson",
  "hidro/rivers_sumut.geojson",
  "hidro/das_sumut_hydrobasins_l7.geojson",
  "points_das.csv",
  "mismatch_points.csv",
  "wilayah/das_sumut.geojson",
  "wilayah/adm2_kab.geojson",
  "wilayah/adm3_kec.geojson",
  "wilayah/adm4_desa.geojson",
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

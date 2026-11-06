import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { BatasProvinsi, Titik } from "./model";
import { asset, escapeHtml, formatBulat, formatDerajat, labelStatusSumber, STATUS_LABEL } from "./model";

export type RasterKind =
  | "bahaya"
  | "proxy"
  | "batas-das"
  | "batas-kab"
  | "batas-kec"
  | "batas-desa"
  | "jalan-rtrw"
  | "sungai-rtrw"
  | "danau-rtrw"
  | "pos-hidro";
export type BatasJenis = "das" | "kab" | "kec" | "desa";
export type RasterState = "off" | "loading" | "ready" | "error" | "partial";
export type DasarPeta = "jalan" | "satelit" | "satelit-label";

const BAHAYA_URL =
  "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image";

const RENDERING_RULE_KELAS =
  '{"rasterFunction":"Colormap","rasterFunctionArguments":{"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":{"InputRanges":[0.01,0.333,0.333,0.666,0.666,1.01],"OutputValues":[1,2,3],"NoDataRanges":[-1,0.01]}},"Colormap":[[1,56,168,0],[2,255,255,0],[3,255,0,0]]}}';
// ImageServer ini mengabaikan ColorRamp pada Stretch dan tetap mengembalikan abu-abu.
// Ramp tampilan memakai Colormap 16 langkah kuning–jingga–merah. Di bawah 0,01 jadi NoData.
const RENDERING_RULE_RAMP =
  '{"rasterFunction":"Colormap","rasterFunctionArguments":{"Colormap":[[1,255,255,0],[2,255,240,0],[3,255,224,0],[4,255,209,0],[5,255,194,0],[6,255,178,0],[7,255,163,0],[8,255,148,0],[9,255,131,0],[10,255,112,0],[11,255,93,0],[12,255,75,0],[13,255,56,0],[14,255,37,0],[15,255,19,0],[16,255,0,0]],"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":{"InputRanges":[0.01,0.0725,0.0725,0.135,0.135,0.1975,0.1975,0.26,0.26,0.3225,0.3225,0.385,0.385,0.4475,0.4475,0.51,0.51,0.5725,0.5725,0.635,0.635,0.6975,0.6975,0.76,0.76,0.8225,0.8225,0.885,0.885,0.9475,0.9475,1.01],"OutputValues":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],"NoDataRanges":[-1,0.01],"AllowUnmatched":false}}}}';

const IKON: Array<[string, string]> = [
  ["sirene", "sirene.png"],
  ["sirene-usulan-studi", "sirene_usulan_studi.png"],
  ["sirene-usulan-bpbd", "sirene_usulan_bpbd.png"],
  ["sirene-hasil-survei", "sirene_hasil_survei.png"],
  ["sensor", "sensor_banjir.png"],
  ["sensor-usulan-studi", "sensor_banjir_usulan_studi.png"],
  ["sensor-usulan-bpbd", "sensor_banjir_usulan_bpbd.png"],
  ["sensor-hasil-survei", "sensor_banjir_hasil_survei.png"],
  ["usulan-baru-sirine", "usulan_baru_sirine.png"],
  ["usulan-baru-sensor", "usulan_baru_sensor.png"],
  ["tanda-hapus", "tanda_hapus.png"],
];

type Ring = number[][];
type Stop = () => void;

export type StudyMap = {
  setTitik(sirine: Titik[], sensor: Titik[]): void;
  setVisible(lapisan: "sirine" | "sensor", nyala: boolean): void;
  setRadius(nyala: boolean, idSirine: string[]): void;
  setBahaya(nyala: boolean, opasitas: number, klasifikasi: boolean): void;
  setProxy(nyala: boolean, opasitas: number): void;
  setBatas(jenis: BatasJenis, nyala: boolean): Promise<void>;
  setJalanRtrw(nyala: boolean): Promise<void>;
  setSungaiRtrw(nyala: boolean): Promise<void>;
  setDanauRtrw(nyala: boolean): Promise<void>;
  setPosHidro(nyala: boolean): Promise<void>;
  setUsulan(fitur: GeoJSON.Feature[], tampil: boolean): void;
  setSurvei(fitur: GeoJSON.Feature[], tampil: boolean): void;
  aturIndeksSurvei(id: string[]): void;
  aturAksiUsulan(admin: boolean, sunting: (id: string) => void, hapus: (id: string) => void): void;
  aturModeTambah(nyala: boolean, onKlik: ((lon: number, lat: number) => void) | null): void;
  aturModeHapus(nyala: boolean, onTandai: ((info: { id: string; sumber: "asli" | "usulan"; nama: string }) => void) | null): void;
  aturAksiTanda(aksi: { admin: boolean; pulihkan: (id: string, sumber: "asli" | "usulan") => void } | null): void;
  aturDasar(mode: DasarPeta): void;
  taruhPenanda(lon: number, lat: number): void;
  hapusPenanda(): void;
  fokusTitik(titik: Titik): void;
  fitTitik(titik: Titik[]): void;
  fitProvinsi(): void;
  resize(): void;
};

function outerRings(geometry: BatasProvinsi["features"][number]["geometry"]): Ring[] {
  if (geometry.type === "Polygon") return [geometry.coordinates[0] as Ring];
  return (geometry.coordinates as number[][][][]).map((polygon) => polygon[0]);
}

function bboxOf(rings: Ring[]): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

function koleksi(features: Titik[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: features as GeoJSON.Feature[] };
}

function jarakMeter(a: [number, number], b: [number, number]): number {
  const lintang = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (a[0] - b[0]) * Math.cos(lintang) * 111_320;
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function denganSpider(titik: Titik[]): Titik[] {
  const induk = titik.map((_, index) => index);
  const cari = (index: number): number => (induk[index] === index ? index : (induk[index] = cari(induk[index])));
  for (let i = 0; i < titik.length; i += 1) {
    for (let j = i + 1; j < titik.length; j += 1) {
      if (jarakMeter(titik[i].geometry.coordinates, titik[j].geometry.coordinates) <= 40) {
        induk[cari(j)] = cari(i);
      }
    }
  }
  const kelompok: Record<number, number[]> = {};
  titik.forEach((_, index) => {
    const akar = cari(index);
    const daftar = kelompok[akar] ?? [];
    daftar.push(index);
    kelompok[akar] = daftar;
  });
  return titik.map((fitur, index) => {
    const daftar = kelompok[cari(index)] ?? [index];
    const urutan = daftar.indexOf(index);
    const spider: [number, number] = daftar.length < 2
      ? [0, 0]
      : [
          Math.cos((2 * Math.PI * urutan) / daftar.length - Math.PI / 2) * (16 + daftar.length),
          Math.sin((2 * Math.PI * urutan) / daftar.length - Math.PI / 2) * (16 + daftar.length),
        ];
    return {
      ...fitur,
      properties: { ...fitur.properties, spider },
    };
  });
}

function ikonSirine(): maplibregl.ExpressionSpecification {
  return [
    "match",
    ["get", "status"],
    "usulan_studi",
    "sirene-usulan-studi",
    "usulan_bpbd",
    "sirene-usulan-bpbd",
    "hasil_survei",
    "sirene-hasil-survei",
    "sirene",
  ];
}

function ikonSensor(): maplibregl.ExpressionSpecification {
  const menurutStatus: maplibregl.ExpressionSpecification = [
    "match",
    ["get", "status"],
    "usulan_studi",
    "sensor-usulan-studi",
    "usulan_bpbd",
    "sensor-usulan-bpbd",
    "hasil_survei",
    "sensor-hasil-survei",
    "sensor",
  ];
  return ["case", ["==", ["get", "keterangan"], "Rencana"], "sensor-rencana", menurutStatus];
}

function gambarSensorRencana(): ImageData {
  const ukuran = 64;
  const kanvas = document.createElement("canvas");
  kanvas.width = ukuran;
  kanvas.height = ukuran;
  const g = kanvas.getContext("2d");
  if (!g) throw new Error("kanvas sensor rencana");
  g.translate(32, 28);
  g.fillStyle = "#EF6C00";
  g.strokeStyle = "#ffffff";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, -16);
  g.lineTo(14, 8);
  g.lineTo(-14, 8);
  g.closePath();
  g.fill();
  g.stroke();
  return g.getImageData(0, 0, ukuran, ukuran);
}

const namaLokasi: maplibregl.ExpressionSpecification = [
  "case",
  [">", ["length", ["to-string", ["coalesce", ["get", "remark"], ""]]], 0],
  ["get", "remark"],
  [">", ["length", ["to-string", ["coalesce", ["get", "nama"], ""]]], 0],
  ["get", "nama"],
  ["get", "id"],
];

const tataLabel = {
  "text-field": namaLokasi,
  "text-font": ["Noto Sans Regular"],
  "text-size": 12,
  "text-anchor": "top" as const,
  "text-offset": [0, 0.35] as [number, number],
  "text-max-width": 12,
  "text-padding": 4,
  "text-allow-overlap": false,
  "text-ignore-placement": false,
  "text-optional": true,
};

function jenisTitik(properties: Record<string, unknown>): string {
  const jenis = String(properties.jenis ?? "");
  const keterangan = String(properties.keterangan ?? "");
  if (jenis === "sirine") return "Sirine";
  if (jenis === "sensor" && keterangan === "Rencana") return "Sensor rencana";
  if (jenis === "sensor" && keterangan === "Eksisting") return "Sensor existing";
  if (jenis === "sensor") return "Sensor";
  return jenis || "—";
}

function judulTitik(properties: Record<string, unknown>): string {
  const remark = String(properties.remark ?? "").trim();
  const nama = String(properties.nama ?? "").trim();
  return remark || nama || String(properties.id ?? "Titik");
}

function popupHtml(properties: Record<string, unknown>, coordinates: [number, number]): string {
  const status = String(properties.status ?? "");
  const statusLabel = STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status;
  const baris: Array<[string, string]> = [
    ["ID", String(properties.id ?? "—")],
    ["Jenis", jenisTitik(properties)],
    ["Status", statusLabel],
    ["Sumber status", labelStatusSumber(String(properties.status_sumber ?? ""))],
    ["Kabupaten/kota (sumber)", String(properties.wadmkk ?? "—")],
    ["Nama pada peta", String(properties.wadmkk_tampil ?? "—")],
    ["Kecamatan", String(properties.wadmkc ?? "—")],
    ["Desa/kelurahan", String(properties.wadmkd ?? "—")],
    ["Keterangan", String(properties.keterangan ?? "—")],
    ["Remark", String(properties.remark ?? "—")],
    ["X (DMS)", String(properties.x_dms ?? "—")],
    ["Y (DMS)", String(properties.y_dms ?? "—")],
    ["Bujur", formatDerajat(coordinates[0])],
    ["Lintang", formatDerajat(coordinates[1])],
    ["Baris Excel", String(properties.baris_excel ?? "—")],
  ];
  if (properties.jenis === "sirine" && properties.cakupan_total != null) {
    baris.push(
      ["Penduduk tercover", formatBulat(Number(properties.cakupan_tercover))],
      ["Bahaya tinggi", formatBulat(Number(properties.cakupan_tinggi))],
      ["Bahaya sedang", formatBulat(Number(properties.cakupan_sedang))],
      ["Bahaya rendah", formatBulat(Number(properties.cakupan_rendah))],
      ["Total", formatBulat(Number(properties.cakupan_total))],
    );
  }
  if (properties.cek_wilayah) {
    const beda: Array<[string, unknown]> = [
      ["Kabupaten/kota pada poligon", properties.cek_adm2_name],
      ["Kecamatan pada poligon", properties.cek_adm3_name],
      ["Desa pada poligon", properties.cek_adm4_name],
      ["Kode desa poligon", properties.cek_adm4_pcode],
    ];
    for (const [label, value] of beda) {
      if (value) baris.push([label, String(value)]);
    }
  }
  const isi = baris
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const cek = properties.cek_wilayah
    ? `<p class="popup-catatan">Cek wilayah: nama pada poligon HDX COD-AB berbeda dari teks Excel. Nama Excel tidak diubah.</p>`
    : "";
  const lencana = indeksSurvei[normIdSurvei(String(properties.id ?? ""))]
    ? `<p class="lencana-survei">Sudah disurvei</p>`
    : "";
  const catatanRadius =
    properties.jenis === "sirine" && properties.cakupan_total != null
      ? `<p class="popup-catatan">Radius sirine 1 km. Angka per sirine bisa saling tumpang tindih. Kelas adalah klasifikasi tampilan, bukan kelas resmi BNPB.</p>`
      : "";
  return `<h3>${escapeHtml(judulTitik(properties))}</h3>${lencana}<p class="popup-catatan">Status bukan kolom Excel. Koordinat WGS84 dari teks DMS.</p>${cek}${catatanRadius}${blokDihapus(properties, aksiTanda?.admin === true)}<table>${isi}</table>`;
}

const indeksSurvei: Record<string, true> = {};

function normIdSurvei(nilai: string): string {
  const token = nilai.trim().toUpperCase().replace(/\s+/g, "");
  const pendek = /^(SRN|SNS)-(\d+)$/.exec(token);
  if (pendek) return `${pendek[1]}-DS-${pendek[2].padStart(3, "0")}`;
  const panjang = /^(SRN|SNS)-DS-(\d+)$/.exec(token);
  if (panjang) return `${panjang[1]}-DS-${panjang[2].padStart(3, "0")}`;
  return token;
}

function fotoSurvei(properties: Record<string, unknown>): string {
  const jalur = [properties.foto_1, properties.foto_2, properties.foto_3].map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!jalur.length) return "";
  const tombol = jalur
    .map((item) => {
      const src = asset(item.startsWith("data/") ? item : `data/${item}`);
      return `<button type="button" class="survei-foto" data-foto="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="Foto survei" /></button>`;
    })
    .join("");
  return `<div class="survei-foto-baris">${tombol}</div>`;
}

function popupSurvei(properties: Record<string, unknown>): string {
  const urutan: Array<[string, string]> = [
    ["titik_id", "Titik terkait"],
    ["tipe_survei_label", "Tipe survei"],
    ["jenis", "Jenis"],
    ["nama_lokasi", "Nama lokasi"],
    ["kabupaten", "Kabupaten/kota"],
    ["kecamatan", "Kecamatan"],
    ["desa", "Desa/kelurahan"],
    ["surveyor", "Surveyor"],
    ["kelayakan_label", "Kelayakan"],
    ["alasan", "Alasan"],
    ["kondisi_lahan", "Kondisi lahan"],
    ["kepemilikan", "Kepemilikan"],
    ["kepemilikan_lain", "Kepemilikan lain"],
    ["listrik_pln", "Listrik PLN"],
    ["sinyal", "Sinyal"],
    ["jangkauan_m", "Jangkauan (m)"],
    ["akses_kendaraan", "Akses kendaraan"],
    ["tinggi_bangunan", "Tinggi bangunan (m)"],
    ["nama_sungai", "Nama sungai"],
    ["tipe_struktur", "Tipe struktur"],
    ["struktur_lain", "Struktur lain"],
    ["lebar_sungai", "Lebar sungai (m)"],
    ["tinggi_jembatan", "Tinggi ke muka air (m)"],
    ["riwayat_banjir", "Riwayat banjir"],
    ["tahun_banjir", "Tahun banjir"],
    ["tinggi_genangan", "Tinggi genangan (cm)"],
    ["material_dasar", "Material dasar"],
    ["akses_pemeliharaan", "Akses pemeliharaan"],
    ["lokasi_geser", "Lokasi pengganti"],
    ["kontak_nama", "Narahubung"],
    ["kontak_jabatan", "Jabatan"],
    ["kontak_hp", "No HP"],
    ["catatan", "Catatan"],
    ["tanggal", "Tanggal"],
    ["waktu", "Waktu kirim"],
  ];
  const baris = urutan
    .map(([kunci, label]) => [label, String(properties[kunci] ?? "").trim()] as [string, string])
    .filter(([, value]) => value);
  if (!baris.some(([label]) => label === "Kelayakan") && properties.kelayakan) {
    baris.push(["Kelayakan", String(properties.kelayakan)]);
  }
  if (properties.akurasi_m != null && properties.akurasi_m !== "") baris.push(["Akurasi (m)", String(properties.akurasi_m)]);
  const isi = baris.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  const nama = String(properties.nama_lokasi || properties.titik_id || "Hasil survei");
  return `<h3>${escapeHtml(nama)}</h3><p class="popup-catatan">Hasil survei KoboToolbox.</p>${fotoSurvei(properties)}<table>${isi}</table>`;
}

function formatWaktu(iso: string): string {
  if (!iso) return "—";
  const tanggal = new Date(iso);
  if (Number.isNaN(tanggal.getTime())) return iso;
  return tanggal.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function blokDihapus(properties: Record<string, unknown>, admin: boolean): string {
  const ditandai = properties.tanda === "dihapus" || properties.dihapus === true;
  if (!ditandai) return "";
  const oleh = String(properties.dihapus_oleh || "—");
  const waktu = formatWaktu(String(properties.dihapus_waktu || ""));
  const tombol = admin ? `<p class="popup-aksi"><button type="button" data-pulihkan>Pulihkan</button></p>` : "";
  return `<p class="popup-dihapus"><strong>Dihapus</strong><br>Oleh ${escapeHtml(oleh)}<br>${escapeHtml(waktu)}</p>${tombol}`;
}

let aksiTanda: {
  admin: boolean;
  pulihkan: (id: string, sumber: "asli" | "usulan") => void;
} | null = null;

function pasangPulihkan(popup: maplibregl.Popup, id: string, sumber: "asli" | "usulan") {
  popup.getElement()?.querySelector("[data-pulihkan]")?.addEventListener("click", () => {
    aksiTanda?.pulihkan(id, sumber);
    popup.remove();
  });
}

const CITRA_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CITRA_LABEL_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const CITRA_ATRIBUSI = "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export async function createStudyMap(
  container: HTMLElement,
  batas: BatasProvinsi,
  onRaster: (kind: RasterKind, state: RasterState) => void,
  dasarAwal: DasarPeta = "jalan",
): Promise<StudyMap> {
  const geometry = batas.features[0]?.geometry;
  if (!geometry) throw new Error("Batas provinsi kosong");
  const rings = outerRings(geometry);
  const [west, south, east, north] = bboxOf(rings);
  const provinceBounds = new maplibregl.LngLatBounds([west, south], [east, north]);

  const map = new maplibregl.Map({
    container,
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [(west + east) / 2, (south + north) / 2],
    zoom: 6,
    minZoom: 3.5,
    maxZoom: 19,
    renderWorldCopies: false,
    attributionControl: { compact: true },
    fadeDuration: 0,
  });
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(tombolSeluruhSumut(() => lihatSumut(true)), "top-right");

  await new Promise<void>((resolve) => {
    map.once("load", () => resolve());
  });

  const tampakJalan: Record<string, "visible" | "none"> = {};
  for (const layer of map.getStyle().layers) {
    tampakJalan[layer.id] = map.getLayoutProperty(layer.id, "visibility") === "none" ? "none" : "visible";
  }
  map.addSource("citra", {
    type: "raster",
    tiles: [CITRA_URL],
    tileSize: 256,
    maxzoom: 19,
    attribution: CITRA_ATRIBUSI,
  });
  map.addSource("citra-label", {
    type: "raster",
    tiles: [CITRA_LABEL_URL],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Boundaries and places © Esri",
  });
  const lapisanPertama = map.getStyle().layers[0]?.id;
  map.addLayer({ id: "citra-label", type: "raster", source: "citra-label", layout: { visibility: "none" } }, lapisanPertama);
  map.addLayer({ id: "citra", type: "raster", source: "citra", layout: { visibility: "none" } }, "citra-label");
  const terapkanDasar = (mode: DasarPeta) => {
    const jalan = mode === "jalan";
    for (const [id, tampak] of Object.entries(tampakJalan)) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", jalan ? tampak : "none");
    }
    map.setLayoutProperty("citra", "visibility", jalan ? "none" : "visible");
    map.setLayoutProperty("citra-label", "visibility", mode === "satelit-label" ? "visible" : "none");
    aturSelubungBatas(!jalan);
  };
  const aturSelubungBatas = (satelit: boolean) => {
    const tampak = satelit ? "visible" : "none";
    for (const id of ["batas-kec-casing", "batas-desa-casing"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", tampak);
    }
  };
  terapkanDasar(dasarAwal);

  for (const [name, file] of IKON) {
    const image = await map.loadImage(asset(`icons/${file}`));
    if (!map.hasImage(name)) map.addImage(name, image.data, { pixelRatio: 2 });
  }
  if (!map.hasImage("sensor-rencana")) map.addImage("sensor-rencana", gambarSensorRencana(), { pixelRatio: 2 });

  map.addSource("sumut", {
    type: "geojson",
    data: batas as GeoJSON.FeatureCollection,
    attribution: "Batas provinsi © geoBoundaries / OpenStreetMap contributors (ODbL)",
  });
  map.addSource("titik", {
    type: "geojson",
    data: koleksi([]),
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
    clusterProperties: {
      sirine: ["+", ["case", ["==", ["get", "jenis"], "sirine"], 1, 0]],
      sensor: ["+", ["case", ["==", ["get", "jenis"], "sensor"], 1, 0]],
      usulan_studi: ["+", ["case", ["==", ["get", "status"], "usulan_studi"], 1, 0]],
      usulan_bpbd: ["+", ["case", ["==", ["get", "status"], "usulan_bpbd"], 1, 0]],
      hasil_survei: ["+", ["case", ["==", ["get", "status"], "hasil_survei"], 1, 0]],
      belum_ditentukan: ["+", ["case", ["==", ["get", "status"], "belum_ditentukan"], 1, 0]],
    },
  });

  map.addLayer({
    id: "sumut-garis",
    type: "line",
    source: "sumut",
    paint: { "line-color": "#1c1c1f", "line-width": 1.75 },
  });
  map.addSource("buffer-sirine", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "buffer-sirine-garis",
    type: "line",
    source: "buffer-sirine",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#00E676",
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 14, 2.6],
      "line-dasharray": [2, 1.4],
    },
  });
  tambahKlaster(map);
  const tataIkon = {
    "icon-anchor": "bottom" as const,
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-offset": ["get", "spider"] as maplibregl.ExpressionSpecification,
  };
  map.addLayer({
    id: "titik-sirine",
    type: "symbol",
    source: "titik",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "jenis"], "sirine"]],
    layout: { ...tataIkon, "icon-image": ikonSirine() },
  });
  map.addLayer({
    id: "titik-sensor",
    type: "symbol",
    source: "titik",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "jenis"], "sensor"]],
    layout: { ...tataIkon, "icon-image": ikonSensor() },
  });
  map.addSource("usulan", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "usulan-titik",
    type: "symbol",
    source: "usulan",
    layout: {
      "icon-image": [
        "match",
        ["get", "jenis"],
        "sensor",
        "usulan-baru-sensor",
        "usulan-baru-sirine",
      ],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      visibility: "none",
    },
  });
  map.addLayer({
    id: "titik-label",
    type: "symbol",
    source: "titik",
    minzoom: 13,
    filter: ["!", ["has", "point_count"]],
    layout: tataLabel,
    paint: {
      "text-color": "#1c1c1f",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
    },
  });
  const tataSilang = {
    "icon-image": "tanda-hapus" as const,
    "icon-anchor": "bottom" as const,
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-offset": ["coalesce", ["get", "spider"], ["literal", [0, 0]]] as maplibregl.ExpressionSpecification,
  };
  map.addLayer({
    id: "titik-silang",
    type: "symbol",
    source: "titik",
    filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "tanda"], "dihapus"]],
    layout: tataSilang,
  });
  map.addLayer({
    id: "usulan-silang",
    type: "symbol",
    source: "usulan",
    filter: ["==", ["get", "tanda"], "dihapus"],
    layout: { ...tataSilang, visibility: "none" },
  });
  map.addSource("survei", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "survei-titik",
    type: "circle",
    source: "survei",
    paint: {
      "circle-radius": 7,
      "circle-color": [
        "match",
        ["get", "kelayakan"],
        "layak",
        "#2E7D32",
        "layak_dengan_catatan",
        "#F9A825",
        "dengan_catatan",
        "#F9A825",
        "tidak_layak",
        "#C62828",
        "#6b7280",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: "usulan-label",
    type: "symbol",
    source: "usulan",
    minzoom: 13,
    layout: { ...tataLabel, visibility: "none" },
    paint: {
      "text-color": "#1c1c1f",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.4,
    },
  });

  for (const layer of ["titik-sirine", "titik-sensor", "titik-clusters"] as const) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
  const klikAsli = (event: maplibregl.MapLayerMouseEvent) => {
    const props = (event.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    if (tandaiDari(props, "asli")) return;
    bukaPopup(map, event);
  };
  map.on("click", "titik-sirine", klikAsli);
  map.on("click", "titik-sensor", klikAsli);
  map.on("click", "titik-label", klikAsli);
  map.on("click", "titik-silang", klikAsli);
  const bukaUsulan = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== "Point") return;
    bukaPopupUsulanDari(map, feature.geometry.coordinates as [number, number], (feature.properties ?? {}) as Record<string, unknown>, {
      admin: adminUsulan,
      sunting: onSuntingUsulan,
      hapus: onHapusUsulan,
    });
  };
  const klikUsulan = (event: maplibregl.MapLayerMouseEvent) => {
    const props = (event.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    if (tandaiDari(props, "usulan")) return;
    bukaUsulan(event);
  };
  map.on("click", "usulan-titik", klikUsulan);
  map.on("click", "usulan-label", klikUsulan);
  map.on("click", "usulan-silang", klikUsulan);
  map.on("mouseenter", "usulan-titik", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "usulan-titik", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "survei-titik", (event) => {
    const feature = event.features?.[0];
    if (!feature || feature.geometry.type !== "Point") return;
    popupKlaster?.remove();
    new maplibregl.Popup({ maxWidth: "320px", className: "ews-popup" })
      .setLngLat(feature.geometry.coordinates as [number, number])
      .setHTML(popupSurvei((feature.properties ?? {}) as Record<string, unknown>))
      .addTo(map);
  });
  map.on("mouseenter", "survei-titik", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "survei-titik", () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "titik-clusters", (event) => bukaKlaster(map, event));
  map.on("mouseenter", "titik-clusters", (event) => tampilRincianKlaster(map, event));
  map.on("mouseleave", "titik-clusters", () => popupKlaster?.remove());

  const lepas: Partial<Record<RasterKind, Stop>> = {};
  let popupTitik: maplibregl.Popup | null = null;
  let simpanSirine: Titik[] = [];
  let simpanSensor: Titik[] = [];
  let lihatSirine = true;
  let lihatSensor = true;
  let lihatRadius = true;
  let bufferSemua: GeoJSON.Feature[] = [];
  let idRadius = new Set<string>();
  const tulisRadius = () => {
    const fitur = lihatRadius ? bufferSemua.filter((item) => idRadius.has(String(item.properties?.id ?? ""))) : [];
    (map.getSource("buffer-sirine") as GeoJSONSource).setData({ type: "FeatureCollection", features: fitur });
    const tampak = lihatRadius && fitur.length ? "visible" : "none";
    if (map.getLayer("buffer-sirine-garis")) map.setLayoutProperty("buffer-sirine-garis", "visibility", tampak);
  };
  let adminUsulan = false;
  let onSuntingUsulan: ((id: string) => void) | null = null;
  let onHapusUsulan: ((id: string) => void) | null = null;
  let modeTambah = false;
  let onKlikKosong: ((lon: number, lat: number) => void) | null = null;
  let modeHapus = false;
  let onTandai: ((info: { id: string; sumber: "asli" | "usulan"; nama: string }) => void) | null = null;
  const tandaiDari = (properties: Record<string, unknown>, sumber: "asli" | "usulan") => {
    if (!modeHapus || !onTandai) return false;
    onTandai({ id: String(properties.id ?? ""), sumber, nama: judulTitik(properties) });
    return true;
  };
  let penanda: maplibregl.Marker | null = null;
  map.on("click", (event) => {
    if (!modeTambah || !onKlikKosong) return;
    const lapisanKlik = ["titik-sirine", "titik-sensor", "titik-clusters", "titik-label", "usulan-titik", "usulan-label"];
    if (map.getLayer("pos-hidro")) lapisanKlik.push("pos-hidro");
    const kena = map.queryRenderedFeatures(event.point, { layers: lapisanKlik });
    if (kena.length) return;
    onKlikKosong(event.lngLat.lng, event.lngLat.lat);
  });

  function tulisTitik() {
    const tampil = [
      ...(lihatSirine ? simpanSirine : []),
      ...(lihatSensor ? simpanSensor : []),
    ];
    (map.getSource("titik") as GeoJSONSource).setData(koleksi(denganSpider(tampil)));
  }
  let bahayaUrl = "";

  function paddingSumut(): maplibregl.PaddingOptions {
    const lebar = map.getContainer().clientWidth;
    if (lebar < 700) return { top: 92, right: 52, bottom: 150, left: 16 };
    return { top: 76, right: 64, bottom: 88, left: 16 };
  }

  function lihatSumut(animasi: boolean) {
    map.fitBounds(provinceBounds, { padding: paddingSumut(), duration: animasi ? 650 : 0 });
  }

  function fitProvinsi() {
    lihatSumut(true);
  }

  lihatSumut(false);
  void pasangBatas(map, onRaster, "kab", true);

  const ATRIBUSI_SIPINTAR = "SiPintar Sumut – Perda No. 2/2017 RTRW Provinsi Sumatera Utara";
  const tumpukSipintar = [
    "titik-clusters",
    "batas-kab-casing",
    "batas-kec-garis",
    "batas-desa-garis",
    "sumut-garis",
    "jalan-utama-garis",
    "jalan-ka-garis",
    "jalan-lokal-garis",
    "sungai-rtrw-label",
    "sungai-rtrw-garis",
    "sungai-rtrw-isi",
    "danau-rtrw-label",
    "danau-rtrw-garis",
    "danau-rtrw-isi",
  ];
  const sebelumSipintar = (id: string) => {
    const atas = tumpukSipintar.slice(0, Math.max(tumpukSipintar.indexOf(id), 0));
    for (let i = atas.length - 1; i >= 0; i -= 1) {
      if (map.getLayer(atas[i])) return atas[i];
    }
    return "titik-clusters";
  };
  const lepasLapisan = (lapisan: string[], sumber: string) => {
    for (const id of lapisan) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(sumber)) map.removeSource(sumber);
  };
  const ambilVektor = async (path: string) => {
    const ada = vektorCache[path];
    if (ada) return ada;
    const response = await fetch(asset(path));
    if (!response.ok) throw new Error(path);
    const data = (await response.json()) as GeoJSON.FeatureCollection;
    vektorCache[path] = data;
    return data;
  };
  let popupAir: maplibregl.Popup | null = null;
  const klikAir = (jenis: string) => (event: maplibregl.MapLayerMouseEvent) => {
    const nama = String(event.features?.[0]?.properties?.nama ?? "").trim();
    popupAir?.remove();
    popupKlaster?.remove();
    const judul = nama || jenis;
    const barisNama = nama ? `<tr><th>Nama</th><td>${escapeHtml(nama)}</td></tr>` : "";
    popupAir = new maplibregl.Popup({ maxWidth: "280px", className: "ews-popup" })
      .setLngLat(event.lngLat)
      .setHTML(
        `<h3>${escapeHtml(judul)}</h3><p class="popup-catatan">SiPintar Sumut, RTRW Provinsi Sumatera Utara (Perda No. 2/2017).</p><table>${barisNama}<tr><th>Lapisan</th><td>${escapeHtml(jenis)}</td></tr></table>`,
      )
      .addTo(map);
  };
  const klikAirTerpasang = new Set<string>();
  const pasangKlikAir = (id: string, jenis: string) => {
    if (klikAirTerpasang.has(id)) return;
    klikAirTerpasang.add(id);
    map.on("click", id, klikAir(jenis));
    map.on("mouseenter", id, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", id, () => {
      map.getCanvas().style.cursor = "";
    });
  };
  let genJalan = 0;
  let genLokal = 0;
  let genSungaiRtrw = 0;
  let genDanauRtrw = 0;
  let jalanRtrwNyala = false;
  const pasangJalanLokal = async () => {
    if (!jalanRtrwNyala || map.getZoom() < 11 || map.getSource("jalan-lokal")) return;
    const gen = ++genLokal;
    try {
      const data = await ambilVektor("data/sipintar/jalan_lokal.geojson");
      if (gen !== genLokal || !jalanRtrwNyala || map.getZoom() < 11 || map.getSource("jalan-lokal")) return;
      map.addSource("jalan-lokal", { type: "geojson", data, attribution: ATRIBUSI_SIPINTAR });
      map.addLayer(
        {
          id: "jalan-lokal-garis",
          type: "line",
          source: "jalan-lokal",
          minzoom: 11,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["match", ["get", "kelas"], "Jalan Lokal", "#9b5aff", "Jalan Lain", "#9e9e9e", "#9e9e9e"],
            "line-width": 0.6,
            "line-opacity": 0.9,
          },
        },
        sebelumSipintar("jalan-lokal-garis"),
      );
    } catch {
      if (gen === genLokal && jalanRtrwNyala) onRaster("jalan-rtrw", "error");
    }
  };
  map.on("zoomend", () => {
    if (jalanRtrwNyala && map.getZoom() >= 11) void pasangJalanLokal();
  });
  const pasangJalanRtrw = async (nyala: boolean) => {
    if (!nyala) {
      genJalan += 1;
      genLokal += 1;
      jalanRtrwNyala = false;
      lepasLapisan(["jalan-utama-garis", "jalan-ka-garis"], "jalan-utama");
      lepasLapisan(["jalan-lokal-garis"], "jalan-lokal");
      onRaster("jalan-rtrw", "off");
      return;
    }
    const gen = ++genJalan;
    jalanRtrwNyala = true;
    onRaster("jalan-rtrw", "loading");
    try {
      const data = await ambilVektor("data/sipintar/jalan_utama.geojson");
      if (gen !== genJalan || !jalanRtrwNyala) return;
      lepasLapisan(["jalan-utama-garis", "jalan-ka-garis"], "jalan-utama");
      map.addSource("jalan-utama", { type: "geojson", data, attribution: ATRIBUSI_SIPINTAR });
      map.addLayer(
        {
          id: "jalan-utama-garis",
          type: "line",
          source: "jalan-utama",
          filter: ["!=", ["get", "kelas"], "Jalan Kereta Api Jalur Tunggal"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "kelas"],
              "Jalan Arteri",
              "#ff5100",
              "Jalan Tol",
              "#ff5100",
              "Jalan Kolektor",
              "#ff8c00",
              "Landas Pacu Internasional",
              "#616161",
              "#ff8c00",
            ],
            "line-width": [
              "match",
              ["get", "kelas"],
              "Jalan Arteri",
              2,
              "Jalan Tol",
              2.2,
              "Jalan Kolektor",
              1.4,
              "Landas Pacu Internasional",
              1.6,
              1.4,
            ],
          },
        },
        sebelumSipintar("jalan-utama-garis"),
      );
      map.addLayer(
        {
          id: "jalan-ka-garis",
          type: "line",
          source: "jalan-utama",
          filter: ["==", ["get", "kelas"], "Jalan Kereta Api Jalur Tunggal"],
          paint: { "line-color": "#111111", "line-width": 1.3, "line-dasharray": [2, 2] },
        },
        sebelumSipintar("jalan-ka-garis"),
      );
      onRaster("jalan-rtrw", "ready");
      void pasangJalanLokal();
    } catch {
      if (gen === genJalan) onRaster("jalan-rtrw", "error");
    }
  };
  const pasangSungaiRtrw = async (nyala: boolean) => {
    if (!nyala) {
      genSungaiRtrw += 1;
      lepasLapisan(["sungai-rtrw-isi", "sungai-rtrw-garis", "sungai-rtrw-label"], "sungai-rtrw");
      onRaster("sungai-rtrw", "off");
      return;
    }
    const gen = ++genSungaiRtrw;
    onRaster("sungai-rtrw", "loading");
    try {
      const data = await ambilVektor("data/sipintar/sungai_induk.geojson");
      if (gen !== genSungaiRtrw) return;
      lepasLapisan(["sungai-rtrw-isi", "sungai-rtrw-garis", "sungai-rtrw-label"], "sungai-rtrw");
      map.addSource("sungai-rtrw", { type: "geojson", data, attribution: ATRIBUSI_SIPINTAR });
      map.addLayer(
        {
          id: "sungai-rtrw-isi",
          type: "fill",
          source: "sungai-rtrw",
          paint: { "fill-color": "#4fa3e0", "fill-opacity": 0.6 },
        },
        sebelumSipintar("sungai-rtrw-isi"),
      );
      map.addLayer(
        {
          id: "sungai-rtrw-garis",
          type: "line",
          source: "sungai-rtrw",
          paint: { "line-color": "#1f6fb2", "line-width": 0.5 },
        },
        sebelumSipintar("sungai-rtrw-garis"),
      );
      map.addLayer(
        {
          id: "sungai-rtrw-label",
          type: "symbol",
          source: "sungai-rtrw",
          minzoom: 9,
          filter: ["!=", ["coalesce", ["get", "nama"], ""], ""],
          layout: {
            "text-field": ["get", "nama"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-max-width": 8,
          },
          paint: { "text-color": "#0d47a1", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
        },
        sebelumSipintar("sungai-rtrw-label"),
      );
      pasangKlikAir("sungai-rtrw-isi", "Sungai induk");
      onRaster("sungai-rtrw", "ready");
    } catch {
      if (gen === genSungaiRtrw) onRaster("sungai-rtrw", "error");
    }
  };
  const pasangDanauRtrw = async (nyala: boolean) => {
    if (!nyala) {
      genDanauRtrw += 1;
      lepasLapisan(["danau-rtrw-isi", "danau-rtrw-garis", "danau-rtrw-label"], "danau-rtrw");
      onRaster("danau-rtrw", "off");
      return;
    }
    const gen = ++genDanauRtrw;
    onRaster("danau-rtrw", "loading");
    try {
      const data = await ambilVektor("data/sipintar/danau.geojson");
      if (gen !== genDanauRtrw) return;
      lepasLapisan(["danau-rtrw-isi", "danau-rtrw-garis", "danau-rtrw-label"], "danau-rtrw");
      map.addSource("danau-rtrw", { type: "geojson", data, attribution: ATRIBUSI_SIPINTAR });
      map.addLayer(
        {
          id: "danau-rtrw-isi",
          type: "fill",
          source: "danau-rtrw",
          paint: { "fill-color": "#97dbf2", "fill-opacity": 0.7 },
        },
        sebelumSipintar("danau-rtrw-isi"),
      );
      map.addLayer(
        {
          id: "danau-rtrw-garis",
          type: "line",
          source: "danau-rtrw",
          paint: { "line-color": "#2a9bb8", "line-width": 1 },
        },
        sebelumSipintar("danau-rtrw-garis"),
      );
      map.addLayer(
        {
          id: "danau-rtrw-label",
          type: "symbol",
          source: "danau-rtrw",
          minzoom: 9,
          filter: ["!=", ["coalesce", ["get", "nama"], ""], ""],
          layout: {
            "text-field": ["get", "nama"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
          },
          paint: { "text-color": "#01579b", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
        },
        sebelumSipintar("danau-rtrw-label"),
      );
      pasangKlikAir("danau-rtrw-isi", "Danau");
      onRaster("danau-rtrw", "ready");
    } catch {
      if (gen === genDanauRtrw) onRaster("danau-rtrw", "error");
    }
  };
  if (new URLSearchParams(window.location.search).has("uji")) {
    const uji = window as unknown as {
      __studiPeta?: maplibregl.Map;
      __aturAksiTanda?: (aksi: { admin: boolean; pulihkan: (id: string, sumber: "asli" | "usulan") => void } | null) => void;
    };
    uji.__studiPeta = map;
    uji.__aturAksiTanda = (aksi) => {
      aksiTanda = aksi;
    };
  }

  let genPos = 0;
  let popupPos: maplibregl.Popup | null = null;
  let klikPos = false;
  const ikonPos = (bentuk: "lingkaran" | "wajik" | "segitiga", warna: string) => {
    const ukuran = 40;
    const kanvas = document.createElement("canvas");
    kanvas.width = ukuran;
    kanvas.height = ukuran;
    const g = kanvas.getContext("2d");
    if (!g) throw new Error("kanvas pos");
    g.translate(ukuran / 2, ukuran / 2);
    g.fillStyle = warna;
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.beginPath();
    if (bentuk === "lingkaran") g.arc(0, 0, 11, 0, Math.PI * 2);
    else if (bentuk === "wajik") {
      g.moveTo(0, -13);
      g.lineTo(13, 0);
      g.lineTo(0, 13);
      g.lineTo(-13, 0);
      g.closePath();
    } else {
      g.moveTo(0, -13);
      g.lineTo(13, 11);
      g.lineTo(-13, 11);
      g.closePath();
    }
    g.fill();
    g.stroke();
    return g.getImageData(0, 0, ukuran, ukuran);
  };
  const pasangPosHidro = async (nyala: boolean) => {
    if (!nyala) {
      genPos += 1;
      if (map.getLayer("pos-hidro")) map.removeLayer("pos-hidro");
      if (map.getSource("pos-hidro")) map.removeSource("pos-hidro");
      onRaster("pos-hidro", "off");
      return;
    }
    const gen = ++genPos;
    onRaster("pos-hidro", "loading");
    try {
      const data = await ambilVektor("data/pos_hidrologi_bbws2.geojson");
      if (gen !== genPos) return;
      if (!map.hasImage("pos-pkl")) map.addImage("pos-pkl", ikonPos("wajik", "#E65100"), { pixelRatio: 2 });
      if (!map.hasImage("pos-pch")) map.addImage("pos-pch", ikonPos("lingkaran", "#1565C0"), { pixelRatio: 2 });
      if (!map.hasImage("pos-pda")) map.addImage("pos-pda", ikonPos("segitiga", "#00897B"), { pixelRatio: 2 });
      if (map.getLayer("pos-hidro")) map.removeLayer("pos-hidro");
      if (map.getSource("pos-hidro")) map.removeSource("pos-hidro");
      map.addSource("pos-hidro", {
        type: "geojson",
        data,
        attribution: "Pos hidrologi © BBWS Sumatera II (Google My Maps)",
      });
      map.addLayer(
        {
          id: "pos-hidro",
          type: "symbol",
          source: "pos-hidro",
          layout: {
            "icon-image": ["match", ["get", "jenis"], "Klimatologi", "pos-pkl", "Curah Hujan", "pos-pch", "Duga Air", "pos-pda", "pos-pda"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        },
        "titik-clusters",
      );
      if (!klikPos) {
        klikPos = true;
        map.on("click", "pos-hidro", (event) => {
          const props = (event.features?.[0]?.properties ?? {}) as Record<string, unknown>;
          const nama = String(props.nama ?? "Pos hidrologi");
          const jenis = String(props.jenis ?? "—");
          const kode = String(props.kode ?? "").trim();
          const sumber = String(props.sumber || "BBWS Sumatera II (Google My Maps)");
          popupPos?.remove();
          popupPos = new maplibregl.Popup({ maxWidth: "280px", className: "ews-popup" })
            .setLngLat(event.lngLat)
            .setHTML(
              `<h3>${escapeHtml(nama)}</h3><p class="popup-catatan">Pos statis. Tidak ada nilai waktu nyata.</p><table><tr><th>Jenis</th><td>${escapeHtml(kode ? `${jenis} (${kode})` : jenis)}</td></tr><tr><th>Sumber</th><td>${escapeHtml(sumber)}</td></tr></table>`,
            )
            .addTo(map);
        });
        map.on("mouseenter", "pos-hidro", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pos-hidro", () => {
          map.getCanvas().style.cursor = "";
        });
      }
      onRaster("pos-hidro", "ready");
    } catch {
      if (gen === genPos) onRaster("pos-hidro", "error");
    }
  };

  function pasangRaster(
  kind: RasterKind,
  sourceId: string,
  tiles: string[],
  extra: { attribution?: string; minzoom?: number; maxzoom?: number; bounds?: [number, number, number, number] },
) {
    lepas[kind]?.();
    if (map.getLayer(sourceId)) map.removeLayer(sourceId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    map.addSource(sourceId, { type: "raster", tiles, tileSize: 256, ...extra });
    map.addLayer(
      { id: sourceId, type: "raster", source: sourceId, paint: { "raster-opacity": 0.75 } },
      "sumut-garis",
    );
    lepas[kind] = awasi(map, sourceId, (state) => onRaster(kind, state));
  }

  try {
    const respons = await fetch(asset("data/sirine_buffer_1km.geojson"));
    if (respons.ok) {
      const data = (await respons.json()) as GeoJSON.FeatureCollection;
      bufferSemua = data.features ?? [];
      tulisRadius();
    }
  } catch {
    // Radius tetap kosong jika berkas belum tersedia.
  }

  return {
    setTitik(sirine, sensor) {
      simpanSirine = sirine;
      simpanSensor = sensor;
      tulisTitik();
    },
    setVisible(lapisan, nyala) {
      if (lapisan === "sirine") lihatSirine = nyala;
      else lihatSensor = nyala;
      tulisTitik();
    },
    setRadius(nyala, idSirine) {
      lihatRadius = nyala;
      idRadius = new Set(idSirine);
      tulisRadius();
    },
    setBahaya(nyala, opasitas, klasifikasi) {
      if (!nyala) {
        matikan(map, lepas, "bahaya", "bahaya", onRaster);
        bahayaUrl = "";
        return;
      }
      const aturan = klasifikasi ? RENDERING_RULE_KELAS : RENDERING_RULE_RAMP;
      const url = `${BAHAYA_URL}&renderingRule=${encodeURIComponent(aturan)}`;
      if (bahayaUrl !== url) {
        pasangRaster("bahaya", "bahaya", [url], {
          attribution: "Indeks Bahaya Banjir © BNPB – InaRISK",
        });
        bahayaUrl = url;
      }
      map.setPaintProperty("bahaya", "raster-opacity", opasitas);
    },
    setProxy(nyala, opasitas) {
      if (!nyala) {
        matikan(map, lepas, "proxy", "proxy", onRaster);
        return;
      }
      if (!map.getSource("proxy")) {
        pasangRaster("proxy", "proxy", [asset("data/risk_proxy_tiles/{z}/{x}/{y}.png")], {
          minzoom: 5,
          maxzoom: 12,
          bounds: [97, -0.8, 100.5, 4.5],
          attribution: "Proksi risiko banjir (√bahaya×kerentanan), olahan dari BNPB InaRISK",
        });
      }
      map.setPaintProperty("proxy", "raster-opacity", opasitas);
    },
    async setBatas(jenis, nyala) {
      await pasangBatas(map, onRaster, jenis, nyala);
    },
    setJalanRtrw: pasangJalanRtrw,
    setSungaiRtrw: pasangSungaiRtrw,
    setDanauRtrw: pasangDanauRtrw,
    setPosHidro: pasangPosHidro,
    aturAksiUsulan(admin, sunting, hapus) {
      adminUsulan = admin;
      onSuntingUsulan = sunting;
      onHapusUsulan = hapus;
    },
    setSurvei(fitur, tampil) {
      (map.getSource("survei") as GeoJSONSource).setData({ type: "FeatureCollection", features: fitur });
      if (map.getLayer("survei-titik")) map.setLayoutProperty("survei-titik", "visibility", tampil ? "visible" : "none");
    },
    aturIndeksSurvei(id) {
      for (const kunci of Object.keys(indeksSurvei)) delete indeksSurvei[kunci];
      for (const item of id) indeksSurvei[normIdSurvei(item)] = true;
    },
    setUsulan(fitur, tampil) {
      (map.getSource("usulan") as GeoJSONSource).setData({ type: "FeatureCollection", features: fitur });
      const tampak = tampil ? "visible" : "none";
      for (const id of ["usulan-titik", "usulan-label", "usulan-silang"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", tampak);
      }
    },
    aturModeTambah(nyala, onKlik) {
      modeTambah = nyala;
      onKlikKosong = onKlik;
      if (nyala) {
        modeHapus = false;
        onTandai = null;
      }
      map.getCanvas().style.cursor = nyala ? "crosshair" : "";
    },
    aturModeHapus(nyala, penanda) {
      modeHapus = nyala;
      onTandai = penanda;
      if (nyala) {
        modeTambah = false;
        onKlikKosong = null;
      }
      map.getCanvas().style.cursor = nyala ? "crosshair" : "";
    },
    aturAksiTanda(aksi) {
      aksiTanda = aksi;
    },
    aturDasar(mode) {
      terapkanDasar(mode);
    },
    taruhPenanda(lon, lat) {
      penanda?.remove();
      penanda = new maplibregl.Marker({ color: "#7B1FA2" }).setLngLat([lon, lat]).addTo(map);
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 13), essential: true });
    },
    hapusPenanda() {
      penanda?.remove();
      penanda = null;
    },
    fokusTitik(titik) {
      const coordinates = titik.geometry.coordinates;
      if (titik.properties.status_sumber === "appwrite") {
        bukaPopupUsulanDari(map, coordinates, titik.properties as unknown as Record<string, unknown>, {
          admin: adminUsulan,
          sunting: onSuntingUsulan,
          hapus: onHapusUsulan,
        });
        map.flyTo({
          center: coordinates,
          zoom: Math.min(Math.max(map.getZoom(), 13), map.getMaxZoom()),
          essential: true,
        });
        return;
      }
      map.flyTo({
        center: coordinates,
        zoom: Math.min(Math.max(map.getZoom(), 13), map.getMaxZoom()),
        essential: true,
      });
      popupKlaster?.remove();
      popupTitik?.remove();
      popupTitik = new maplibregl.Popup({ maxWidth: "320px", className: "ews-popup" })
        .setLngLat(coordinates)
        .setHTML(popupHtml(titik.properties as unknown as Record<string, unknown>, coordinates))
        .addTo(map);
    },
    fitTitik(titik) {
      if (!titik.length) {
        fitProvinsi();
        return;
      }
      let westFit = Infinity;
      let southFit = Infinity;
      let eastFit = -Infinity;
      let northFit = -Infinity;
      for (const feature of titik) {
        const [lon, lat] = feature.geometry.coordinates;
        westFit = Math.min(westFit, lon);
        southFit = Math.min(southFit, lat);
        eastFit = Math.max(eastFit, lon);
        northFit = Math.max(northFit, lat);
      }
      map.fitBounds(
        [
          [westFit, southFit],
          [eastFit, northFit],
        ],
        { padding: 72, maxZoom: 12, duration: 650 },
      );
    },
    fitProvinsi,
    resize() {
      map.resize();
    },
  };
}

function tombolSeluruhSumut(saatKlik: () => void): maplibregl.IControl {
  let wadah: HTMLDivElement | undefined;
  return {
    onAdd() {
      const tombol = document.createElement("button");
      tombol.type = "button";
      tombol.className = "maplibregl-ctrl-sumut";
      tombol.title = "Lihat seluruh Sumut";
      tombol.setAttribute("aria-label", "Lihat seluruh Sumut");
      tombol.innerHTML =
        '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 8V3h5v2H5v3H3zm9-5h5v5h-2V5h-3V3zM3 12h2v3h3v2H3v-5zm12 3v-3h2v5h-5v-2h3z"/></svg>';
      tombol.addEventListener("click", saatKlik);
      wadah = document.createElement("div");
      wadah.className = "maplibregl-ctrl maplibregl-ctrl-group";
      wadah.append(tombol);
      return wadah;
    },
    onRemove() {
      wadah?.remove();
      wadah = undefined;
    },
  };
}

function tambahKlaster(map: Map) {
  map.addLayer({
    id: "titik-clusters",
    type: "circle",
    source: "titik",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "usulan_studi"], ["get", "point_count"]],
        "#7B1FA2",
        ["==", ["get", "usulan_bpbd"], ["get", "point_count"]],
        "#EF6C00",
        ["==", ["get", "hasil_survei"], ["get", "point_count"]],
        "#2E7D32",
        "#1c1c1f",
      ],
      "circle-radius": ["step", ["get", "point_count"], 16, 8, 20, 24, 26],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: "titik-count",
    type: "symbol",
    source: "titik",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
    },
    paint: { "text-color": "#ffffff" },
  });
}

function rincianKlaster(properties: GeoJSON.GeoJsonProperties): string {
  const nilai = (kunci: string) => Number(properties?.[kunci] ?? 0);
  const status: Array<[string, number]> = [];
  const masuk = (nama: string, jumlah: number) => {
    if (jumlah > 0) status.push([nama, jumlah]);
  };
  masuk("Usulan studi", nilai("usulan_studi"));
  masuk("Usulan BPBD", nilai("usulan_bpbd"));
  masuk("Hasil survei", nilai("hasil_survei"));
  masuk("Belum ditentukan", nilai("belum_ditentukan"));
  const barisStatus = status.map(([nama, jumlah]) => `<li>${escapeHtml(nama)}: ${escapeHtml(jumlah)}</li>`).join("");
  return `<strong>${escapeHtml(nilai("point_count"))} titik</strong><ul class="rincian-klaster"><li>Sirine: ${escapeHtml(nilai("sirine"))}</li><li>Sensor: ${escapeHtml(nilai("sensor"))}</li>${barisStatus}</ul>`;
}

let popupKlaster: maplibregl.Popup | null = null;

function tampilRincianKlaster(map: Map, event: maplibregl.MapLayerMouseEvent) {
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== "Point") return;
  popupKlaster?.remove();
  popupKlaster = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "220px", className: "ews-popup", offset: 12 })
    .setLngLat(feature.geometry.coordinates as [number, number])
    .setHTML(rincianKlaster(feature.properties))
    .addTo(map);
}

function bukaPopupUsulanDari(
  map: Map,
  coordinates: [number, number],
  properties: Record<string, unknown>,
  aksi: { admin: boolean; sunting: ((id: string) => void) | null; hapus: ((id: string) => void) | null },
) {
  popupKlaster?.remove();
  const id = String(properties.id ?? "");
  const tombol = aksi.admin ? `<p class="popup-aksi"><button type="button" data-sunting>Ubah</button></p>` : "";
  const nama = judulTitik(properties);
  const baris: Array<[string, string]> = [
    ["ID", id],
    ["Nama", nama],
    ["Jenis", String(properties.jenis ?? "—")],
    ["Status", STATUS_LABEL[String(properties.status) as keyof typeof STATUS_LABEL] ?? String(properties.status ?? "—")],
    ["Kabupaten/kota", String(properties.wadmkk ?? "—")],
    ["Kecamatan", String(properties.wadmkc ?? "—")],
    ["Desa", String(properties.wadmkd ?? "—")],
    ["DAS", String(properties.das_nama ?? "—")],
    ["Catatan", String(properties.keterangan ?? "—")],
    ["Sumber geocode", String(properties.sumber_geocode ?? "—")],
    ["Bujur", formatDerajat(coordinates[0])],
    ["Lintang", formatDerajat(coordinates[1])],
  ];
  const isi = baris.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  const popup = new maplibregl.Popup({ maxWidth: "320px", className: "ews-popup" })
    .setLngLat(coordinates)
    .setHTML(`<h3>${escapeHtml(nama)}</h3><p class="popup-catatan">Titik usulan dari Appwrite. Bukan bagian dari 294 titik studi.</p>${blokDihapus(properties, aksi.admin)}<table>${isi}</table>${tombol}`)
    .addTo(map);
  popup.getElement()?.querySelector("[data-sunting]")?.addEventListener("click", () => aksi.sunting?.(id));
  pasangPulihkan(popup, id, "usulan");
}

function bukaPopup(map: Map, event: maplibregl.MapLayerMouseEvent) {
  popupKlaster?.remove();
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== "Point") return;
  const coordinates = feature.geometry.coordinates as [number, number];
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const popup = new maplibregl.Popup({ maxWidth: "320px", className: "ews-popup" })
    .setLngLat(coordinates)
    .setHTML(popupHtml(properties, coordinates))
    .addTo(map);
  pasangPulihkan(popup, String(properties.id ?? ""), "asli");
}

function bukaKlaster(map: Map, event: maplibregl.MapLayerMouseEvent) {
  popupKlaster?.remove();
  const feature = event.features?.[0];
  const clusterId = feature?.properties?.cluster_id;
  if (!feature || feature.geometry.type !== "Point" || typeof clusterId !== "number") return;
  const source = map.getSource("titik") as GeoJSONSource;
  void source.getClusterExpansionZoom(clusterId).then((zoom) => {
    map.easeTo({
      center: feature.geometry.type === "Point" ? (feature.geometry.coordinates as [number, number]) : event.lngLat,
      zoom,
    });
  });
}

function awasi(map: Map, sourceId: string, laporkan: (state: RasterState) => void): Stop {
  let gagal = 0;
  let muat = 0;
  const kirim = () => {
    if (gagal && muat) laporkan("partial");
    else if (gagal) laporkan("error");
    else if (muat) laporkan("ready");
    else laporkan("loading");
  };
  const onError = (event: { sourceId?: string }) => {
    if (event.sourceId !== sourceId) return;
    gagal += 1;
    kirim();
  };
  const onData = (event: { sourceId?: string; dataType?: string; isSourceLoaded?: boolean }) => {
    if (event.sourceId !== sourceId || event.dataType !== "source" || !event.isSourceLoaded) return;
    muat += 1;
    kirim();
  };
  map.on("error", onError);
  map.on("sourcedata", onData);
  laporkan("loading");
  return () => {
    map.off("error", onError);
    map.off("sourcedata", onData);
  };
}

const vektorCache: Record<string, GeoJSON.FeatureCollection | undefined> = {};

function matikan(
  map: Map,
  lepas: Partial<Record<RasterKind, Stop>>,
  kind: RasterKind,
  sourceId: string,
  onRaster: (kind: RasterKind, state: RasterState) => void,
) {
  lepas[kind]?.();
  delete lepas[kind];
  if (map.getLayer(sourceId)) map.removeLayer(sourceId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
  onRaster(kind, "off");
}

const batasGen: Partial<Record<BatasJenis, number>> = {};
const batasLayer: Record<BatasJenis, string[]> = {
  das: ["batas-das-garis", "batas-das-label"],
  kab: ["batas-toba", "batas-toba-label", "batas-kab-casing", "batas-kab-garis", "batas-kab-label"],
  kec: ["batas-kec-casing", "batas-kec-garis"],
  desa: ["batas-desa-casing", "batas-desa-garis"],
};
const batasSource: Record<BatasJenis, string[]> = {
  das: ["batas-das"],
  kab: ["batas-kab", "batas-toba"],
  kec: ["batas-kec"],
  desa: ["batas-desa"],
};

function sebelumGarisBatas(map: Map, urutan: string[]): string {
  for (const id of urutan) {
    if (map.getLayer(id)) return id;
  }
  return "titik-clusters";
}

function hapusBatas(map: Map, jenis: BatasJenis) {
  for (const id of batasLayer[jenis]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of batasSource[jenis]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

async function pasangBatas(
  map: Map,
  onRaster: (kind: RasterKind, state: RasterState) => void,
  jenis: BatasJenis,
  nyala: boolean,
): Promise<void> {
  const kind = `batas-${jenis}` as RasterKind;
  const gen = (batasGen[jenis] ?? 0) + 1;
  batasGen[jenis] = gen;
  if (!nyala) {
    hapusBatas(map, jenis);
    onRaster(kind, "off");
    return;
  }
  onRaster(kind, "loading");
  const path = {
    das: "data/wilayah/das_sumut.geojson",
    kab: "data/wilayah/adm2_kab.geojson",
    kec: "data/wilayah/adm3_kec.geojson",
    desa: "data/wilayah/adm4_desa.geojson",
  }[jenis];
  try {
    let data = vektorCache[path];
    if (!data) {
      const response = await fetch(asset(path));
      if (!response.ok) throw new Error(path);
      data = (await response.json()) as GeoJSON.FeatureCollection;
      vektorCache[path] = data;
    }
    if (batasGen[jenis] !== gen) return;
    hapusBatas(map, jenis);
    if (jenis === "das") {
      map.addSource("batas-das", {
        type: "geojson",
        data,
        attribution: "Batas DAS: cermin ArcGIS Online pklpengeo 2023 (skema KLHK), lisensi tidak dinyatakan",
      });
      map.addLayer(
        {
          id: "batas-das-garis",
          type: "line",
          source: "batas-das",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#00B0FF",
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.8, 12, 4],
          },
        },
        "titik-clusters",
      );
      map.addLayer(
        {
          id: "batas-das-label",
          type: "symbol",
          source: "batas-das",
          layout: {
            "text-field": ["get", "nama_das"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-max-width": 10,
          },
          paint: { "text-color": "#0277BD", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
        },
        "titik-clusters",
      );
    } else if (jenis === "kab") {
      const semua = data.features ?? [];
      const toba = semua.filter((fitur) => String(fitur.properties?.adm2_name ?? "") === "Danau Toba");
      const kab = semua.filter((fitur) => String(fitur.properties?.adm2_name ?? "") !== "Danau Toba");
      map.addSource("batas-kab", {
        type: "geojson",
        data: { type: "FeatureCollection", features: kab },
        attribution: "Batas wilayah © HDX COD-AB Indonesia v01 (2020), CC BY-IGO",
      });
      map.addSource("batas-toba", {
        type: "geojson",
        data: { type: "FeatureCollection", features: toba },
      });
      map.addLayer(
        {
          id: "batas-toba",
          type: "fill",
          source: "batas-toba",
          paint: { "fill-color": "#7eb6d6", "fill-opacity": 0.55 },
        },
        "titik-clusters",
      );
      map.addLayer(
        {
          id: "batas-toba-label",
          type: "symbol",
          source: "batas-toba",
          layout: {
            "text-field": ["get", "adm2_name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
          },
          paint: { "text-color": "#1c1c1f", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
        },
        "titik-clusters",
      );
      map.addLayer(
        {
          id: "batas-kab-casing",
          type: "line",
          source: "batas-kab",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.8, 11, 4.8],
            "line-opacity": 0.9,
          },
        },
        sebelumGarisBatas(map, ["titik-clusters"]),
      );
      map.addLayer(
        {
          id: "batas-kab-garis",
          type: "line",
          source: "batas-kab",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#111111",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.2, 11, 3],
          },
        },
        sebelumGarisBatas(map, ["titik-clusters"]),
      );
      map.addLayer(
        {
          id: "batas-kab-label",
          type: "symbol",
          source: "batas-kab",
          layout: {
            "text-field": ["get", "adm2_name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 13,
            "text-max-width": 10,
            "text-padding": 4,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#1c1c1f",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.6,
          },
        },
        "titik-clusters",
      );
    } else if (jenis === "kec") {
      map.addSource("batas-kec", {
        type: "geojson",
        data,
        attribution: "Batas wilayah © HDX COD-AB Indonesia v01 (2020), CC BY-IGO",
      });
      const satelit = map.getLayoutProperty("citra", "visibility") === "visible";
      map.addLayer(
        {
          id: "batas-kec-garis",
          type: "line",
          source: "batas-kec",
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-color": "#37474F",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 13, 2.5],
            "line-opacity": 0.9,
            "line-dasharray": [4, 3],
          },
        },
        sebelumGarisBatas(map, ["batas-kab-casing", "batas-kab-garis", "titik-clusters"]),
      );
      map.addLayer(
        {
          id: "batas-kec-casing",
          type: "line",
          source: "batas-kec",
          layout: { "line-join": "round", "line-cap": "butt", visibility: satelit ? "visible" : "none" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 4.2],
            "line-opacity": 0.9,
            "line-dasharray": [2.2, 1.65],
          },
        },
        "batas-kec-garis",
      );
    } else {
      map.addSource("batas-desa", {
        type: "geojson",
        data,
        attribution: "Batas wilayah © HDX COD-AB Indonesia v01 (2020), CC BY-IGO",
      });
      const satelit = map.getLayoutProperty("citra", "visibility") === "visible";
      map.addLayer(
        {
          id: "batas-desa-garis",
          type: "line",
          source: "batas-desa",
          minzoom: 10,
          layout: { "line-join": "round", "line-cap": "butt" },
          paint: {
            "line-color": "#757575",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.8],
            "line-opacity": 0.9,
            "line-dasharray": [3, 2],
          },
        },
        sebelumGarisBatas(map, ["batas-kec-casing", "batas-kec-garis", "batas-kab-casing", "batas-kab-garis", "titik-clusters"]),
      );
      map.addLayer(
        {
          id: "batas-desa-casing",
          type: "line",
          source: "batas-desa",
          minzoom: 10,
          layout: { "line-join": "round", "line-cap": "butt", visibility: satelit ? "visible" : "none" },
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.4, 13, 3.4],
            "line-opacity": 0.95,
            "line-dasharray": [1.4, 0.95],
          },
        },
        "batas-desa-garis",
      );
    }
    onRaster(kind, "ready");
  } catch {
    if (batasGen[jenis] !== gen) return;
    hapusBatas(map, jenis);
    onRaster(kind, "error");
  }
}

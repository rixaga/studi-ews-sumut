import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { BatasProvinsi, Titik } from "./model";
import { asset, escapeHtml, formatDerajat, labelStatusSumber, STATUS_LABEL } from "./model";

export type RasterKind = "bahaya" | "proxy" | "sungai" | "das" | "batas-das" | "batas-kab" | "batas-kec" | "batas-desa";
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
  setBahaya(nyala: boolean, opasitas: number, klasifikasi: boolean): void;
  setProxy(nyala: boolean, opasitas: number): void;
  setSungai(nyala: boolean): Promise<void>;
  setDas(nyala: boolean): Promise<void>;
  setBatas(jenis: BatasJenis, nyala: boolean): Promise<void>;
  setUsulan(fitur: GeoJSON.Feature[], tampil: boolean): void;
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

function signedArea(ring: Ring): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function closeRing(ring: Ring): Ring {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function orient(ring: Ring, ccw: boolean): Ring {
  const closed = closeRing(ring);
  const positive = signedArea(closed) > 0;
  if (positive === ccw) return closed;
  return [...closed].reverse();
}

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
  return [
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
    ["Jenis", String(properties.jenis ?? "—")],
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
  return `<h3>${escapeHtml(judulTitik(properties))}</h3><p class="popup-catatan">Status bukan kolom Excel. Koordinat WGS84 dari teks DMS.</p>${cek}${blokDihapus(properties, aksiTanda?.admin === true)}<table>${isi}</table>`;
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
  const pad = 0.08;
  // Pulau-Pulau Batu mencapai sekitar 0,64° LS. Geser peta dibuka sampai −0,8°.
  const southBound = Math.min(south - pad, -0.8);
  const padded: [number, number, number, number] = [west - pad, southBound, east + pad, north + pad];
  const provinceBounds = new maplibregl.LngLatBounds([west, south], [east, north]);
  const shell = orient(
    [
      [padded[0], padded[1]],
      [padded[2], padded[1]],
      [padded[2], padded[3]],
      [padded[0], padded[3]],
    ],
    true,
  );
  const mask: GeoJSON.Feature = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [shell, ...rings.map((ring) => orient(ring, false))] },
  };

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
  };
  terapkanDasar(dasarAwal);

  for (const [name, file] of IKON) {
    const image = await map.loadImage(asset(`icons/${file}`));
    if (!map.hasImage(name)) map.addImage(name, image.data, { pixelRatio: 2 });
  }

  map.addSource("sumut", {
    type: "geojson",
    data: batas as GeoJSON.FeatureCollection,
    attribution: "Batas provinsi © geoBoundaries / OpenStreetMap contributors (ODbL)",
  });
  map.addSource("mask", { type: "geojson", data: { type: "FeatureCollection", features: [mask] } });
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
    id: "mask",
    type: "fill",
    source: "mask",
    paint: { "fill-color": "#1c1c1f", "fill-opacity": 0.38 },
  });
  map.addLayer({
    id: "sumut-garis",
    type: "line",
    source: "sumut",
    paint: { "line-color": "#1c1c1f", "line-width": 1.75 },
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
  map.on("click", "titik-clusters", (event) => bukaKlaster(map, event));
  map.on("mouseenter", "titik-clusters", (event) => tampilRincianKlaster(map, event));
  map.on("mouseleave", "titik-clusters", () => popupKlaster?.remove());

  const lepas: Partial<Record<RasterKind, Stop>> = {};
  let popupTitik: maplibregl.Popup | null = null;
  let simpanSirine: Titik[] = [];
  let simpanSensor: Titik[] = [];
  let lihatSirine = true;
  let lihatSensor = true;
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
    const kena = map.queryRenderedFeatures(event.point, {
      layers: ["titik-sirine", "titik-sensor", "titik-clusters", "titik-label", "usulan-titik", "usulan-label"],
    });
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
      "mask",
    );
    lepas[kind] = awasi(map, sourceId, (state) => onRaster(kind, state));
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
    async setSungai(nyala) {
      await pasangVektor(map, onRaster, "sungai", nyala, "data/hidro/rivers_sumut.geojson", {
        id: "sungai",
        type: "line",
        source: "sungai",
        filter: ["any", [">=", ["zoom"], 9], [">=", ["get", "ORD_STRA"], 3]],
        paint: {
          "line-color": "#0277bd",
          "line-width": ["interpolate", ["linear"], ["get", "ORD_STRA"], 1, 0.3, 6, 3],
          "line-opacity": 0.9,
        },
      }, "© WWF HydroSHEDS (Lehner & Grill 2013)");
    },
    async setBatas(jenis, nyala) {
      await pasangBatas(map, onRaster, jenis, nyala);
    },
    aturAksiUsulan(admin, sunting, hapus) {
      adminUsulan = admin;
      onSuntingUsulan = sunting;
      onHapusUsulan = hapus;
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
    async setDas(nyala) {
      await pasangVektor(map, onRaster, "das", nyala, "data/hidro/das_sumut_hydrobasins_l7.geojson", {
        id: "das",
        type: "line",
        source: "das",
        paint: {
          "line-color": "#4338ca",
          "line-width": 1.4,
          "line-dasharray": [2, 1.4],
        },
      }, "© WWF HydroSHEDS (Lehner & Grill 2013)");
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
    .setHTML(`<h3>${escapeHtml(nama)}</h3><p class="popup-catatan">Titik usulan dari Appwrite. Bukan bagian dari 274 titik studi.</p>${blokDihapus(properties, aksi.admin)}<table>${isi}</table>${tombol}`)
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
const vektorGen: Partial<Record<"sungai" | "das", number>> = {};

async function pasangVektor(
  map: Map,
  onRaster: (kind: RasterKind, state: RasterState) => void,
  kind: "sungai" | "das",
  nyala: boolean,
  path: string,
  layer: maplibregl.LineLayerSpecification,
  attribution: string,
): Promise<void> {
  const gen = (vektorGen[kind] ?? 0) + 1;
  vektorGen[kind] = gen;
  if (!nyala) {
    if (map.getLayer(kind)) map.removeLayer(kind);
    if (map.getSource(kind)) map.removeSource(kind);
    onRaster(kind, "off");
    return;
  }
  onRaster(kind, "loading");
  try {
    let data = vektorCache[path];
    if (!data) {
      const response = await fetch(asset(path));
      if (!response.ok) throw new Error(path);
      data = (await response.json()) as GeoJSON.FeatureCollection;
      vektorCache[path] = data;
    }
    if (vektorGen[kind] !== gen) return;
    if (!map.getSource(kind)) {
      map.addSource(kind, { type: "geojson", data, attribution });
    }
    if (!map.getLayer(kind)) map.addLayer(layer, "titik-clusters");
    onRaster(kind, "ready");
  } catch {
    if (vektorGen[kind] !== gen) return;
    onRaster(kind, "error");
  }
}

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
  kec: ["batas-kec-garis"],
  desa: ["batas-desa-garis"],
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
          paint: { "line-color": "#0f766e", "line-width": 1.6 },
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
          paint: { "text-color": "#0f766e", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
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
      map.addLayer(
        {
          id: "batas-kec-garis",
          type: "line",
          source: "batas-kec",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#5b2a86", "line-width": 1.4, "line-opacity": 0.9 },
        },
        sebelumGarisBatas(map, ["batas-kab-casing", "batas-kab-garis", "titik-clusters"]),
      );
    } else {
      map.addSource("batas-desa", {
        type: "geojson",
        data,
        attribution: "Batas wilayah © HDX COD-AB Indonesia v01 (2020), CC BY-IGO",
      });
      map.addLayer(
        {
          id: "batas-desa-garis",
          type: "line",
          source: "batas-desa",
          minzoom: 10,
          paint: {
            "line-color": "#9e9e9e",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 13, 0.9],
            "line-opacity": 0.7,
            "line-dasharray": [2, 2],
          },
        },
        sebelumGarisBatas(map, ["batas-kec-garis", "batas-kab-casing", "batas-kab-garis", "titik-clusters"]),
      );
    }
    onRaster(kind, "ready");
  } catch {
    if (batasGen[jenis] !== gen) return;
    hapusBatas(map, jenis);
    onRaster(kind, "error");
  }
}

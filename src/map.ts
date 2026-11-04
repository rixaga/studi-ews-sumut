import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { BatasProvinsi, Titik } from "./model";
import { asset, escapeHtml, formatDerajat, labelStatusSumber, STATUS_LABEL } from "./model";

export type RasterKind = "bahaya" | "proxy" | "sungai" | "das";
export type RasterState = "off" | "loading" | "ready" | "error" | "partial";

const BAHAYA_URL =
  "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image";

const RENDERING_RULE =
  '{"rasterFunction":"Colormap","rasterFunctionArguments":{"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":{"InputRanges":[0.01,0.333,0.333,0.666,0.666,1.01],"OutputValues":[1,2,3],"NoDataRanges":[-1,0.01]}},"Colormap":[[1,56,168,0],[2,255,255,0],[3,255,0,0]]}}';

const IKON: Array<[string, string]> = [
  ["sirene", "sirene.png"],
  ["sirene-usulan-studi", "sirene_usulan_studi.png"],
  ["sirene-usulan-bpbd", "sirene_usulan_bpbd.png"],
  ["sirene-hasil-survei", "sirene_hasil_survei.png"],
  ["sensor", "sensor_banjir.png"],
  ["sensor-usulan-studi", "sensor_banjir_usulan_studi.png"],
  ["sensor-usulan-bpbd", "sensor_banjir_usulan_bpbd.png"],
  ["sensor-hasil-survei", "sensor_banjir_hasil_survei.png"],
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
  const isi = baris
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  return `<h3>${escapeHtml(properties.id ?? "Titik")}</h3><p class="popup-catatan">Status bukan kolom Excel. Koordinat WGS84 dari teks DMS.</p><table>${isi}</table>`;
}

export async function createStudyMap(
  container: HTMLElement,
  batas: BatasProvinsi,
  onRaster: (kind: RasterKind, state: RasterState) => void,
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
    minZoom: 5,
    maxZoom: 18,
    maxBounds: padded,
    renderWorldCopies: false,
    attributionControl: { compact: true },
    fadeDuration: 0,
  });
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  await new Promise<void>((resolve) => {
    map.once("load", () => resolve());
  });

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
  map.addSource("sirine", {
    type: "geojson",
    data: koleksi([]),
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
  });
  map.addSource("sensor", {
    type: "geojson",
    data: koleksi([]),
    cluster: true,
    clusterRadius: 48,
    clusterMaxZoom: 14,
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
  tambahKlaster(map, "sirine", "#D32F2F");
  tambahKlaster(map, "sensor", "#1565C0");
  map.addLayer({
    id: "sirine-points",
    type: "symbol",
    source: "sirine",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ikonSirine(),
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "sensor-points",
    type: "symbol",
    source: "sensor",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ikonSensor(),
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });

  for (const layer of ["sirine-points", "sensor-points", "sirine-clusters", "sensor-clusters"] as const) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
  map.on("click", "sirine-points", (event) => bukaPopup(map, event));
  map.on("click", "sensor-points", (event) => bukaPopup(map, event));
  map.on("click", "sirine-clusters", (event) => bukaKlaster(map, "sirine", event));
  map.on("click", "sensor-clusters", (event) => bukaKlaster(map, "sensor", event));

  const lepas: Partial<Record<RasterKind, Stop>> = {};
  let popupTitik: maplibregl.Popup | null = null;
  let bahayaUrl = "";

  function fitProvinsi() {
    const camera = map.cameraForBounds(provinceBounds, { padding: 28 });
    if (!camera || typeof camera.zoom !== "number" || !camera.center) return;
    map.setMinZoom(camera.zoom);
    map.jumpTo({ center: camera.center, zoom: camera.zoom });
  }

  function jagaMinZoom() {
    const camera = map.cameraForBounds(provinceBounds, { padding: 28 });
    if (!camera || typeof camera.zoom !== "number") return;
    map.setMinZoom(camera.zoom);
  }

  map.on("resize", jagaMinZoom);
  fitProvinsi();

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
      (map.getSource("sirine") as GeoJSONSource).setData(koleksi(sirine));
      (map.getSource("sensor") as GeoJSONSource).setData(koleksi(sensor));
    },
    setVisible(lapisan, nyala) {
      const visibility = nyala ? "visible" : "none";
      for (const id of [`${lapisan}-points`, `${lapisan}-clusters`, `${lapisan}-count`]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    },
    setBahaya(nyala, opasitas, klasifikasi) {
      if (!nyala) {
        matikan(map, lepas, "bahaya", "bahaya", onRaster);
        bahayaUrl = "";
        return;
      }
      const url = klasifikasi ? `${BAHAYA_URL}&renderingRule=${encodeURIComponent(RENDERING_RULE)}` : BAHAYA_URL;
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
      map.flyTo({
        center: coordinates,
        zoom: Math.min(Math.max(map.getZoom(), 13), map.getMaxZoom()),
        essential: true,
      });
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

function tambahKlaster(map: Map, id: string, warna: string) {
  map.addLayer({
    id: `${id}-clusters`,
    type: "circle",
    source: id,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": warna,
      "circle-radius": ["step", ["get", "point_count"], 16, 8, 20, 24, 26],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: `${id}-count`,
    type: "symbol",
    source: id,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
    },
    paint: { "text-color": "#ffffff" },
  });
}

function bukaPopup(map: Map, event: maplibregl.MapLayerMouseEvent) {
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== "Point") return;
  const coordinates = feature.geometry.coordinates as [number, number];
  new maplibregl.Popup({ maxWidth: "320px", className: "ews-popup" })
    .setLngLat(coordinates)
    .setHTML(popupHtml((feature.properties ?? {}) as Record<string, unknown>, coordinates))
    .addTo(map);
}

function bukaKlaster(map: Map, sourceId: string, event: maplibregl.MapLayerMouseEvent) {
  const feature = event.features?.[0];
  const clusterId = feature?.properties?.cluster_id;
  if (!feature || feature.geometry.type !== "Point" || typeof clusterId !== "number") return;
  const source = map.getSource(sourceId) as GeoJSONSource;
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
    if (!map.getLayer(kind)) map.addLayer(layer, "sirine-clusters");
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

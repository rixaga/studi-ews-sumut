import { asset } from "./model";

type Cincin = number[][];
type Geometri = { type: string; coordinates: unknown };
type Fitur = { properties?: Record<string, unknown> | null; geometry?: Geometri | null };

let kabupaten: Fitur[] | null = null;
let kecamatan: Fitur[] | null = null;
let das: Fitur[] | null = null;
let desa: Fitur[] | null = null;

async function muat(path: string): Promise<Fitur[]> {
  const respons = await fetch(asset(path));
  if (!respons.ok) throw new Error(path);
  const data = (await respons.json()) as { features?: Fitur[] };
  return data.features ?? [];
}

function dalamCincin(lon: number, lat: number, cincin: Cincin): boolean {
  let dalam = false;
  for (let i = 0, j = cincin.length - 1; i < cincin.length; j = i, i += 1) {
    const [xi, yi] = cincin[i] ?? [0, 0];
    const [xj, yj] = cincin[j] ?? [0, 0];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

function dalamPoligon(lon: number, lat: number, cincin: Cincin[]): boolean {
  if (!cincin[0] || !dalamCincin(lon, lat, cincin[0])) return false;
  return !cincin.slice(1).some((lubang) => dalamCincin(lon, lat, lubang));
}

function berisi(lon: number, lat: number, geometri: Geometri | null | undefined): boolean {
  if (!geometri) return false;
  if (geometri.type === "Polygon") return dalamPoligon(lon, lat, geometri.coordinates as Cincin[]);
  if (geometri.type === "MultiPolygon") {
    return (geometri.coordinates as Cincin[][]).some((poligon) => dalamPoligon(lon, lat, poligon));
  }
  return false;
}

function cariNama(lon: number, lat: number, fitur: Fitur[], kunci: string, lewati?: string): string {
  for (const item of fitur) {
    const nama = String(item.properties?.[kunci] ?? "").trim();
    if (!nama || (lewati && nama === lewati)) continue;
    if (berisi(lon, lat, item.geometry)) return nama;
  }
  return "";
}

export type WilayahTitik = {
  kabupaten: string;
  kecamatan: string;
  desa: string;
  das: string;
};

export async function wilayahPada(lon: number, lat: number): Promise<WilayahTitik> {
  if (!kabupaten) kabupaten = await muat("data/wilayah/adm2_kab.geojson");
  if (!kecamatan) kecamatan = await muat("data/wilayah/adm3_kec.geojson");
  if (!das) das = await muat("data/wilayah/das_sumut.geojson");
  const hasil = {
    kabupaten: cariNama(lon, lat, kabupaten, "adm2_name", "Danau Toba"),
    kecamatan: cariNama(lon, lat, kecamatan, "adm3_name"),
    desa: "",
    das: cariNama(lon, lat, das, "nama_das"),
  };
  if (!desa) desa = await muat("data/wilayah/adm4_desa.geojson");
  hasil.desa = cariNama(lon, lat, desa, "adm4_name");
  return hasil;
}

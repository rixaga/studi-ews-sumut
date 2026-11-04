/** Pencarian tempat. Peramban tidak mengizinkan header User-Agent kustom, jadi identitas dikirim lewat Referer. */
const PENYEDIA = "Nominatim";
const BATAS_SUMUT = "97.0,4.5,100.5,-0.8";

export type HasilGeocode = {
  nama: string;
  lon: number;
  lat: number;
  penyedia: typeof PENYEDIA;
  sumber: string;
};

let antrian: Promise<void> = Promise.resolve();
let terakhir = 0;

function jeda(): Promise<void> {
  const kerja = antrian.then(async () => {
    const tunggu = Math.max(0, 1100 - (Date.now() - terakhir));
    if (tunggu) await new Promise((selesai) => setTimeout(selesai, tunggu));
    terakhir = Date.now();
  });
  antrian = kerja.catch(() => undefined);
  return kerja;
}

export async function cariTempat(kata: string, sinyal: AbortSignal): Promise<HasilGeocode[]> {
  const kueri = kata.trim();
  if (kueri.length < 2) return [];
  await jeda();
  if (sinyal.aborted) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", kueri);
  url.searchParams.set("countrycodes", "id");
  url.searchParams.set("viewbox", BATAS_SUMUT);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "1");
  const respons = await fetch(url, {
    signal: sinyal,
    referrerPolicy: "origin",
    headers: { Accept: "application/json", "Accept-Language": "id" },
  });
  if (!respons.ok) throw new Error(`Nominatim ${respons.status}`);
  const data = (await respons.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
  return data
    .map((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      const nama = (item.display_name ?? "").trim();
      if (!nama || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const sumber = `${PENYEDIA}: ${nama}`.slice(0, 255);
      return { nama, lat, lon, penyedia: PENYEDIA, sumber };
    })
    .filter((item): item is HasilGeocode => item !== null);
}

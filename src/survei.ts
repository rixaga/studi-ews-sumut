import { asset } from "./model";
import type { StudyMap } from "./map";
import { aturTandaSurvei } from "./tabel";

export type FiturSurvei = GeoJSON.Feature & {
  properties: {
    id?: string;
    titik_id?: string;
    kelayakan?: string;
  };
};

type BerkasSurvei = {
  type: "FeatureCollection";
  disinkronkan?: string | null;
  features: FiturSurvei[];
};

function normId(nilai: string): string {
  const token = nilai.trim().toUpperCase().replace(/\s+/g, "");
  const pendek = /^(SRN|SNS)-(\d+)$/.exec(token);
  if (pendek) return `${pendek[1]}-DS-${pendek[2].padStart(3, "0")}`;
  const panjang = /^(SRN|SNS)-DS-(\d+)$/.exec(token);
  if (panjang) return `${panjang[1]}-DS-${panjang[2].padStart(3, "0")}`;
  return token;
}

function formatSaat(iso: string): string {
  const tanggal = new Date(iso);
  if (Number.isNaN(tanggal.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(tanggal);
}

export function terapkanSurvei(peta: StudyMap, berkas: BerkasSurvei, tampil: boolean) {
  peta.setSurvei(berkas.features, tampil);
  const terkait = berkas.features.map((fitur) => String(fitur.properties?.titik_id ?? "")).filter(Boolean).map(normId);
  peta.aturIndeksSurvei(terkait);
  aturTandaSurvei(terkait);
  const simpul = document.querySelector("#kobo-terakhir");
  if (simpul) {
    simpul.textContent = berkas.disinkronkan
      ? `KoboToolbox (sinkron tiap 30 menit), terakhir: ${formatSaat(berkas.disinkronkan)}`
      : "KoboToolbox (sinkron tiap 30 menit), terakhir: belum ada";
  }
}

export async function muatSurvei(peta: StudyMap, tampil: boolean) {
  try {
    const respons = await fetch(asset("data/survei.geojson"));
    if (!respons.ok) throw new Error(String(respons.status));
    const berkas = (await respons.json()) as BerkasSurvei;
    terapkanSurvei(peta, berkas, tampil);
  } catch {
    terapkanSurvei(peta, { type: "FeatureCollection", disinkronkan: null, features: [] }, tampil);
  }
}

export function pasangFoto() {
  const dialog = document.querySelector<HTMLDialogElement>("#foto-dialog");
  const gambar = document.querySelector<HTMLImageElement>("#foto-besar");
  document.addEventListener("click", (event) => {
    const tombol = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-foto]");
    if (!tombol || !dialog || !gambar) return;
    gambar.src = tombol.dataset.foto ?? "";
    gambar.alt = "Foto survei";
    if (typeof dialog.showModal === "function") dialog.showModal();
  });
}

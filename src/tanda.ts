import { daftarTanda, hapusTanda, buatTanda, waktuSekarang, type BarisTanda, type SumberTanda } from "./appwrite";
import type { TitikProps } from "./model";

const indeks = new Map<string, BarisTanda>();
const pendengar: Array<() => void> = [];
let galatMuat = "";

function kunci(sumber: SumberTanda, titikId: string): string {
  return `${sumber}:${titikId}`;
}

function susun(baris: BarisTanda[]) {
  indeks.clear();
  for (const item of baris) indeks.set(kunci(item.sumber, item.titik_id), item);
}

function beritahu() {
  for (const panggil of pendengar) panggil();
}

export function saatTandaBerubah(panggil: () => void) {
  pendengar.push(panggil);
}

export function galatTanda(): string {
  return galatMuat;
}

export function cariTanda(sumber: SumberTanda, titikId: string): BarisTanda | undefined {
  return indeks.get(kunci(sumber, titikId));
}

export function tempelProperti(properties: TitikProps, sumber: SumberTanda) {
  const tanda = indeks.get(kunci(sumber, String(properties.id ?? "")));
  if (!tanda) {
    delete properties.tanda;
    delete properties.dihapus;
    delete properties.dihapus_oleh;
    delete properties.dihapus_waktu;
    delete properties.tanda_id;
    return;
  }
  properties.tanda = "dihapus";
  properties.dihapus = true;
  properties.dihapus_oleh = tanda.dibuat_oleh;
  properties.dihapus_waktu = tanda.waktu;
  properties.tanda_id = tanda.id;
}

export async function muatTanda(): Promise<void> {
  try {
    susun(await daftarTanda());
    galatMuat = "";
  } catch (galat) {
    susun([]);
    galatMuat = galat instanceof Error ? galat.message : "Tabel titik_tanda tidak terbaca.";
  }
  beritahu();
}

export async function tandaiDihapus(input: { titikId: string; sumber: SumberTanda; dibuatOleh: string }): Promise<void> {
  if (cariTanda(input.sumber, input.titikId)) return;
  const baris = await buatTanda({
    titik_id: input.titikId,
    sumber: input.sumber,
    status: "dihapus",
    dibuat_oleh: input.dibuatOleh,
    waktu: waktuSekarang(),
  });
  indeks.set(kunci(baris.sumber, baris.titik_id), baris);
  galatMuat = "";
  beritahu();
}

export async function pulihkanTanda(sumber: SumberTanda, titikId: string): Promise<void> {
  const ada = cariTanda(sumber, titikId);
  if (!ada) return;
  await hapusTanda(ada.id);
  indeks.delete(kunci(sumber, titikId));
  beritahu();
}

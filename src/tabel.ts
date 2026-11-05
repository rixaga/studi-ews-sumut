import type { Titik } from "./model";
import { asset, escapeHtml, formatDerajat, STATUS_LABEL } from "./model";

type Kunci = "id" | "jenis" | "status" | "survei" | "kab" | "kecamatan" | "desa" | "lokasi" | "lon" | "lat" | "das" | "subDas";
type Kelompok = "kab" | "das";

type Baris = {
  titik: Titik;
  id: string;
  jenis: string;
  status: string;
  survei: string;
  kab: string;
  kecamatan: string;
  desa: string;
  lokasi: string;
  lon: number;
  lat: number;
  das: string;
  subDas: string;
};

const KOLOM: Array<[Kunci, string]> = [
  ["id", "ID"],
  ["jenis", "Jenis"],
  ["status", "Status"],
  ["survei", "Survei"],
  ["kab", "Kab/Kota"],
  ["kecamatan", "Kecamatan"],
  ["desa", "Desa"],
  ["lokasi", "Lokasi"],
  ["lon", "Lon"],
  ["lat", "Lat"],
  ["das", "DAS"],
  ["subDas", "Sub-DAS"],
];

const kepala = document.querySelector<HTMLTableRowElement>("#tabel-kepala");
const isi = document.querySelector<HTMLTableSectionElement>("#tabel-isi");
const meta = document.querySelector<HTMLElement>("#tabel-meta");
const cari = document.querySelector<HTMLInputElement>("#tabel-cari");
const tombolKab = document.querySelector<HTMLButtonElement>("#grup-kab");
const tombolDas = document.querySelector<HTMLButtonElement>("#grup-das");

let sumber: Titik[] = [];
let tambahan: Titik[] = [];
let dasIndeks = new Map<string, { das: string; subDas: string }>();
let kelompok: Kelompok = "kab";
let urut: { kunci: Kunci; arah: "naik" | "turun" } = { kunci: "id", arah: "naik" };
let terpilih = "";
let onPilih: (titik: Titik) => void = () => undefined;
const sudahSurvei = new Set<string>();

function kosong(nilai: string | null | undefined): string {
  const teks = (nilai ?? "").trim();
  return teks || "-";
}

function labelJenis(jenis: string): string {
  if (jenis === "sirine") return "Sirine";
  if (jenis === "sensor") return "Sensor";
  return jenis || "-";
}

function splitCsv(baris: string): string[] {
  const hasil: string[] = [];
  let sel = "";
  let kutip = false;
  for (let i = 0; i < baris.length; i += 1) {
    const huruf = baris[i];
    if (huruf === '"') {
      if (kutip && baris[i + 1] === '"') {
        sel += '"';
        i += 1;
      } else {
        kutip = !kutip;
      }
    } else if (huruf === "," && !kutip) {
      hasil.push(sel);
      sel = "";
    } else {
      sel += huruf;
    }
  }
  hasil.push(sel);
  return hasil;
}

export async function muatIndeksDas(): Promise<void> {
  try {
    const response = await fetch(asset("data/points_das.csv"));
    if (!response.ok) return;
    const teks = (await response.text()).replace(/^\uFEFF/, "");
    const baris = teks.split(/\r?\n/).filter((line) => line.trim());
    if (baris.length < 2) return;
    const header = splitCsv(baris[0]).map((kolom) => kolom.trim().toLowerCase());
    const iId = header.indexOf("id");
    const iDas = header.indexOf("das");
    const iSub = header.indexOf("sub_das");
    if (iId < 0) return;
    const indeks = new Map<string, { das: string; subDas: string }>();
    for (const line of baris.slice(1)) {
      const kolom = splitCsv(line);
      const id = (kolom[iId] ?? "").trim();
      if (!id) continue;
      indeks.set(id, {
        das: iDas >= 0 ? (kolom[iDas] ?? "").trim() : "",
        subDas: iSub >= 0 ? (kolom[iSub] ?? "").trim() : "",
      });
    }
    dasIndeks = indeks;
  } catch {
    dasIndeks = new Map();
  }
}

function jadiBaris(titik: Titik): Baris {
  const nama = dasIndeks.get(titik.properties.id);
  const [lon, lat] = titik.geometry.coordinates;
  return {
    titik,
    id: titik.properties.id,
    jenis: labelJenis(titik.properties.jenis),
    status: STATUS_LABEL[titik.properties.status] ?? titik.properties.status,
    survei: sudahSurvei.has(titik.properties.id) ? "Sudah disurvei" : "—",
    kab: kosong(titik.properties.wadmkk_tampil),
    kecamatan: kosong(titik.properties.wadmkc),
    desa: kosong(titik.properties.wadmkd),
    lokasi: kosong(titik.properties.remark),
    lon,
    lat,
    das: kosong(nama?.das),
    subDas: kosong(nama?.subDas),
  };
}

function cocok(baris: Baris, kata: string): boolean {
  if (!kata) return true;
  const haystack = [baris.id, baris.jenis, baris.status, baris.survei, baris.kab, baris.kecamatan, baris.desa, baris.lokasi, formatDerajat(baris.lon), formatDerajat(baris.lat), baris.das, baris.subDas]
    .join(" ")
    .toLocaleLowerCase("id");
  return haystack.includes(kata);
}

function banding(a: Baris, b: Baris): number {
  const arah = urut.arah === "naik" ? 1 : -1;
  if (urut.kunci === "lon" || urut.kunci === "lat") return (a[urut.kunci] - b[urut.kunci]) * arah;
  return a[urut.kunci].localeCompare(b[urut.kunci], "id", { numeric: true, sensitivity: "base" }) * arah;
}

function urutGrup(kunci: string[]): string[] {
  const salin = [...kunci];
  const arah = urut.arah === "naik" ? 1 : -1;
  const ikut = (kelompok === "kab" && urut.kunci === "kab") || (kelompok === "das" && urut.kunci === "das");
  salin.sort((a, b) => a.localeCompare(b, "id", { numeric: true, sensitivity: "base" }) * (ikut ? arah : 1));
  return salin;
}

function sel(baris: Baris): string {
  const nilai: Record<Kunci, string> = {
    id: baris.id,
    jenis: baris.jenis,
    status: baris.status,
    survei: baris.survei,
    kab: baris.kab,
    kecamatan: baris.kecamatan,
    desa: baris.desa,
    lokasi: baris.lokasi,
    lon: formatDerajat(baris.lon),
    lat: formatDerajat(baris.lat),
    das: baris.das,
    subDas: baris.subDas,
  };
  return KOLOM.map(([kunci]) => {
    if (kunci === "id" && baris.titik.properties.cek_wilayah) {
      return `<td>${escapeHtml(nilai.id)} <span class="cek" title="Nama pada poligon COD-AB berbeda dari Excel">cek</span></td>`;
    }
    if (kunci === "survei" && baris.survei === "Sudah disurvei") {
      return `<td><span class="lencana-survei">Sudah disurvei</span></td>`;
    }
    return `<td>${escapeHtml(nilai[kunci])}</td>`;
  }).join("");
}

function barisHtml(baris: Baris): string {
  const aktif = baris.id === terpilih ? " terpilih" : "";
  return `<tr class="${aktif.trim()}" data-id="${escapeHtml(baris.id)}" tabindex="0">${sel(baris)}</tr>`;
}

function kepalaGrup(teks: string, jumlah: number, kelas: string): string {
  return `<tr class="${kelas}"><th colspan="${KOLOM.length}">${escapeHtml(teks)}<span class="hitung">${jumlah.toLocaleString("id-ID")} titik</span></th></tr>`;
}

function gambarKepala() {
  if (!kepala) return;
  kepala.innerHTML = KOLOM.map(([kunci, label]) => {
    const sort = urut.kunci === kunci ? (urut.arah === "naik" ? "ascending" : "descending") : "none";
    const tanda = urut.kunci === kunci ? (urut.arah === "naik" ? " ↑" : " ↓") : "";
    return `<th aria-sort="${sort}"><button type="button" data-kunci="${kunci}">${label}${tanda}</button></th>`;
  }).join("");
}

function kelompokkan(baris: Baris[]): string {
  if (kelompok === "kab") {
    const peta = new Map<string, Baris[]>();
    for (const item of baris) {
      const daftar = peta.get(item.kab) ?? [];
      daftar.push(item);
      peta.set(item.kab, daftar);
    }
    return urutGrup([...peta.keys()])
      .map((kab) => {
        const daftar = peta.get(kab) ?? [];
        return kepalaGrup(kab, daftar.length, "grup") + daftar.map(barisHtml).join("");
      })
      .join("");
  }
  const peta = new Map<string, Map<string, Baris[]>>();
  for (const item of baris) {
    const dalam = peta.get(item.das) ?? new Map<string, Baris[]>();
    const daftar = dalam.get(item.kab) ?? [];
    daftar.push(item);
    dalam.set(item.kab, daftar);
    peta.set(item.das, dalam);
  }
  return urutGrup([...peta.keys()])
    .map((das) => {
      const dalam = peta.get(das) ?? new Map<string, Baris[]>();
      const jumlah = [...dalam.values()].reduce((total, daftar) => total + daftar.length, 0);
      const kabHtml = [...dalam.keys()]
        .sort((a, b) => a.localeCompare(b, "id", { numeric: true, sensitivity: "base" }))
        .map((kab) => {
          const daftar = dalam.get(kab) ?? [];
          return kepalaGrup(kab, daftar.length, "subgrup") + daftar.map(barisHtml).join("");
        })
        .join("");
      return kepalaGrup(das, jumlah, "grup") + kabHtml;
    })
    .join("");
}

function gambar() {
  const kata = (cari?.value ?? "").trim().toLocaleLowerCase("id");
  const baris = [...sumber, ...tambahan].map(jadiBaris).filter((item) => cocok(item, kata)).sort(banding);
  if (meta) {
    const adaSub = [...dasIndeks.values()].some((item) => item.subDas);
    meta.textContent = dasIndeks.size
      ? `${baris.length.toLocaleString("id-ID")} titik. DAS dari data/points_das.csv.${adaSub ? "" : " Sub-DAS kosong pada berkas, ditampilkan -."}`
      : `${baris.length.toLocaleString("id-ID")} titik. DAS dan Sub-DAS masih - sampai data/points_das.csv diisi.`;
  }
  gambarKepala();
  if (!isi) return;
  isi.innerHTML = baris.length
    ? kelompokkan(baris)
    : `<tr><td colspan="${KOLOM.length}">Tidak ada titik pada saringan ini.</td></tr>`;
}

export function pasangTabel(pilih: (titik: Titik) => void) {
  onPilih = pilih;
  cari?.addEventListener("input", gambar);
  tombolKab?.addEventListener("click", () => {
    kelompok = "kab";
    tombolKab?.setAttribute("aria-pressed", "true");
    tombolDas?.setAttribute("aria-pressed", "false");
    gambar();
  });
  tombolDas?.addEventListener("click", () => {
    kelompok = "das";
    tombolDas?.setAttribute("aria-pressed", "true");
    tombolKab?.setAttribute("aria-pressed", "false");
    gambar();
  });
  kepala?.addEventListener("click", (event) => {
    const tombol = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-kunci]");
    const kunci = tombol?.dataset.kunci as Kunci | undefined;
    if (!kunci) return;
    urut = urut.kunci === kunci ? { kunci, arah: urut.arah === "naik" ? "turun" : "naik" } : { kunci, arah: "naik" };
    gambar();
  });
  isi?.addEventListener("click", (event) => {
    const baris = (event.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-id]");
    if (!baris?.dataset.id) return;
    pilihBaris(baris.dataset.id);
  });
  isi?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const baris = (event.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-id]");
    if (!baris?.dataset.id) return;
    pilihBaris(baris.dataset.id);
  });
}

function pilihBaris(id: string) {
  const titik = sumber.find((item) => item.properties.id === id);
  if (!titik) return;
  terpilih = id;
  onPilih(titik);
  const bungkus = isi?.parentElement;
  const gulung = bungkus?.scrollTop ?? 0;
  gambar();
  if (bungkus) bungkus.scrollTop = gulung;
}

export function aturTandaSurvei(id: string[]) {
  sudahSurvei.clear();
  for (const item of id) sudahSurvei.add(item);
  gambar();
}

export function gambarTabel(titik: Titik[]) {
  sumber = titik;
  gambar();
}

export function aturTambahan(titik: Titik[]) {
  tambahan = titik;
  gambar();
}

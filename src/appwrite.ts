import { Account, Client, ID, Permission, Query, Role, TablesDB, Teams } from "appwrite";
import { APPWRITE } from "./appwrite-config";

const client = new Client().setEndpoint(APPWRITE.endpoint).setProject(APPWRITE.projectId);

export const akun = new Account(client);
export const tim = new Teams(client);
const tabel = new TablesDB(client);

export type JenisUsulan = "sirine" | "sensor";
export type StatusUsulan = "usulan_studi" | "usulan_bpbd";

export type BarisUsulan = {
  id: string;
  nama: string;
  jenis: JenisUsulan;
  status: StatusUsulan;
  lat: number;
  lon: number;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  das: string;
  catatan: string;
  sumber_geocode: string;
  dibuat_oleh: string;
};

export type DataUsulan = Omit<BarisUsulan, "id">;

type BarisMentah = {
  $id: string;
  nama?: string;
  jenis?: string;
  status?: string;
  lat?: number;
  lon?: number;
  kabupaten?: string;
  kecamatan?: string;
  desa?: string;
  das?: string;
  catatan?: string;
  sumber_geocode?: string;
  dibuat_oleh?: string;
};

function teks(nilai: unknown, batas: number): string {
  return String(nilai ?? "").trim().slice(0, batas);
}

function baca(baris: BarisMentah): BarisUsulan | null {
  if (baris.jenis !== "sirine" && baris.jenis !== "sensor") return null;
  if (baris.status !== "usulan_studi" && baris.status !== "usulan_bpbd") return null;
  if (typeof baris.lat !== "number" || typeof baris.lon !== "number") return null;
  if (!baris.nama?.trim()) return null;
  return {
    id: baris.$id,
    nama: teks(baris.nama, 255),
    jenis: baris.jenis,
    status: baris.status,
    lat: baris.lat,
    lon: baris.lon,
    kabupaten: teks(baris.kabupaten, 255),
    kecamatan: teks(baris.kecamatan, 255),
    desa: teks(baris.desa, 255),
    das: teks(baris.das, 255),
    catatan: teks(baris.catatan, 2000),
    sumber_geocode: teks(baris.sumber_geocode, 255),
    dibuat_oleh: teks(baris.dibuat_oleh, 64),
  };
}

function muatan(data: DataUsulan): Record<string, string | number> {
  return {
    nama: teks(data.nama, 255),
    jenis: data.jenis,
    status: data.status,
    lat: data.lat,
    lon: data.lon,
    kabupaten: teks(data.kabupaten, 255),
    kecamatan: teks(data.kecamatan, 255),
    desa: teks(data.desa, 255),
    das: teks(data.das, 255),
    catatan: teks(data.catatan, 2000),
    sumber_geocode: teks(data.sumber_geocode, 255),
    dibuat_oleh: teks(data.dibuat_oleh, 64),
  };
}

const izinBaris = [
  Permission.read(Role.any()),
  Permission.update(Role.team(APPWRITE.timAdmin)),
  Permission.delete(Role.team(APPWRITE.timAdmin)),
];

export async function daftarUsulan(): Promise<BarisUsulan[]> {
  const semua: BarisUsulan[] = [];
  let kursor = "";
  for (;;) {
    const kueri = [Query.limit(100)];
    if (kursor) kueri.push(Query.cursorAfter(kursor));
    const halaman = await tabel.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.tableId,
      queries: kueri,
    });
    const baris = halaman.rows ?? [];
    for (const item of baris) {
      const bersih = baca(item as BarisMentah);
      if (bersih) semua.push(bersih);
    }
    if (baris.length < 100) break;
    kursor = baris[baris.length - 1]?.$id ?? "";
    if (!kursor) break;
  }
  return semua;
}

export async function buatUsulan(data: DataUsulan): Promise<BarisUsulan> {
  const hasil = await tabel.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.tableId,
    rowId: ID.unique(),
    data: muatan(data),
    permissions: izinBaris,
  });
  const bersih = baca(hasil as BarisMentah);
  if (!bersih) throw new Error("Baris yang tersimpan tidak lengkap.");
  return bersih;
}

export async function ubahUsulan(id: string, data: DataUsulan): Promise<void> {
  await tabel.updateRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.tableId,
    rowId: id,
    data: muatan(data),
  });
}

export type SumberTanda = "asli" | "usulan";

export type BarisTanda = {
  id: string;
  titik_id: string;
  sumber: SumberTanda;
  status: "dihapus";
  dibuat_oleh: string;
  waktu: string;
};

type BarisTandaMentah = {
  $id: string;
  titik_id?: string;
  sumber?: string;
  status?: string;
  dibuat_oleh?: string;
  waktu?: string;
};

function bacaTanda(baris: BarisTandaMentah): BarisTanda | null {
  if (!baris.titik_id?.trim()) return null;
  if (baris.sumber !== "asli" && baris.sumber !== "usulan") return null;
  if (baris.status !== "dihapus") return null;
  return {
    id: baris.$id,
    titik_id: teks(baris.titik_id, 64),
    sumber: baris.sumber,
    status: "dihapus",
    dibuat_oleh: teks(baris.dibuat_oleh, 128),
    waktu: teks(baris.waktu, 64),
  };
}

/** Datetime Appwrite: ISO 8601 dengan offset UTC, misalnya 2026-11-04T12:00:00.000+00:00. */
export function waktuSekarang(): string {
  return new Date().toISOString().replace("Z", "+00:00");
}

export async function daftarTanda(): Promise<BarisTanda[]> {
  const semua: BarisTanda[] = [];
  let kursor = "";
  for (;;) {
    const kueri = [Query.limit(100)];
    if (kursor) kueri.push(Query.cursorAfter(kursor));
    const halaman = await tabel.listRows({
      databaseId: APPWRITE.databaseId,
      tableId: APPWRITE.tableIdTanda,
      queries: kueri,
    });
    const baris = halaman.rows ?? [];
    for (const item of baris) {
      const bersih = bacaTanda(item as BarisTandaMentah);
      if (bersih) semua.push(bersih);
    }
    if (baris.length < 100) break;
    kursor = baris[baris.length - 1]?.$id ?? "";
    if (!kursor) break;
  }
  return semua;
}

export async function buatTanda(data: Omit<BarisTanda, "id">): Promise<BarisTanda> {
  const hasil = await tabel.createRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.tableIdTanda,
    rowId: ID.unique(),
    data: {
      titik_id: teks(data.titik_id, 64),
      sumber: data.sumber,
      status: "dihapus",
      dibuat_oleh: teks(data.dibuat_oleh, 128),
      waktu: teks(data.waktu, 64),
    },
    permissions: izinBaris,
  });
  const bersih = bacaTanda(hasil as BarisTandaMentah);
  if (!bersih) throw new Error("Tanda yang tersimpan tidak lengkap.");
  return bersih;
}

export async function hapusTanda(id: string): Promise<void> {
  await tabel.deleteRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.tableIdTanda,
    rowId: id,
  });
}

export async function hapusUsulan(id: string): Promise<void> {
  await tabel.deleteRow({
    databaseId: APPWRITE.databaseId,
    tableId: APPWRITE.tableId,
    rowId: id,
  });
}

export function pesanGalat(galat: unknown): string {
  if (galat && typeof galat === "object" && "message" in galat) {
    const teksGalat = String((galat as { message: unknown }).message);
    if (teksGalat) return teksGalat;
  }
  return "Permintaan gagal.";
}

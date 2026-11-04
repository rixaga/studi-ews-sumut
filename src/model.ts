export type StatusTitik = "usulan_studi" | "usulan_bpbd" | "hasil_survei" | "belum_ditentukan";

export type TitikProps = {
  id: string;
  jenis: "sirine" | "sensor";
  wadmkk: string;
  wadmkk_tampil: string;
  wadmkc: string;
  wadmkd: string;
  keterangan: string;
  remark: string;
  nama?: string;
  x_dms: string;
  y_dms: string;
  baris_excel: number;
  status: StatusTitik;
  status_sumber: string;
  cek_wilayah?: string;
  cek_adm2_name?: string;
  cek_adm3_name?: string;
  cek_adm4_name?: string;
  cek_adm4_pcode?: string;
  das_nama?: string;
  sumber_geocode?: string;
};

export type Titik = {
  type: "Feature";
  id?: string;
  properties: TitikProps;
  geometry: { type: "Point"; coordinates: [number, number] };
};

export type KoleksiTitik = {
  type: "FeatureCollection";
  features: Titik[];
};

export type DesaTerpapar = {
  kab_kota: string | null;
  kecamatan: string | null;
  desa: string | null;
  penduduk_terpapar: number | null;
  kolom_e_tanpa_judul: number | null;
};

export type BerkasTerpapar = {
  jumlah_baris: number;
  jumlah_kab_kota: number;
  baris: DesaTerpapar[];
};

export type BarisAlternatif = {
  kab_kota: string | null;
  kecamatan: string | null;
  desa: string | null;
  nilai: number | null;
  penanda_angka: number | null;
  status: string | null;
  catatan: string | null;
};

export type BerkasAlternatif = {
  catatan: string;
  panel_kiri: BarisAlternatif[];
  panel_kanan: BarisAlternatif[];
  angka_penutup: number | null;
};

export type BatasProvinsi = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { nama_tampil?: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  }>;
};

export const STATUS_LABEL: Record<StatusTitik, string> = {
  usulan_studi: "Usulan studi",
  usulan_bpbd: "Usulan BPBD",
  hasil_survei: "Hasil survei",
  belum_ditentukan: "Belum ditentukan",
};

export const STATUS_WARNA: Record<Exclude<StatusTitik, "belum_ditentukan">, string> = {
  usulan_studi: "#7B1FA2",
  usulan_bpbd: "#EF6C00",
  hasil_survei: "#2E7D32",
};

export function asset(path: string): string {
  const bersih = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${bersih}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatBulat(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

export function formatDerajat(value: number): string {
  return value.toFixed(6);
}

export function labelStatusSumber(sumber: string): string {
  if (sumber === "status_override.csv") return "data/status_override.csv";
  if (sumber === "bawaan_usulan_studi") return "bawaan usulan studi (ID tidak ada di CSV)";
  return sumber;
}

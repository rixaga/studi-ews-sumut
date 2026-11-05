import { AppwriteException } from "appwrite";
import { APPWRITE } from "./appwrite-config";
import {
  akun,
  buatUsulan,
  daftarUsulan,
  pesanGalat,
  tim,
  ubahUsulan,
  type BarisUsulan,
  type DataUsulan,
  type JenisUsulan,
  type StatusUsulan,
} from "./appwrite";
import { cariTempat, type HasilGeocode } from "./geocode";
import type { StudyMap } from "./map";
import { escapeHtml, type Titik } from "./model";
import { aturTambahan } from "./tabel";
import { cariTanda, galatTanda, muatTanda, pulihkanTanda, saatTandaBerubah, tandaiDihapus, tempelProperti } from "./tanda";
import { wilayahPada } from "./wilayah";

type Pengguna = { id: string; nama: string; email: string; admin: boolean };

let peta: StudyMap | null = null;
let pengguna: Pengguna | null = null;
let baris: BarisUsulan[] = [];
let draf: { lon: number; lat: number; sumber: string; id: string | null; dibuatOleh: string } | null = null;
let pencarian: AbortController | null = null;
let penundaan = 0;

const formMasuk = document.querySelector<HTMLFormElement>("#form-masuk");
const formLupa = document.querySelector<HTMLFormElement>("#form-lupa");
const formPulih = document.querySelector<HTMLFormElement>("#form-pulih");
const akunMasuk = document.querySelector<HTMLElement>("#akun-masuk");
const akunPesan = document.querySelector<HTMLElement>("#akun-pesan");
const panelAdmin = document.querySelector<HTMLElement>("#panel-admin");
const formUsulan = document.querySelector<HTMLFormElement>("#form-usulan");
const cariInput = document.querySelector<HTMLInputElement>("#geocode-q");
const cariHasil = document.querySelector<HTMLElement>("#geocode-hasil");
const modeKlik = document.querySelector<HTMLInputElement>("#mode-klik");
const alatAdmin = document.querySelector<HTMLElement>("#alat-admin");
const alatTambah = document.querySelector<HTMLButtonElement>("#alat-tambah");
const alatHapus = document.querySelector<HTMLButtonElement>("#alat-hapus");
const alatPetunjuk = document.querySelector<HTMLElement>("#alat-petunjuk");
const statusField = document.querySelector<HTMLElement>("#usulan-status-field");
const togUsulan = document.querySelector<HTMLInputElement>("#tog-usulan");
const usulanStatus = document.querySelector<HTMLElement>("#usulan-status");

function tampilPesan(teks: string) {
  if (!akunPesan) return;
  akunPesan.hidden = !teks;
  akunPesan.textContent = teks;
}

function anggotaAdmin(daftar: { teams: Array<{ $id: string; name: string }> }): boolean {
  return daftar.teams.some((timPengguna) => timPengguna.$id === APPWRITE.timAdmin || timPengguna.name.trim().toLowerCase() === APPWRITE.timAdmin);
}

async function bacaSesi(): Promise<Pengguna | null> {
  try {
    const user = await akun.get();
    const keanggotaan = await tim.list();
    return {
      id: user.$id,
      nama: user.name || user.email,
      email: user.email,
      admin: anggotaAdmin(keanggotaan),
    };
  } catch {
    return null;
  }
}

function gambarAkun() {
  const pulih = parameterPulih();
  if (formPulih) formPulih.hidden = !pulih;
  if (pulih) {
    if (formMasuk) formMasuk.hidden = true;
    if (formLupa) formLupa.hidden = true;
    if (akunMasuk) akunMasuk.hidden = true;
    if (panelAdmin) panelAdmin.hidden = true;
    if (alatAdmin) alatAdmin.hidden = true;
    matikanAlat();
    return;
  }
  const masuk = Boolean(pengguna);
  if (formMasuk) formMasuk.hidden = masuk;
  if (akunMasuk) akunMasuk.hidden = !masuk;
  if (formLupa && !formLupa.hidden && masuk) formLupa.hidden = true;
  const nama = document.querySelector("#akun-nama");
  const peran = document.querySelector("#akun-peran");
  if (nama) nama.textContent = pengguna ? pengguna.nama : "";
  if (peran) {
    peran.textContent = pengguna?.admin
      ? "Anggota tim admin. Titik usulan dapat ditambah, diubah, dan dihapus."
      : "Akun ini bukan anggota tim admin.";
  }
  if (panelAdmin) panelAdmin.hidden = !pengguna?.admin;
  if (alatAdmin) alatAdmin.hidden = !pengguna?.admin;
  if (!pengguna?.admin) matikanAlat();
  peta?.aturAksiTanda(
    pengguna?.admin
      ? {
          admin: true,
          pulihkan: (id, sumber) => {
            void pulihkan(id, sumber);
          },
        }
      : null,
  );
  peta?.aturAksiUsulan(
    Boolean(pengguna?.admin),
    (id) => {
      const item = baris.find((row) => row.id === id);
      if (item) bukaForm(item);
    },
    (id) => {
      void hapus(id);
    },
  );
  if (!pengguna?.admin && modeKlik) {
    modeKlik.checked = false;
    peta?.aturModeTambah(false, null);
  }
}

function parameterPulih(): { userId: string; secret: string } | null {
  const parameter = new URLSearchParams(window.location.search);
  const userId = parameter.get("userId") ?? "";
  const secret = parameter.get("secret") ?? "";
  if (!userId || !secret) return null;
  return { userId, secret };
}

function keTitik(item: BarisUsulan): Titik {
  return {
    type: "Feature",
    id: item.id,
    properties: {
      id: item.id,
      jenis: item.jenis,
      wadmkk: item.kabupaten,
      wadmkk_tampil: item.kabupaten || "-",
      wadmkc: item.kecamatan,
      wadmkd: item.desa,
      keterangan: item.catatan || "Titik usulan",
      remark: item.nama,
      nama: item.nama,
      x_dms: "",
      y_dms: "",
      baris_excel: 0,
      status: item.status,
      status_sumber: "appwrite",
      das_nama: item.das || "—",
      sumber_geocode: item.sumber_geocode || "—",
      spider: [0, 0],
    },
    geometry: { type: "Point", coordinates: [item.lon, item.lat] },
  };
}

function gambarLapisan() {
  const fitur = baris.map((item) => {
    const titik = keTitik(item);
    tempelProperti(titik.properties, "usulan");
    return titik as unknown as GeoJSON.Feature;
  });
  peta?.setUsulan(fitur, togUsulan?.checked !== false);
  aturTambahan(togUsulan?.checked === false ? [] : baris.map(keTitik));
  if (usulanStatus) {
    usulanStatus.textContent = baris.length
      ? `${baris.length.toLocaleString("id-ID")} titik dari Appwrite.`
      : "Belum ada titik usulan.";
  }
}

async function muatUlang() {
  try {
    baris = await daftarUsulan();
    gambarLapisan();
  } catch (galat) {
    if (usulanStatus) usulanStatus.textContent = `Titik usulan tidak termuat. ${pesanGalat(galat)}`;
    aturTambahan([]);
  }
}

async function bukaForm(item: BarisUsulan | null, lon?: number, lat?: number, sumber = "klik peta", nama = "") {
  if (!formUsulan || !pengguna?.admin) return;
  const tujuanLon = item?.lon ?? lon;
  const tujuanLat = item?.lat ?? lat;
  if (tujuanLon == null || tujuanLat == null) return;
  draf = {
    lon: tujuanLon,
    lat: tujuanLat,
    sumber: item?.sumber_geocode || sumber,
    id: item?.id ?? null,
    dibuatOleh: item?.dibuat_oleh || pengguna.id,
  };
  peta?.taruhPenanda(tujuanLon, tujuanLat);
  const wilayah = await wilayahPada(tujuanLon, tujuanLat).catch(() => ({ kabupaten: "", kecamatan: "", desa: "", das: "" }));
  (formUsulan.elements.namedItem("nama") as HTMLInputElement).value = item?.nama ?? nama;
  (formUsulan.elements.namedItem("jenis") as HTMLSelectElement).value = item?.jenis ?? "sirine";
  (formUsulan.elements.namedItem("status") as HTMLSelectElement).value = item?.status ?? "usulan_studi";
  if (statusField) statusField.hidden = !item;
  (formUsulan.elements.namedItem("catatan") as HTMLTextAreaElement).value = item?.catatan ?? "";
  const ringkas = document.querySelector("#usulan-wilayah");
  if (ringkas) {
    ringkas.textContent = [
      wilayah.kabupaten || item?.kabupaten || "kabupaten tidak dikenali",
      wilayah.kecamatan || item?.kecamatan || "kecamatan tidak dikenali",
      wilayah.desa || item?.desa || "desa tidak dikenali",
      wilayah.das || item?.das || "DAS tidak dikenali",
    ].join(" · ");
  }
  formUsulan.dataset.kabupaten = wilayah.kabupaten || item?.kabupaten || "";
  formUsulan.dataset.kecamatan = wilayah.kecamatan || item?.kecamatan || "";
  formUsulan.dataset.desa = wilayah.desa || item?.desa || "";
  formUsulan.dataset.das = wilayah.das || item?.das || "";
  const hapusTombol = document.querySelector<HTMLButtonElement>("#usulan-hapus");
  if (hapusTombol) hapusTombol.hidden = !item;
  formUsulan.hidden = false;
}

async function simpan(event: Event) {
  event.preventDefault();
  if (!formUsulan || !draf || !pengguna?.admin) return;
  const data: DataUsulan = {
    nama: (formUsulan.elements.namedItem("nama") as HTMLInputElement).value,
    jenis: (formUsulan.elements.namedItem("jenis") as HTMLSelectElement).value as JenisUsulan,
    status: itemStatus(),
    lat: draf.lat,
    lon: draf.lon,
    kabupaten: formUsulan.dataset.kabupaten ?? "",
    kecamatan: formUsulan.dataset.kecamatan ?? "",
    desa: formUsulan.dataset.desa ?? "",
    das: formUsulan.dataset.das ?? "",
    catatan: (formUsulan.elements.namedItem("catatan") as HTMLTextAreaElement).value,
    sumber_geocode: draf.sumber,
    dibuat_oleh: draf.dibuatOleh,
  };
  if (!data.nama.trim()) {
    tampilPesan("Nama titik wajib diisi.");
    return;
  }
  try {
    if (draf.id) await ubahUsulan(draf.id, data);
    else await buatUsulan(data);
    formUsulan.hidden = true;
    peta?.hapusPenanda();
    tampilPesan("");
    await muatUlang();
  } catch (galat) {
    tampilPesan(pesanGalat(galat));
  }
}

function itemStatus(): StatusUsulan {
  if (statusField?.hidden) return "usulan_studi";
  const nilai = (formUsulan?.elements.namedItem("status") as HTMLSelectElement | null)?.value;
  return nilai === "usulan_bpbd" ? "usulan_bpbd" : "usulan_studi";
}

function matikanAlat() {
  if (alatTambah) alatTambah.setAttribute("aria-pressed", "false");
  if (alatHapus) alatHapus.setAttribute("aria-pressed", "false");
  if (alatPetunjuk) alatPetunjuk.textContent = "";
  if (modeKlik) modeKlik.checked = false;
  peta?.aturModeTambah(false, null);
  peta?.aturModeHapus(false, null);
}

async function tandaiTitik(info: { id: string; sumber: "asli" | "usulan"; nama: string }) {
  if (!pengguna?.admin) return;
  if (cariTanda(info.sumber, info.id)) {
    tampilPesan("Titik ini sudah ditandai dihapus.");
    return;
  }
  const nama = info.nama || info.id;
  if (!window.confirm(`Tandai “${nama}” sebagai dihapus? Titik tetap di peta, dengan tanda silang.`)) return;
  try {
    await tandaiDihapus({ titikId: info.id, sumber: info.sumber, dibuatOleh: pengguna.id });
    tampilPesan("");
  } catch (galat) {
    tampilPesan(pesanGalat(galat));
  }
}

async function pulihkan(id: string, sumber: "asli" | "usulan") {
  if (!pengguna?.admin) return;
  if (!window.confirm("Pulihkan titik ini? Tanda silang akan dihilangkan.")) return;
  try {
    await pulihkanTanda(sumber, id);
    tampilPesan("");
  } catch (galat) {
    tampilPesan(pesanGalat(galat));
  }
}

async function hapus(id: string) {
  const item = baris.find((row) => row.id === id);
  await tandaiTitik({ id, sumber: "usulan", nama: item?.nama ?? id });
  if (formUsulan) formUsulan.hidden = true;
  peta?.hapusPenanda();
}

function gambarHasil(hasil: HasilGeocode[]) {
  if (!cariHasil) return;
  if (!hasil.length) {
    cariHasil.hidden = true;
    cariHasil.innerHTML = "";
    return;
  }
  cariHasil.hidden = false;
  cariHasil.innerHTML = hasil
    .map((item, index) => {
      const usul = pengguna?.admin ? `<button type="button" data-usul="${index}">Usulkan di sini</button>` : "";
      return `<li><button type="button" data-pilih="${index}">${escapeHtml(item.nama)}</button>${usul}</li>`;
    })
    .join("");
  cariHasil.querySelectorAll<HTMLButtonElement>("[data-pilih]").forEach((tombol) => {
    tombol.addEventListener("click", () => {
      const item = hasil[Number(tombol.dataset.pilih)];
      if (!item) return;
      peta?.taruhPenanda(item.lon, item.lat);
      if (cariHasil) cariHasil.hidden = true;
    });
  });
  cariHasil.querySelectorAll<HTMLButtonElement>("[data-usul]").forEach((tombol) => {
    tombol.addEventListener("click", () => {
      const item = hasil[Number(tombol.dataset.usul)];
      if (!item) return;
      void bukaForm(null, item.lon, item.lat, item.sumber, item.nama.split(",")[0] ?? item.nama);
      if (cariHasil) cariHasil.hidden = true;
    });
  });
}

function pasangCari() {
  cariInput?.addEventListener("input", () => {
    window.clearTimeout(penundaan);
    pencarian?.abort();
    const kata = cariInput.value;
    penundaan = window.setTimeout(() => {
      const kontrol = new AbortController();
      pencarian = kontrol;
      void cariTempat(kata, kontrol.signal)
        .then((hasil) => {
          if (kontrol.signal.aborted) return;
          gambarHasil(hasil);
        })
        .catch((galat: unknown) => {
          if (kontrol.signal.aborted) return;
          if (cariHasil) {
            cariHasil.hidden = false;
            cariHasil.innerHTML = `<li>${escapeHtml(galat instanceof Error ? galat.message : "Pencarian gagal.")}</li>`;
          }
        });
    }, 400);
  });
}

export function pasangUsulan(petaAktif: StudyMap) {
  peta = petaAktif;
  pasangCari();
  const mulaiTambah = (nyala: boolean) => {
    if (!pengguna?.admin) return;
    if (alatHapus) alatHapus.setAttribute("aria-pressed", "false");
    peta?.aturModeHapus(false, null);
    if (alatTambah) alatTambah.setAttribute("aria-pressed", String(nyala));
    if (modeKlik) modeKlik.checked = nyala;
    if (alatPetunjuk) alatPetunjuk.textContent = nyala ? "Klik peta untuk menambah lokasi." : "";
    peta?.aturModeTambah(nyala, (lon, lat) => {
      void bukaForm(null, lon, lat, "klik peta");
      matikanAlat();
    });
  };
  modeKlik?.addEventListener("change", () => mulaiTambah(Boolean(modeKlik.checked)));
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!pengguna?.admin) return;
    matikanAlat();
  });
  alatTambah?.addEventListener("click", () => mulaiTambah(alatTambah.getAttribute("aria-pressed") !== "true"));
  alatHapus?.addEventListener("click", () => {
    if (!pengguna?.admin) return;
    const nyala = alatHapus.getAttribute("aria-pressed") !== "true";
    if (alatTambah) alatTambah.setAttribute("aria-pressed", "false");
    if (modeKlik) modeKlik.checked = false;
    peta?.aturModeTambah(false, null);
    alatHapus.setAttribute("aria-pressed", String(nyala));
    if (alatPetunjuk) alatPetunjuk.textContent = nyala ? "Klik titik yang akan ditandai dihapus." : "";
    peta?.aturModeHapus(nyala, (info) => {
      void tandaiTitik(info);
      matikanAlat();
    });
  });
  togUsulan?.addEventListener("change", gambarLapisan);
  formMasuk?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = (formMasuk.elements.namedItem("email") as HTMLInputElement).value;
    const password = (formMasuk.elements.namedItem("password") as HTMLInputElement).value;
    void akun
      .createEmailPasswordSession({ email, password })
      .then(() => bacaSesi())
      .then((hasil) => {
        pengguna = hasil;
        tampilPesan("");
        gambarAkun();
      })
      .catch((galat: unknown) => tampilPesan(pesanGalat(galat)));
  });
  document.querySelector("#akun-keluar")?.addEventListener("click", () => {
    void akun.deleteSession({ sessionId: "current" }).finally(() => {
      pengguna = null;
      gambarAkun();
    });
  });
  document.querySelector("#akun-lupa")?.addEventListener("click", () => {
    if (formLupa) formLupa.hidden = !formLupa.hidden;
  });
  formLupa?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = (formLupa.elements.namedItem("email") as HTMLInputElement).value;
    void akun
      .createRecovery({ email, url: APPWRITE.pemulihanUrl })
      .then(() => tampilPesan("Jika akun terdaftar, tautan pengaturan ulang dikirim ke email itu."))
      .catch((galat: unknown) => tampilPesan(galat instanceof AppwriteException ? galat.message : pesanGalat(galat)));
  });
  formPulih?.addEventListener("submit", (event) => {
    event.preventDefault();
    const pulih = parameterPulih();
    if (!pulih) return;
    const password = (formPulih.elements.namedItem("password") as HTMLInputElement).value;
    void akun
      .updateRecovery({ userId: pulih.userId, secret: pulih.secret, password })
      .then(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("userId");
        url.searchParams.delete("secret");
        window.history.replaceState({}, "", url);
        tampilPesan("Kata sandi diperbarui. Masuk dengan kata sandi baru.");
        gambarAkun();
      })
      .catch((galat: unknown) => tampilPesan(pesanGalat(galat)));
  });
  formUsulan?.addEventListener("submit", (event) => {
    void simpan(event);
  });
  document.querySelector("#usulan-batal")?.addEventListener("click", () => {
    if (formUsulan) formUsulan.hidden = true;
    peta?.hapusPenanda();
  });
  document.querySelector("#usulan-hapus")?.addEventListener("click", () => {
    if (draf?.id) void hapus(draf.id);
  });
  void bacaSesi().then((hasil) => {
    pengguna = hasil;
    gambarAkun();
  });
  saatTandaBerubah(() => {
    gambarLapisan();
    const alatAktif = alatTambah?.getAttribute("aria-pressed") === "true" || alatHapus?.getAttribute("aria-pressed") === "true";
    if (pengguna?.admin && galatTanda() && alatPetunjuk && !alatAktif) {
      alatPetunjuk.textContent = galatTanda();
    }
  });
  void muatUlang();
  void muatTanda();
}

import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createStudyMap, type BatasJenis, type RasterKind, type RasterState, type StudyMap } from "./map";
import {
  type BarisAlternatif,
  type BatasProvinsi,
  type BerkasAlternatif,
  type BerkasTerpapar,
  type DesaTerpapar,
  type KoleksiTitik,
  type StatusTitik,
  type Titik,
  asset,
  escapeHtml,
  formatBulat,
  STATUS_LABEL,
} from "./model";
import { pasangInfo, periksaUlang } from "./info";
import { gambarTabel, muatIndeksDas, pasangTabel } from "./tabel";
import { saatTandaBerubah, tempelProperti } from "./tanda";
import { pasangUsulan } from "./usulan-ui";

function wajib<T>(node: T | null, nama: string): T {
  if (!node) throw new Error(`Elemen hilang: ${nama}`);
  return node;
}

const kabSelect = wajib(document.querySelector<HTMLSelectElement>("#kab-select"), "kab");
const statusSelect = wajib(document.querySelector<HTMLSelectElement>("#status-select"), "status");
const togSirine = wajib(document.querySelector<HTMLInputElement>("#tog-sirine"), "sirine");
const togSensor = wajib(document.querySelector<HTMLInputElement>("#tog-sensor"), "sensor");
const togBahaya = wajib(document.querySelector<HTMLInputElement>("#tog-bahaya"), "bahaya");
const togProxy = wajib(document.querySelector<HTMLInputElement>("#tog-proxy"), "proxy");
const togSungai = wajib(document.querySelector<HTMLInputElement>("#tog-sungai"), "sungai");
const togDas = wajib(document.querySelector<HTMLInputElement>("#tog-das"), "das");
const sungaiDetail = wajib(document.querySelector<HTMLElement>("#sungai-detail"), "detail sungai");
const dasDetail = wajib(document.querySelector<HTMLElement>("#das-detail"), "detail das");
const bahayaOpacity = wajib(document.querySelector<HTMLInputElement>("#bahaya-opacity"), "opasitas bahaya");
const bahayaKelas = wajib(document.querySelector<HTMLInputElement>("#bahaya-kelas"), "kelas bahaya");
const proxyOpacity = wajib(document.querySelector<HTMLInputElement>("#proxy-opacity"), "opasitas proksi");
const bahayaDetail = wajib(document.querySelector<HTMLElement>("#bahaya-detail"), "detail bahaya");
const proxyDetail = wajib(document.querySelector<HTMLElement>("#proxy-detail"), "detail proksi");
const bahayaLegend = wajib(document.querySelector<HTMLElement>("#bahaya-legend"), "legenda bahaya");
const proxyLegend = wajib(document.querySelector<HTMLElement>("#proxy-legend"), "legenda proksi");
const mapStatus = wajib(document.querySelector<HTMLElement>("#map-status"), "status peta");
const loadError = wajib(document.querySelector<HTMLElement>("#load-error"), "galat");
const desaList = wajib(document.querySelector<HTMLElement>("#desa-list"), "daftar desa");
const desaMeta = wajib(document.querySelector<HTMLElement>("#desa-meta"), "meta desa");
const altBody = wajib(document.querySelector<HTMLElement>("#alt-body"), "alternatif");
const ikonLegenda = wajib(document.querySelector<HTMLElement>("#ikon-legenda"), "legenda ikon");
const menuBtn = wajib(document.querySelector<HTMLButtonElement>("#menu-btn"), "menu");
const sidebar = wajib(document.querySelector<HTMLElement>("#sidebar"), "sidebar");
const scrim = wajib(document.querySelector<HTMLButtonElement>("#scrim"), "scrim");

const togBatasDas = wajib(document.querySelector<HTMLInputElement>("#tog-batas-das"), "batas das");
const togBatasKec = wajib(document.querySelector<HTMLInputElement>("#tog-batas-kec"), "batas kecamatan");
const togBatasDesa = wajib(document.querySelector<HTMLInputElement>("#tog-batas-desa"), "batas desa");
const batasDasDetail = wajib(document.querySelector<HTMLElement>("#batas-das-detail"), "detail batas das");
const batasKecDetail = wajib(document.querySelector<HTMLElement>("#batas-kec-detail"), "detail batas kecamatan");
const batasDesaDetail = wajib(document.querySelector<HTMLElement>("#batas-desa-detail"), "detail batas desa");
const tabPeta = wajib(document.querySelector<HTMLButtonElement>("#tab-peta"), "tab peta");
const tabInfo = wajib(document.querySelector<HTMLButtonElement>("#tab-info"), "tab info");
const panelPeta = wajib(document.querySelector<HTMLElement>("#panel-peta"), "panel peta");
const panelInfo = wajib(document.querySelector<HTMLElement>("#panel-info"), "panel info");

const rasterState: Record<RasterKind, RasterState> = {
  bahaya: "off",
  proxy: "off",
  sungai: "off",
  das: "off",
  "batas-das": "off",
  "batas-kab": "off",
  "batas-kec": "off",
  "batas-desa": "off",
};
const batasNyala: Record<Exclude<BatasJenis, "kab">, boolean> = { das: false, kec: false, desa: false };
let peta: StudyMap | null = null;
let sungaiNyala = false;
let dasNyala = false;
let sirine: Titik[] = [];
let sensor: Titik[] = [];
let desa: DesaTerpapar[] = [];
let alternatif: BerkasAlternatif | null = null;

function pesanRaster(state: RasterState): string {
  if (state === "loading") return "Memuat lapisan…";
  if (state === "error") return "Layer tidak tersedia";
  if (state === "partial") return "Sebagian petak tidak tersedia";
  return "";
}

function gambarLegendaIkon() {
  const status: StatusTitik[] = ["usulan_studi", "usulan_bpbd", "hasil_survei"];
  const berkas: Record<StatusTitik, [string, string]> = {
    usulan_studi: ["sirene_usulan_studi.png", "sensor_banjir_usulan_studi.png"],
    usulan_bpbd: ["sirene_usulan_bpbd.png", "sensor_banjir_usulan_bpbd.png"],
    hasil_survei: ["sirene_hasil_survei.png", "sensor_banjir_hasil_survei.png"],
    belum_ditentukan: ["sirene.png", "sensor_banjir.png"],
  };
  const kepala = status.map((item) => `<span>${STATUS_LABEL[item]}</span>`).join("");
  const baris = (jenis: "Sirine" | "Sensor", index: 0 | 1) =>
    `<span class="jenis">${jenis}</span>` +
    status
      .map((item) => `<img src="${asset(`icons/${berkas[item][index]}`)}" alt="${jenis} ${STATUS_LABEL[item]}" />`)
      .join("");
  ikonLegenda.innerHTML = `<span></span>${kepala}${baris("Sirine", 0)}${baris("Sensor", 1)}`;
}

function gambarLegendaBahaya() {
  if (bahayaKelas.checked) {
    bahayaLegend.innerHTML = `
      <ul class="kelas">
        <li><i style="background:#38a800"></i> 0,01–0,333</li>
        <li><i style="background:#ffff00"></i> 0,333–0,666</li>
        <li><i style="background:#ff0000"></i> 0,666–1</li>
      </ul>
      <p class="hint">Klasifikasi tampilan (bukan kelas resmi BNPB). Legenda 0 (rendah) – 1 (tinggi).</p>`;
    return;
  }
  bahayaLegend.innerHTML = `
    <div class="skala"><span>0 (rendah)</span><span class="skala-bar"></span><span>1 (tinggi)</span></div>
    <p class="hint">Warna mengikuti server InaRISK. Bukan kelas buatan dasbor.</p>`;
}

function gambarLegendaProxy() {
  proxyLegend.innerHTML = `
    <ul class="kelas">
      <li><i style="background:#38a800"></i> &lt; 0,333</li>
      <li><i style="background:#ffff00"></i> 0,333–0,666</li>
      <li><i style="background:#ff0000"></i> ≥ 0,666</li>
    </ul>
    <p class="hint">Klasifikasi tampilan, bukan kelas resmi. Danau Toba dan tubuh air lain dapat tampil tinggi pada snapshot 4 November 2026.</p>`;
}

function saringTitik(titik: Titik[]): Titik[] {
  const kab = kabSelect.value;
  const status = statusSelect.value;
  return titik.filter((feature) => {
    if (kab !== "semua" && feature.properties.wadmkk_tampil !== kab) return false;
    if (status !== "semua" && feature.properties.status !== status) return false;
    return true;
  });
}

function desaSaring(): DesaTerpapar[] {
  const kab = kabSelect.value;
  return desa.filter((row) => kab === "semua" || row.kab_kota === kab);
}

function gambarDesa() {
  const baris = desaSaring()
    .filter((row) => (row.penduduk_terpapar ?? 0) > 0)
    .sort((a, b) => (b.penduduk_terpapar ?? 0) - (a.penduduk_terpapar ?? 0))
    .slice(0, 10);
  const tertinggi = baris[0]?.penduduk_terpapar ?? 0;
  const jumlahPositif = desaSaring().filter((row) => (row.penduduk_terpapar ?? 0) > 0).length;
  const jumlahKab = new Set(desa.map((row) => row.kab_kota).filter(Boolean)).size;
  desaMeta.textContent =
    kabSelect.value === "semua"
      ? `${desa.length.toLocaleString("id-ID")} desa pada lembar Terpapar, ${jumlahKab} kabupaten/kota. Tidak ada poligon desa.`
      : `${jumlahPositif.toLocaleString("id-ID")} desa bernilai di atas nol. Tidak ada poligon desa.`;
  if (!baris.length) {
    desaList.innerHTML = `<p class="hint">Tidak ada desa dengan penduduk terpapar di atas nol pada saringan ini.</p>`;
    return;
  }
  desaList.innerHTML = `<ul class="v3-daftar">${baris
    .map((row) => {
      const lebar = tertinggi > 0 ? Math.max(6, Math.round(((row.penduduk_terpapar ?? 0) / tertinggi) * 100)) : 0;
      return `<li class="desa-baris">
        <div>
          <p class="v3-baris-judul">${escapeHtml(row.desa)}</p>
          <p class="v3-baris-rinci">${escapeHtml(row.kecamatan)} · ${escapeHtml(row.kab_kota)}</p>
          <span class="bar" style="width:${lebar}%"></span>
        </div>
        <strong>${formatBulat(row.penduduk_terpapar)}</strong>
      </li>`;
    })
    .join("")}</ul>`;
}

function gambarAlternatif(baris: BarisAlternatif[], judul: string): string {
  if (!baris.length) return "";
  const isi = baris
    .slice(0, 12)
    .map((row) => {
      const catatan = row.catatan ? `<p class="v3-baris-rinci">${escapeHtml(row.catatan)}</p>` : "";
      const status = row.status ? `<span class="v3-pil">${escapeHtml(row.status)}</span>` : "";
      return `<li class="desa-baris">
        <div>
          <p class="v3-baris-judul">${escapeHtml(row.desa)}</p>
          <p class="v3-baris-rinci">${escapeHtml(row.kecamatan)}</p>
          ${catatan}
        </div>
        <div class="alt-kanan">${status}<strong>${formatBulat(row.nilai)}</strong></div>
      </li>`;
    })
    .join("");
  const sisa = baris.length > 12 ? `<p class="hint">${baris.length - 12} baris lagi tidak ditampilkan.</p>` : "";
  return `<h3>${judul}</h3><ul class="v3-daftar">${isi}</ul>${sisa}`;
}

function gambarAlt() {
  if (!alternatif) return;
  const kab = kabSelect.value;
  if (kab === "semua") {
    altBody.innerHTML = `<p class="hint">Pilih kabupaten/kota untuk melihat kandidat. Panel kiri ${alternatif.panel_kiri.length} desa, panel kanan ${alternatif.panel_kanan.length} desa. Nilai numerik tidak berjudul di sumber.</p>`;
    return;
  }
  const kiri = alternatif.panel_kiri.filter((row) => row.kab_kota === kab);
  const kanan = alternatif.panel_kanan.filter((row) => row.kab_kota === kab);
  if (!kiri.length && !kanan.length) {
    altBody.innerHTML = `<p class="hint">Tidak ada baris alternatif untuk kabupaten/kota ini.</p>`;
    return;
  }
  altBody.innerHTML = `${gambarAlternatif(kanan, "Panel kanan")}${gambarAlternatif(kiri, "Panel kiri")}<p class="hint">Angka dibulatkan. Kolom nilai tidak berjudul pada berkas sumber.</p>`;
}

function perbaruiStatus() {
  const pasangan: Array<[RasterKind, string]> = [
    ["bahaya", "bahaya-status"],
    ["proxy", "proxy-status"],
    ["sungai", "sungai-status"],
    ["das", "das-status"],
    ["batas-das", "batas-das-status"],
    ["batas-kab", "batas-kab-status"],
    ["batas-kec", "batas-kec-status"],
    ["batas-desa", "batas-desa-status"],
  ];
  for (const [jenis, id] of pasangan) {
    const simpul = document.getElementById(id);
    if (simpul) simpul.textContent = pesanRaster(rasterState[jenis]);
  }
  const aktif = pasangan.map(([jenis]) => pesanRaster(rasterState[jenis])).filter(Boolean);
  mapStatus.hidden = aktif.length === 0;
  mapStatus.textContent = aktif.join(" · ");
}

function terapkan(geserPeta: boolean) {
  const sirineSaring = saringTitik(sirine);
  const sensorSaring = saringTitik(sensor);
  for (const titik of [...sirineSaring, ...sensorSaring]) tempelProperti(titik.properties, "asli");
  peta?.setTitik(sirineSaring, sensorSaring);
  peta?.setVisible("sirine", togSirine.checked);
  peta?.setVisible("sensor", togSensor.checked);
  bahayaDetail.hidden = !togBahaya.checked;
  proxyDetail.hidden = !togProxy.checked;
  sungaiDetail.hidden = !togSungai.checked;
  dasDetail.hidden = !togDas.checked;
  batasDasDetail.hidden = !togBatasDas.checked;
  batasKecDetail.hidden = !togBatasKec.checked;
  batasDesaDetail.hidden = !togBatasDesa.checked;
  sinkronBatas("das", togBatasDas.checked);
  sinkronBatas("kec", togBatasKec.checked);
  sinkronBatas("desa", togBatasDesa.checked);
  if (togBahaya.checked) gambarLegendaBahaya();
  if (togProxy.checked) gambarLegendaProxy();
  peta?.setBahaya(togBahaya.checked, Number(bahayaOpacity.value) / 100, bahayaKelas.checked);
  peta?.setProxy(togProxy.checked, Number(proxyOpacity.value) / 100);
  if (togSungai.checked !== sungaiNyala) {
    sungaiNyala = togSungai.checked;
    void peta?.setSungai(sungaiNyala);
  }
  if (togDas.checked !== dasNyala) {
    dasNyala = togDas.checked;
    void peta?.setDas(dasNyala);
  }
  const desaAktif = desaSaring();
  const jumlahPenduduk = desaAktif.reduce((total, row) => total + (row.penduduk_terpapar ?? 0), 0);
  const jumlahPositif = desaAktif.filter((row) => (row.penduduk_terpapar ?? 0) > 0).length;
  const nSirine = document.querySelector("#n-sirine");
  const nSensor = document.querySelector("#n-sensor");
  const nDesa = document.querySelector("#n-desa");
  const nPop = document.querySelector("#n-pop");
  if (nSirine) nSirine.textContent = sirineSaring.length.toLocaleString("id-ID");
  if (nSensor) nSensor.textContent = sensorSaring.length.toLocaleString("id-ID");
  if (nDesa) nDesa.textContent = jumlahPositif.toLocaleString("id-ID");
  if (nPop) nPop.textContent = formatBulat(jumlahPenduduk);
  gambarDesa();
  gambarAlt();
  gambarTabel([...sirineSaring, ...sensorSaring]);
  perbaruiStatus();
  if (geserPeta) peta?.fitTitik([...sirineSaring, ...sensorSaring]);
}

function sinkronBatas(jenis: Exclude<BatasJenis, "kab">, nyala: boolean) {
  if (batasNyala[jenis] === nyala) return;
  batasNyala[jenis] = nyala;
  void peta?.setBatas(jenis, nyala);
}

function idCek(idBerkas: string): string {
  const id = idBerkas.trim();
  if (/^(SRN|SNS)-DS-\d+$/.test(id)) return id;
  const cocok = /^(SRN|SNS)-(\d+)$/.exec(id);
  if (!cocok) return id;
  return `${cocok[1]}-DS-${cocok[2]}`;
}

function bagiCsv(baris: string): string[] {
  const hasil: string[] = [];
  let sel = "";
  let kutip = false;
  for (let i = 0; i < baris.length; i += 1) {
    const huruf = baris[i];
    if (huruf === '"') {
      if (kutip && baris[i + 1] === '"') {
        sel += '"';
        i += 1;
      } else kutip = !kutip;
    } else if (huruf === "," && !kutip) {
      hasil.push(sel);
      sel = "";
    } else sel += huruf;
  }
  hasil.push(sel);
  return hasil;
}

async function pasangCekWilayah(titik: Titik[]) {
  const indeks = new Map(titik.map((fitur) => [fitur.properties.id, fitur]));
  try {
    const respons = await fetch(asset("data/mismatch_points.csv"));
    if (!respons.ok) return;
    const baris = (await respons.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    const header = bagiCsv(baris[0] ?? "").map((kolom) => kolom.trim());
    const kolom = (nama: string) => header.indexOf(nama);
    for (const line of baris.slice(1)) {
      const sel = bagiCsv(line);
      const fitur = indeks.get(idCek(sel[kolom("id")] ?? ""));
      if (!fitur) continue;
      const adm2 = (sel[kolom("adm2_name")] ?? "").trim();
      const adm3 = (sel[kolom("adm3_name")] ?? "").trim();
      const adm4 = (sel[kolom("adm4_name")] ?? "").trim();
      const kode = (sel[kolom("adm4_pcode")] ?? "").trim();
      if (adm2 && adm2 !== fitur.properties.wadmkk) fitur.properties.cek_adm2_name = adm2;
      if (adm3 && adm3 !== fitur.properties.wadmkc) fitur.properties.cek_adm3_name = adm3;
      if (adm4 && adm4 !== fitur.properties.wadmkd) fitur.properties.cek_adm4_name = adm4;
      if (fitur.properties.cek_adm2_name || fitur.properties.cek_adm3_name || fitur.properties.cek_adm4_name) {
        fitur.properties.cek_wilayah = "berbeda";
        if (kode) fitur.properties.cek_adm4_pcode = kode;
      }
    }
  } catch {
    // Berkas cek bersifat tambahan. Titik tetap tampil tanpa tanda.
  }
}

function pasangTab() {
  const pilih = (info: boolean) => {
    panelPeta.hidden = info;
    panelInfo.hidden = !info;
    tabPeta.setAttribute("aria-selected", String(!info));
    tabInfo.setAttribute("aria-selected", String(info));
    if (!info) peta?.resize();
  };
  tabPeta.addEventListener("click", () => pilih(false));
  tabInfo.addEventListener("click", () => pilih(true));
}

function isiKabupaten() {
  const nama = new Set<string>();
  for (const feature of [...sirine, ...sensor]) nama.add(feature.properties.wadmkk_tampil);
  for (const row of desa) if (row.kab_kota) nama.add(row.kab_kota);
  const urut = [...nama].sort((a, b) => a.localeCompare(b, "id"));
  for (const item of urut) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    kabSelect.append(option);
  }
}

function menu(buka: boolean) {
  sidebar.classList.toggle("terbuka", buka);
  menuBtn.setAttribute("aria-expanded", String(buka));
  scrim.hidden = !buka;
}

async function muat<T>(path: string): Promise<T> {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json() as Promise<T>;
}

function pasangMenu() {
  menuBtn.addEventListener("click", () => menu(!sidebar.classList.contains("terbuka")));
  scrim.addEventListener("click", () => menu(false));
  for (const elemen of [kabSelect, statusSelect, togSirine, togSensor, togBahaya, togProxy, bahayaKelas, togSungai, togDas, togBatasDas, togBatasKec, togBatasDesa]) {
    elemen.addEventListener("change", () => {
      const geser = elemen === kabSelect || elemen === statusSelect;
      terapkan(geser);
    });
  }
  for (const elemen of [bahayaOpacity, proxyOpacity]) {
    elemen.addEventListener("input", () => terapkan(false));
  }
  window.addEventListener("resize", () => peta?.resize());
}

async function mulai() {
  gambarLegendaIkon();
  gambarLegendaBahaya();
  gambarLegendaProxy();
  pasangTabel((titik) => peta?.fokusTitik(titik));
  pasangInfo();
  pasangTab();
  pasangMenu();
  void periksaUlang();
  try {
    const [sirineData, sensorData, penduduk, alternatifData, batas] = await Promise.all([
      muat<KoleksiTitik>("data/sirine.geojson"),
      muat<KoleksiTitik>("data/sensor.geojson"),
      muat<BerkasTerpapar>("data/penduduk_terpapar.json"),
      muat<BerkasAlternatif>("data/alternatif_lokasi.json"),
      muat<BatasProvinsi>("data/batas/sumatera_utara_adm1.geojson"),
    ]);
    sirine = sirineData.features;
    sensor = sensorData.features;
    desa = penduduk.baris;
    alternatif = alternatifData;
    isiKabupaten();
    await muatIndeksDas();
    await pasangCekWilayah([...sirine, ...sensor]);
    const mapNode = document.querySelector<HTMLElement>("#map");
    if (!mapNode) throw new Error("Peta tidak ditemukan");
    peta = await createStudyMap(mapNode, batas, (kind, state) => {
      rasterState[kind] = state;
      perbaruiStatus();
    });
    saatTandaBerubah(() => terapkan(false));
    pasangUsulan(peta);
    terapkan(false);
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `Data peta gagal dimuat. ${error instanceof Error ? error.message : ""}`;
  }
}

void mulai();

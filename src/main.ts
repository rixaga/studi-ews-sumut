import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
import { createStudyMap, type BatasJenis, type DasarPeta, type RasterKind, type RasterState, type StudyMap } from "./map";
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
import { muatSurvei, pasangFoto } from "./survei";
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
const togSurvei = wajib(document.querySelector<HTMLInputElement>("#tog-survei"), "hasil survei");
const togBatasKec = wajib(document.querySelector<HTMLInputElement>("#tog-batas-kec"), "batas kecamatan");
const togBatasDesa = wajib(document.querySelector<HTMLInputElement>("#tog-batas-desa"), "batas desa");
const togJalanRtrw = wajib(document.querySelector<HTMLInputElement>("#tog-jalan-rtrw"), "jalan rtrw");
const togSungaiRtrw = wajib(document.querySelector<HTMLInputElement>("#tog-sungai-rtrw"), "sungai rtrw");
const togDanauRtrw = wajib(document.querySelector<HTMLInputElement>("#tog-danau-rtrw"), "danau rtrw");
const togPosHidro = wajib(document.querySelector<HTMLInputElement>("#tog-pos-hidro"), "pos hidrologi");
const batasDasDetail = wajib(document.querySelector<HTMLElement>("#batas-das-detail"), "detail batas das");
const batasKecDetail = wajib(document.querySelector<HTMLElement>("#batas-kec-detail"), "detail batas kecamatan");
const batasDesaDetail = wajib(document.querySelector<HTMLElement>("#batas-desa-detail"), "detail batas desa");
const jalanRtrwDetail = wajib(document.querySelector<HTMLElement>("#jalan-rtrw-detail"), "detail jalan rtrw");
const sungaiRtrwDetail = wajib(document.querySelector<HTMLElement>("#sungai-rtrw-detail"), "detail sungai rtrw");
const danauRtrwDetail = wajib(document.querySelector<HTMLElement>("#danau-rtrw-detail"), "detail danau rtrw");
const posHidroDetail = wajib(document.querySelector<HTMLElement>("#pos-hidro-detail"), "detail pos hidrologi");
const tabPeta = wajib(document.querySelector<HTMLButtonElement>("#tab-peta"), "tab peta");
const tabInfo = wajib(document.querySelector<HTMLButtonElement>("#tab-info"), "tab info");
const panelPeta = wajib(document.querySelector<HTMLElement>("#panel-peta"), "panel peta");
const panelInfo = wajib(document.querySelector<HTMLElement>("#panel-info"), "panel info");

const rasterState: Record<RasterKind, RasterState> = {
  bahaya: "off",
  proxy: "off",
  "batas-das": "off",
  "batas-kab": "off",
  "batas-kec": "off",
  "batas-desa": "off",
  "jalan-rtrw": "off",
  "sungai-rtrw": "off",
  "danau-rtrw": "off",
  "pos-hidro": "off",
};
const batasNyala: Record<Exclude<BatasJenis, "kab">, boolean> = { das: false, kec: false, desa: false };
let peta: StudyMap | null = null;
let jalanRtrwNyala = false;
let sungaiRtrwNyala = false;
let danauRtrwNyala = false;
let posHidroNyala = false;
let sirine: Titik[] = [];
let sensor: Titik[] = [];
let posHitung = { pda: 0, pch: 0, pkl: 0 };
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
    <div class="skala"><span>0,01</span><span class="skala-bahaya"></span><span>1</span></div>
    <p class="hint">Ramp kuning–jingga–merah. Di bawah 0,01 transparan. Bukan kelas resmi BNPB.</p>`;
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

function gambarAlternatif(baris: BarisAlternatif[]): string {
  if (!baris.length) return `<p class="hint">Tidak ada baris alternatif untuk kabupaten/kota ini.</p>`;
  const isi = baris
    .slice(0, 12)
    .map((row) => {
      const sensor = [row.sensor_di_desa, row.nama_desa_sensor, row.sensor_beda_desa].filter(Boolean).join(" · ");
      const rinci = sensor ? `<p class="v3-baris-rinci">${escapeHtml(sensor)}</p>` : "";
      const alt = row.alt_sirine != null ? `<span class="v3-pil">${escapeHtml(row.alt_sirine)} sirine</span>` : "";
      return `<li class="desa-baris">
        <div>
          <p class="v3-baris-judul">${escapeHtml(row.desa)}</p>
          <p class="v3-baris-rinci">${escapeHtml(row.kecamatan)}</p>
          ${rinci}
        </div>
        <div class="alt-kanan">${alt}<strong>${formatBulat(row.nilai)}</strong></div>
      </li>`;
    })
    .join("");
  const sisa = baris.length > 12 ? `<p class="hint">${baris.length - 12} baris lagi tidak ditampilkan.</p>` : "";
  return `<ul class="v3-daftar">${isi}</ul>${sisa}<p class="hint">Angka dibulatkan. Kolom penduduk pada lembar ini tidak berjudul.</p>`;
}

function gambarAlt() {
  if (!alternatif) return;
  const kab = kabSelect.value;
  if (kab === "semua") {
    altBody.innerHTML = `<p class="hint">Pilih kabupaten/kota untuk melihat kandidat. ${alternatif.baris.length} desa pada lembar Alternatif Lokasi.</p>`;
    return;
  }
  altBody.innerHTML = gambarAlternatif(alternatif.baris.filter((row) => row.kab_kota === kab));
}

function perbaruiStatus() {
  const pasangan: Array<[RasterKind, string]> = [
    ["bahaya", "bahaya-status"],
    ["proxy", "proxy-status"],
    ["batas-das", "batas-das-status"],
    ["batas-kab", "batas-kab-status"],
    ["batas-kec", "batas-kec-status"],
    ["batas-desa", "batas-desa-status"],
    ["jalan-rtrw", "jalan-rtrw-status"],
    ["sungai-rtrw", "sungai-rtrw-status"],
    ["danau-rtrw", "danau-rtrw-status"],
    ["pos-hidro", "pos-hidro-status"],
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
  batasDasDetail.hidden = !togBatasDas.checked;
  batasKecDetail.hidden = !togBatasKec.checked;
  batasDesaDetail.hidden = !togBatasDesa.checked;
  jalanRtrwDetail.hidden = !togJalanRtrw.checked;
  sungaiRtrwDetail.hidden = !togSungaiRtrw.checked;
  danauRtrwDetail.hidden = !togDanauRtrw.checked;
  posHidroDetail.hidden = !togPosHidro.checked;
  sinkronBatas("das", togBatasDas.checked);
  sinkronBatas("kec", togBatasKec.checked);
  sinkronBatas("desa", togBatasDesa.checked);
  if (togBahaya.checked) gambarLegendaBahaya();
  if (togProxy.checked) gambarLegendaProxy();
  peta?.setBahaya(togBahaya.checked, Number(bahayaOpacity.value) / 100, bahayaKelas.checked);
  peta?.setProxy(togProxy.checked, Number(proxyOpacity.value) / 100);
  if (togJalanRtrw.checked !== jalanRtrwNyala) {
    jalanRtrwNyala = togJalanRtrw.checked;
    void peta?.setJalanRtrw(jalanRtrwNyala);
  }
  if (togSungaiRtrw.checked !== sungaiRtrwNyala) {
    sungaiRtrwNyala = togSungaiRtrw.checked;
    void peta?.setSungaiRtrw(sungaiRtrwNyala);
  }
  if (togDanauRtrw.checked !== danauRtrwNyala) {
    danauRtrwNyala = togDanauRtrw.checked;
    void peta?.setDanauRtrw(danauRtrwNyala);
  }
  if (togPosHidro.checked !== posHidroNyala) {
    posHidroNyala = togPosHidro.checked;
    void peta?.setPosHidro(posHidroNyala);
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
  const nPda = document.querySelector("#n-pda");
  const nPch = document.querySelector("#n-pch");
  const nPkl = document.querySelector("#n-pkl");
  if (nPda) nPda.textContent = posHitung.pda.toLocaleString("id-ID");
  if (nPch) nPch.textContent = posHitung.pch.toLocaleString("id-ID");
  if (nPkl) nPkl.textContent = posHitung.pkl.toLocaleString("id-ID");
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

function pasangLapisan() {
  const tombol = document.querySelector<HTMLButtonElement>("#lapisan-tombol");
  const isi = document.querySelector<HTMLElement>("#lapisan-isi");
  if (!tombol || !isi) return;
  const atur = (buka: boolean) => {
    tombol.setAttribute("aria-expanded", String(buka));
    isi.hidden = !buka;
  };
  atur(window.matchMedia("(min-width: 768px)").matches);
  tombol.addEventListener("click", () => atur(tombol.getAttribute("aria-expanded") !== "true"));
}

function pasangMenu() {
  menuBtn.addEventListener("click", () => menu(!sidebar.classList.contains("terbuka")));
  scrim.addEventListener("click", () => menu(false));
  for (const elemen of [kabSelect, statusSelect, togSirine, togSensor, togBahaya, togProxy, bahayaKelas, togBatasDas, togBatasKec, togBatasDesa, togJalanRtrw, togSungaiRtrw, togDanauRtrw, togPosHidro]) {
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
  pasangFoto();
  pasangTab();
  pasangLapisan();
  pasangMenu();
  void periksaUlang();
  try {
    const [sirineData, sensorData, penduduk, alternatifData, batas, posData] = await Promise.all([
      muat<KoleksiTitik>("data/sirine.geojson"),
      muat<KoleksiTitik>("data/sensor.geojson"),
      muat<BerkasTerpapar>("data/penduduk_terpapar.json"),
      muat<BerkasAlternatif>("data/alternatif_lokasi.json"),
      muat<BatasProvinsi>("data/batas/sumatera_utara_adm1.geojson"),
      muat<{ features: Array<{ properties?: { jenis?: string; kode?: string } }> }>("data/pos_hidrologi_bbws2.geojson"),
    ]);
    sirine = sirineData.features;
    sensor = sensorData.features.filter((titik) => titik.properties.keterangan !== "Eksisting");
    posHitung = { pda: 0, pch: 0, pkl: 0 };
    for (const fitur of posData.features) {
      const jenis = fitur.properties?.jenis;
      const kode = fitur.properties?.kode;
      if (jenis === "Duga Air" && kode === "PDA") posHitung.pda += 1;
      else if (jenis === "Curah Hujan" && kode === "PCH") posHitung.pch += 1;
      else if (jenis === "Klimatologi" && kode === "PKL") posHitung.pkl += 1;
    }
    desa = penduduk.baris;
    alternatif = alternatifData;
    isiKabupaten();
    await muatIndeksDas();
    await pasangCekWilayah([...sirine, ...sensor]);
    const mapNode = document.querySelector<HTMLElement>("#map");
    if (!mapNode) throw new Error("Peta tidak ditemukan");
    const pilihDasar = wajib(document.querySelector<HTMLSelectElement>("#peta-dasar"), "peta dasar");
    const dasarAwal = bacaDasar();
    pilihDasar.value = dasarAwal;
    peta = await createStudyMap(mapNode, batas, (kind, state) => {
      rasterState[kind] = state;
      perbaruiStatus();
    }, dasarAwal);
    pilihDasar.addEventListener("change", () => {
      const mode = sebagaiDasar(pilihDasar.value);
      peta?.aturDasar(mode);
      try {
        localStorage.setItem(KUNCI_DASAR, mode);
      } catch {
        // Penyimpanan bisa ditolak. Pilihan tetap berlaku untuk sesi ini.
      }
    });
    peta.resize();
    requestAnimationFrame(() => peta?.resize());
    saatTandaBerubah(() => terapkan(false));
    pasangUsulan(peta);
    togSurvei.addEventListener("change", () => {
      void muatSurvei(peta!, togSurvei.checked);
    });
    await muatSurvei(peta, togSurvei.checked);
    terapkan(false);
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `Data peta gagal dimuat. ${error instanceof Error ? error.message : ""}`;
  }
}

const KUNCI_DASAR = "studi-ews-basemap";

function sebagaiDasar(nilai: string): DasarPeta {
  if (nilai === "satelit" || nilai === "satelit-label") return nilai;
  return "jalan";
}

function bacaDasar(): DasarPeta {
  try {
    return sebagaiDasar(localStorage.getItem(KUNCI_DASAR) ?? "");
  } catch {
    return "jalan";
  }
}

void mulai();

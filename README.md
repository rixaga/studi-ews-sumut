# Studi EWS Sumut

Dasbor peta statis untuk studi penempatan sirine dan sensor peringatan dini di Provinsi Sumatera Utara. Antarmuka berbahasa Indonesia. Situs yang diterbitkan tidak memakai peladen aplikasi: semua berkas dibangun lalu diunggah ke GitHub Pages.

Ini bahan studi, bukan siaran langsung dan bukan sistem resmi BNPB, BMKG, atau BPBD.

Tampilan mengikuti bahasa visual [Pantau Bencana v0.3](https://pantau-bencana.github.io/karhutla-dashboard/v3/#/) (folder `src/v3` pada repositori `pantau-bencana/karhutla-dashboard`). Tidak ada tag git bernama v03; edisi itu bertuliskan v0.3 pada antarmukanya. Yang diikuti di sini adalah tata letak, warna, tipografi, kartu, dan bilah sisi, bukan fitur bahaya lain pada dasbor itu.

## Data

| Berkas | Isi |
| --- | --- |
| `data/raw/SEBARAN SIRINE DAN SENSOR.xlsx` | Lembar SIRINE dan SENSOR. Tidak diubah. |
| `data/raw/Olah Penduduk Terpapar.xlsx` | Lembar Terpapar, Terdampak, Sumut, dan Alternatif Lokasi. Tidak diubah. |
| `data/sirine.geojson`, `data/sensor.geojson` | 209 sirine dan 65 sensor. |
| `data/penduduk_terpapar.csv`, `data/penduduk_terpapar.json` | 3.039 desa pada 20 kabupaten/kota. |
| `data/penduduk_terdampak.json` | Salinan multiset lembar Terpapar. Lihat isu di bawah. |
| `data/penduduk_sumut.json` | 4.700 desa pada 33 kabupaten/kota. |
| `data/alternatif_lokasi.json` | Dua panel kandidat desa, tanpa geometri. |
| `data/status_override.csv` | Status tiap titik. Sunting berkas ini untuk mengubah status. |
| `data/QA.md` | Jumlah, kosong, duplikat, bbox, dan isu yang diketahui. |
| `data/batas/sumatera_utara_adm1.geojson` | Batas provinsi. |
| `data/risk_proxy_sumut_class_cog.tif`, `data/risk_proxy_sumut_f32_cog.tif` | Raster sumber proksi (tidak diminta browser). |
| `public/data/risk_proxy_tiles/` | 1.118 petak PNG, z5–z12, sampai lintang −0,8°. Snapshot 4 November 2026. |
| `public/icons/` | Pin sirine dan sensor, termasuk tiga warna status. |
| `data/hidro/rivers_sumut.geojson` | HydroRIVERS v1, 9.574 ruas, dipotong ke Sumut. |
| `data/hidro/das_sumut_hydrobasins_l7.geojson` | 40 sub-DAS HydroBASINS level 7. |

### Asal koordinat titik

Lembar SIRINE dan SENSOR memakai header pada baris 4: `WADMKK`, `WADMKC`, `WADMKD`, `KETERANGAN`, `REMARK`, `X`, `Y`. Kabupaten, kecamatan, desa, dan keterangan hanya terisi pada baris pertama tiap kelompok, lalu diisi ke depan. Baris `Grand Total` dibuang.

`X` dan `Y` adalah teks DMS, misalnya `98° 48' 12.568" E` dan `3° 36' 40.954" N`. Semuanya berakhiran E dan N pada berkas ini. Derajat desimal dihitung dari teks itu dan disimpan sebagai GeoJSON `[bujur, lintang]`.

### CRS

WGS 84, EPSG:4326. Tidak ada transformasi datum lain.

### Status titik

Excel **tidak** punya kolom status. `KETERANGAN` hanya berisi `Titik Penempatan Sirine Peringatan` atau `Titik Sensor`.

Keputusan tampilan saat ini: **semua 209 sirine dan 65 sensor berstatus `usulan_studi`** (pin ungu `#7B1FA2`). Keputusan itu dicatat baris per baris di `data/status_override.csv`, bukan disimpulkan dari lokasi atau remark.

Nilai yang diterima:

| status | Warna | Ikon |
| --- | --- | --- |
| `usulan_studi` | ungu `#7B1FA2` | `sirene_usulan_studi`, `sensor_banjir_usulan_studi` |
| `usulan_bpbd` | oranye `#EF6C00` | `sirene_usulan_bpbd`, `sensor_banjir_usulan_bpbd` |
| `hasil_survei` | hijau `#2E7D32` | `sirene_hasil_survei`, `sensor_banjir_hasil_survei` |
| `belum_ditentukan` | pin asli | `sirene` merah, `sensor_banjir` biru |

Untuk mengubah status nanti: sunting kolom `status` pada ID yang bersangkutan, lalu jalankan ulang `python scripts/convert_data.py`. ID yang tidak tercantum di CSV tetap memakai bawaan `usulan_studi`. ID pada CSV berbentuk `SRN-DS-001` dan `SNS-DS-001` karena banyak remark sensor hanya bertuliskan `Jembatan`.

### Batas wilayah

Batas kabupaten/kota dari HDX COD-AB selalu tampil, beserta nama `adm2_name`. Garisnya hitam `#111`, tebal sekitar 2,2 di bawah zoom 9 dan 3 mulai zoom 11, dengan selubung putih tipis supaya terbaca di citra satelit. Kecamatan ungu tua `#5b2a86` (tebal 1,4, opasitas 0,9). Desa abu-abu muda putus-putus `#9e9e9e` mulai zoom 10 (tebal 0,6–0,9, opasitas 0,7). Urutan gambar: desa di bawah kecamatan, kecamatan di bawah kabupaten, semuanya di bawah titik. Tidak ada isian poligon admin. Fitur `Danau Toba` pada berkas adm2 digambar sebagai air, bukan sebagai kabupaten. Batas kecamatan, desa, dan DAS (garis plus `nama_das`) mati sampai dinyalakan.

Klaster peta memakai satu sumber untuk sirine dan sensor sekaligus. Angka pada lingkaran adalah jumlah seluruh titik di dalamnya. Mengarahkan kursor menampilkan rincian sirine, sensor, dan status. Beberapa titik berjarak kurang dari 40 m; ikonnya digeser sedikit hanya pada zoom 14 ke atas supaya tidak bertumpuk. Koordinat di tabel dan popup tetap koordinat sumber.

### Daftar titik

Di bawah peta ada tabel ID, jenis, kabupaten/kota, kecamatan, desa, lokasi (remark), bujur, lintang, DAS, dan sub-DAS. Judul kolom bisa diurutkan. Kotak cari menyaring baris. “Kelompokkan berdasarkan” memilih kabupaten/kota atau DAS. Satu DAS dapat meliputi beberapa kabupaten/kota, jadi kelompok DAS menampilkan kabupaten/kota di dalamnya. Mengklik baris membawa peta ke titik itu dan membuka popup.

Nama DAS dibaca dari `data/points_das.csv` (kolom `id`, `das`, `sub_das`). Seluruh 274 titik punya nama DAS. Kolom `sub_das` kosong pada berkas, jadi tabel menampilkan `-`. Nama Excel tidak diubah.

`data/mismatch_points.csv` menandai titik yang nama kab/kec/desanya pada Excel berbeda dari poligon HDX COD-AB. ID pada berkas itu berbentuk `SRN-001` / `SNS-001`; dasbor mencocokkannya ke `SRN-DS-001` / `SNS-DS-001` karena nomor dan nama Excel-nya sama. Baris itu mendapat tanda “cek” dan catatan pada popup. Nama sumber tidak diganti.

### Penduduk

Angka penduduk pecahan disimpan apa adanya. Dasbor membulatkan ke bilangan bulat hanya saat menampilkan. Metode penghitungan dan sumber penduduk **tidak tertulis** di berkas Excel, jadi tidak dijelaskan di sini.

Lembar Terdampak identik dengan Terpapar sebagai multiset (urutan baris berbeda, header nilai tetap `Penduduk Terpapar`). Lembar itu disimpan dan ditandai di `data/QA.md`, tetapi tidak ditampilkan sebagai angka kedua.

Tidak ada poligon desa pada masukan. Desa terpapar hanya tampil sebagai tabel dan batang, bukan sebagai wilayah di peta.

String `KABUPATEN PADANGSIDIMPUAN` tidak ada pada sumber. Nama yang tertulis sudah `Kota Padangsidimpuan`. Skrip tetap memetakan string kabupaten itu ke Kota pada `wadmkk_tampil` jika kelak muncul.

### Batas provinsi

Geometri Sumatera Utara diambil dari geoBoundaries gbOpen, ADM1 Indonesia, fitur `shapeName` = `North Sumatra` (`shapeISO` `ID-SU`, `shapeID` `65028918B37605681672150`). Berkas utuh:

`https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN/ADM1/geoBoundaries-IDN-ADM1.geojson`

Commit `9469f09592ced973a3448cf66b6100b741b64c0d`. Tahun representasi batas 2017, tanggal bangun Desember 2023. Lisensi Open Data Commons Open Database License 1.0. Geometri bersumber OpenStreetMap dan Wambacher. Koordinat fitur itu disalin tanpa digeser atau disederhanakan. Rincian ada di `data/batas/sumber.json`.

Bbox verteks: bujur 97,0586196–100,4401959, lintang −0,6383341–4,3016772. Angka ini lebih luas ke selatan daripada perkiraan 0,5° LU karena Pulau-Pulau Batu di selatan khatulistiwa ikut dalam ADM1 yang sama, dan ke barat mencakup Nias. `minZoom` 3,5 dan tanpa `maxBounds`, supaya tampilan bisa mundur sampai seluruh Indonesia (untuk demo di luar Sumut). Kotak 90–145 BT dan −15–10 LU terlalu sempit untuk tinggi kartu peta, jadi kamera tidak dikunci. Tampilan awal tetap `fitBounds` pada bbox ADM1 Sumut, dengan ruang untuk kotak cari, tombol zoom, dan atribusi. Tombol **Lihat seluruh Sumut** di bawah tombol zoom mengembalikan tampilan itu. Di luar poligon Sumut, peta diredupkan. Garis tepi mengikuti geometri yang sama.

### Peta dasar

[OpenFreeMap](https://openfreemap.org/), gaya `liberty`:

`https://tiles.openfreemap.org/styles/liberty`

Diperiksa 4 November 2026: berkas gaya kembali HTTP 200 bertipe JSON, tanpa kunci API, header `access-control-allow-origin: *`. Atribusi pada peta: OpenFreeMap, OpenMapTiles, dan OpenStreetMap contributors.

Pemilih di kiri bawah peta punya tiga pilihan. **Peta jalan** adalah gaya Liberty itu dan menjadi bawaan. **Satelit** memakai petak Esri World Imagery (`.../World_Imagery/MapServer/tile/{z}/{y}/{x}`, `maxzoom` 19). **Satelit + label** menambah petak referensi `Reference/World_Boundaries_and_Places` di atas citra. Citra disisipkan di lapisan paling bawah; lapisan studi (titik, label, batas, sungai, DAS, bahaya, proksi, usulan, tanda silang) tidak dibuat ulang dan status nyala/mati tetap. Pilihan disimpan di `localStorage` dengan kunci `studi-ews-basemap`.

Atribusi citra: Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community.

### Aliran sungai dan sub-DAS

Dua lapisan vektor, keduanya **mati sampai dinyalakan**. Legenda hanya muncul saat lapisan menyala. Berkas ada di `data/hidro/` dan tidak diubah.

**Aliran Sungai (HydroRIVERS).** `rivers_sumut.geojson`: HydroRIVERS v1 yang dipotong ke Sumatera Utara, 9.574 ruas `LineString`. Atribut `ORD_STRA` 1–6 (orde Strahler). Tidak ada nama sungai. Garis biru; tebal garis `['interpolate',['linear'],['get','ORD_STRA'],1,0.3,6,3]`. Pada zoom di bawah 9 hanya orde 3 ke atas yang digambar. Atribusi: © WWF HydroSHEDS (Lehner & Grill 2013).

**Sub-DAS (HydroBASINS L7, proksi, bukan DAS resmi KLHK).** `das_sumut_hydrobasins_l7.geojson`: 40 poligon HydroBASINS level 7. Hanya garis tepi, tanpa isian.

Catatan produk HydroSHEDS yang menyertai berkas ini: elevasi dasarnya sekitar 500 m, sungai yang disertakan hanya yang daerah tangkapannya sekurang-kurangnya 10 km², dan geometri tidak teliti pada skala besar. Sub-DAS ini proksi hidrologi, bukan peta DAS resmi KLHK.

### Indeks Bahaya Banjir (InaRISK)

Lapisan raster MapLibre, **mati sampai dinyalakan**. Petak 256 piksel:

`https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image`

Diperiksa 4 November 2026 tanpa token: respons `image/png`, dan dengan header `Origin: https://rixaga.github.io` server mengembalikan `access-control-allow-origin: https://rixaga.github.io`. Server menggambar langsung (bukan tembolok petak tetap). Jika petak gagal, dasbor menampilkan “Memuat lapisan…” atau “Layer tidak tersedia”.

Tanpa `renderingRule`, server mengembalikan rentangan abu-abu. Kedua mode memakai `renderingRule`. Kotak “Klasifikasi tampilan (bukan kelas resmi BNPB)” **nyala sejak awal**.

Mode klasifikasi (bawaan) memakai `renderingRule` yang di-URL-encode:

```json
{"rasterFunction":"Colormap","rasterFunctionArguments":{"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":{"InputRanges":[0.01,0.333,0.333,0.666,0.666,1.01],"OutputValues":[1,2,3],"NoDataRanges":[-1,0.01]}},"Colormap":[[1,56,168,0],[2,255,255,0],[3,255,0,0]]}}
```

Hijau, kuning, dan merah pada mode itu adalah pewarnaan tampilan, bukan kelas resmi BNPB. Nilai di bawah 0,01 transparan.

Jika kotak klasifikasi dimatikan, petak memakai ramp 16 langkah kuning–jingga–merah (Colormap setelah Remap), juga dengan nilai di bawah 0,01 transparan. `Stretch` plus `ColorRamp` pada ImageServer ini tetap menghasilkan abu-abu, jadi ramp itu tidak dipakai. Ramp ini bukan kelas resmi BNPB.

Atribusi: Indeks Bahaya Banjir © BNPB – InaRISK.

### Indeks Risiko Banjir

Layanan `INDEKS_RISIKO_BANJIR` membutuhkan token BNPB. Lapisan itu **tidak** dimuat. Pada panel hanya ada kotak nonaktif bertuliskan “butuh token BNPB”.

### Proksi risiko banjir

Raster statis, juga **mati sampai dinyalakan**, dengan penggeser opasitas dan legenda yang hanya muncul saat menyala.

Rumus: akar kuadrat dari indeks bahaya banjir dikali indeks kerentanan banjir, `√(bahaya × kerentanan)`, dari ImageServer InaRISK `INDEKS_BAHAYA_BANJIR` dan `INDEKS_KERENTANAN_BANJIR` (keduanya dapat dibaca tanpa token saat petak ini dibuat). Resolusi 100 m. Dipotong ke Sumatera Utara memakai batas administrasi BNPB `batas_administrasi` KDPBPS 12.

Kelas tampilan, bukan kelas resmi: di bawah 0,333 hijau, 0,333–0,666 kuning, 0,666 ke atas merah. Petak PNG RGBA z5–z12 (1.118 berkas) ada di `public/data/risk_proxy_tiles/{z}/{x}/{y}.png`, `tileSize` 256, `bounds` `[97, -0.8, 100.5, 4.5]` sehingga Pulau-Pulau Batu ikut tercakup. COG kelas dan float disimpan di `data/` untuk arsip, tidak diminta oleh peramban.

Atribusi: Proksi risiko banjir (√bahaya×kerentanan), olahan dari BNPB InaRISK.

Label pada panel: “Proksi, bukan indeks risiko resmi BNPB (tanpa komponen kapasitas).” Komponen kapasitas tidak masuk, jadi ini bukan indeks risiko InaRISK.

Snapshot 4 November 2026. Danau Toba dan tubuh air lain dapat tampil tinggi pada petak ini. Jejak petak mencakup Sumatera Utara ke selatan sampai lintang −0,8°, termasuk Pulau-Pulau Batu.

## Titik usulan

Pencarian tempat memakai Nominatim, dibatasi ke kotak Sumatera Utara dan `countrycodes=id`, paling banyak sekitar satu permintaan per detik. Peramban tidak mengizinkan header User-Agent buatan; identitas situs dikirim lewat Referer.

Masuk admin memakai email dan kata sandi Appwrite. Tautan lupa password mengarah kembali ke `https://rixaga.github.io/studi-ews-sumut/`. Formulir kata sandi baru muncul jika URL memuat `userId` dan `secret`. Tombol tambah, ubah, dan hapus hanya tampil bila pengguna adalah anggota tim `admin`.

Titik usulan disimpan di Appwrite (endpoint dan ID proyek ada di `src/appwrite-config.ts`, tanpa kunci API). Lapisan peta dan angkanya terpisah dari 274 titik studi. Kabupaten, kecamatan, desa, dan DAS diisi dari poligon yang sudah ada di repositori. Ikon usulan baru berwarna teal, bukan merah sirine atau biru sensor.

Anggota tim `admin` hanya melihat dua ikon di tepi kiri peta, di bawah kotak cari: pensil untuk **Tambah lokasi** dan penghapus untuk **Hapus lokasi**. Formulir, petunjuk, dan panel admin tidak tampil sebelum ikon ditekan. Pensil lalu klik peta membuka formulir jenis (sirine atau sensor), nama, dan catatan. Penghapus lalu klik titik menandai hapus. Menekan ikon yang sama lagi, atau Esc, mematikan mode dan menutup formulir. Bilah itu hilang saat keluar. Status tersimpan sebagai `usulan_studi`. **Hapus lokasi** tidak menghapus geometri: klik titik (studi atau usulan) menandai baris di tabel `titik_tanda`. Ikon asli tetap, dengan silang merah di atasnya. Popup menampilkan Dihapus, id pembuat, dan waktu. Admin dapat memilih Pulihkan. Pengunjung tanpa login tetap melihat tanda silang.

### Tabel `titik_tanda`

Tabel sudah ada di database `ews`. Klien memakai sesi admin yang sedang masuk. Tidak ada kunci API di peramban. Pulihkan menghapus baris itu.

Izin tabel: baca `any`, buat/ubah/hapus `team:admin`. `rowSecurity` false. Indeks `idx_titik` pada `titik_id`.

| key | jenis | wajib | catatan |
| --- | --- | --- | --- |
| titik_id | string 64 | ya | ID titik studi (`SRN-DS-…` / `SNS-DS-…`) atau `$id` baris usulan |
| sumber | enum `asli`, `usulan` | ya | `asli` untuk 274 titik, `usulan` untuk `titik_usulan` |
| status | enum `dihapus` | ya | satu nilai |
| dibuat_oleh | string 128 | tidak | `$id` pengguna Appwrite |
| waktu | datetime | ya | ISO 8601, offset UTC (`…+00:00`) |

## Menjalankan di mesin sendiri

Perlu Python 3.12 dan Node.js 22.

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/convert_data.py
npm install
npm run dev
```

`scripts/fetch_batas.py` hanya diperlukan jika `data/batas/` belum ada. Skrip itu mengunduh ADM1 Indonesia lalu menyimpan satu fitur Sumatera Utara.

`npm run dev` memakai basis `/`. `npm run build` memakai basis `/studi-ews-sumut/` agar cocok dengan GitHub Pages proyek. Perintah build menyalin GeoJSON dan JSON yang dibutuhkan ke `dist/data/`.

## Hasil survei Kobo

Workflow `.github/workflows/kobo-sync.yml` berjalan tiap 30 menit dan bisa dijalankan manual. Ia membaca `KOBO_TOKEN`. Jika secret itu belum ada, skrip selesai dengan peringatan dan tidak mengubah berkas. Jika ada token, hasil disimpan di `data/survei.geojson` dan foto di `data/survei_foto/`, lalu commit ke `main` memicu Deploy ke GitHub Pages. Tanpa kiriman, berkasnya FeatureCollection kosong.

Token tidak masuk ke peramban. Tambahkan di GitHub: **Settings → Secrets and variables → Actions → New repository secret**, nama `KOBO_TOKEN`, untuk repositori `rixaga/studi-ews-sumut`.

Uji parser tanpa jaringan: `python scripts/test_kobo_sync.py`.

## GitHub Pages

Alamat yang diharapkan setelah terbit:

**https://rixaga.github.io/studi-ews-sumut/**

Workflow `.github/workflows/pages.yml` membangun situs dan, hanya dari cabang `main`, menerbitkannya dengan GitHub Actions. Alur itu tidak berjalan hanya karena berkas workflow ada. Pemilik repositori perlu:

1. Membuka **Settings → Pages → Build and deployment**.
2. Memilih **Source: GitHub Actions** (bukan cabang `main` / folder `/docs`).
3. Menggabungkan perubahan ini ke `main`.
4. Membuka tab **Actions** dan memastikan workflow “Deploy ke GitHub Pages” berhasil.
5. Jika environment `github-pages` menunggu persetujuan, menyetujui deployment tersebut.
6. Memastikan Actions diizinkan untuk repositori privat ini.

Sebelum langkah itu, URL di atas belum menayangkan dasbor.

## Batasan

- Tidak ada umpan sirine, sensor, atau penduduk yang hidup.
- Tidak ada poligon desa; tabel tidak boleh dibaca sebagai peta wilayah.
- Sumber dan metode penduduk tidak diketahui dari berkas.
- Lembar Terdampak tidak dipakai sebagai himpunan kedua.
- Remark sumber tidak unik (`Jembatan` 30 kali, `Kantor Urusan Agama` 2 kali, `Jembatan Jl. Binjai- Stabat` 2 kali). Teks remark tidak diubah.
- Status warna adalah keputusan tampilan lewat CSV, bukan atribut survei pada Excel.
- Proksi risiko bukan indeks risiko resmi dan dapat menandai tubuh air sebagai tinggi.
- Sungai HydroRIVERS dan sub-DAS HydroBASINS kasar (DEM sekitar 500 m, sungai dengan daerah tangkapan sekurang-kurangnya 10 km²) dan bukan batas DAS resmi.
- Lapisan bahaya InaRISK bergantung pada ketersediaan server BNPB saat pengguna membuka peta.

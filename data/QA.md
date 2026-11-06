# Laporan QA data Studi EWS Sumut

Dihasilkan oleh `scripts/convert_data.py`. Berkas mentah di `data/raw/` tidak diubah.

## Berkas sumber

| Berkas | SHA-256 |
| --- | --- |
| data/raw/SEBARAN_SENSOR_DAN_SIREN.xlsx | `5a5812a6e7910d4dcc35aff2841443764edf8472a951299f28120a542a87f425` |
| data/raw/20261105_Olah_Penduduk_Terpapar3.xlsx | `00e168f697b65becb5f37cf4e71ff84991037815732d24159942ba7ad5bd0682` |

## Jumlah

| Lapisan | Jumlah | Keterangan |
| --- | --- | --- |
| Sirine | 286 | diharapkan 286 |
| Sensor | 41 | diharapkan 41 (33 Eksisting, 8 Rencana) |
| Kabupaten/kota pada titik | 12 | diharapkan 12 |
| Desa lembar Terpapar | 3039 | |
| Desa lembar Terdampak | 3039 | identik dengan Terpapar: True |
| Desa lembar Sumut | 4700 | 33 kabupaten/kota |
| Tidak disurvei | 28 | 7 kabupaten/kota |
| Alternatif lokasi | 111 | |
| Gagal konversi DMS sirine | 0 | |
| Gagal konversi DMS sensor | 0 | |

Baris `Grand Total` pada lembar SIRINE dan SENSOR dibuang (bukan titik).

## Sirine per kabupaten/kota

| Kabupaten/kota | Sirine |
| --- | --- |
| Deli Serdang | 60 |
| Langkat | 58 |
| Kota Medan | 26 |
| Tapanuli Tengah | 24 |
| Tapanuli Utara | 24 |
| Tapanuli Selatan | 20 |
| Serdang Bedagai | 18 |
| Kota Binjai | 15 |
| Kota Tebing Tinggi | 12 |
| Humbang Hasundutan | 10 |
| Kota Sibolga | 10 |
| Kota Padangsidimpuan | 9 |

## Sensor per kabupaten/kota

| Kabupaten/kota | Eksisting | Rencana |
| --- | --- | --- |
| Deli Serdang | 9 | 0 |
| Serdang Bedagai | 6 | 0 |
| Langkat | 1 | 4 |
| Tapanuli Utara | 5 | 0 |
| Kota Tebing Tinggi | 3 | 0 |
| Tapanuli Selatan | 2 | 1 |
| Humbang Hasundutan | 2 | 0 |
| Kota Binjai | 2 | 0 |
| Kota Medan | 2 | 0 |
| Tapanuli Tengah | 1 | 1 |
| Kota Padangsidimpuan | 0 | 1 |
| Kota Sibolga | 0 | 1 |

## ID

Koordinat dicocokkan pada 5 angka desimal.

| Lapisan | Dipakai ulang | Dibuat | Dihapus |
| --- | --- | --- | --- |
| Sirine | 209 | 77 | 0 (—) |
| Sensor | 2 | 39 | 63 |

ID sirine baru: SRN-DS-210 … SRN-DS-286.
ID sensor baru: SNS-DS-066 … SNS-DS-104.
ID sensor yang dipertahankan: SNS-DS-033, SNS-DS-059.
Titik tanpa nama DAS pada poligon KLHK: 0.

## Tidak disurvei

Kabupaten/kota: Asahan, Batu Bara, Mandailing Natal, Nias, Nias Selatan, Nias Utara, Pakpak Bharat.

## Penduduk terpapar per kabupaten/kota

Lembar Terpapar. Nilai dijumlahkan dari angka sumber, lalu dibulatkan ke 6 desimal pada penjumlahan di kolom ini.

| Kabupaten/kota | Desa | Jumlah penduduk (6 desimal) |
| --- | --- | --- |
| Mandailing Natal | 353 | 157686.103578 |
| Deli Serdang | 313 | 842703.531406 |
| Nias Selatan | 304 | 70577.392325 |
| Langkat | 246 | 600593.582807 |
| Serdang Bedagai | 222 | 418530.670398 |
| Tapanuli Tengah | 208 | 178731.654113 |
| Asahan | 197 | 449702.690685 |
| Tapanuli Utara | 191 | 52898.103493 |
| Tapanuli Selatan | 172 | 49664.174136 |
| Batu Bara | 142 | 347635.485034 |
| Nias | 139 | 36280.6722 |
| Kota Medan | 138 | 1541476.60395 |
| Nias Utara | 107 | 41970.7549 |
| Humbang Hasundutan | 97 | 20424.942497 |
| Nias Barat | 92 | 15875.671913 |
| Kota Tebing Tinggi | 34 | 127611.100763 |
| Pakpak Bharat | 30 | 2698.202774 |
| Kota Binjai | 20 | 61788.733215 |
| Kota Padangsidimpuan | 19 | 1197.669705 |
| Kota Sibolga | 15 | 32528.773049 |

## Lembar Sumut per kabupaten/kota

| Kabupaten/kota | Desa |
| --- | --- |
| Mandailing Natal | 353 |
| Simalungun | 316 |
| Deli Serdang | 313 |
| Nias Selatan | 304 |
| Langkat | 246 |
| Padang Lawas | 238 |
| Serdang Bedagai | 222 |
| Toba | 210 |
| Tapanuli Tengah | 208 |
| Asahan | 197 |
| Tapanuli Utara | 191 |
| Karo | 175 |
| Padang Lawas Utara | 172 |
| Tapanuli Selatan | 172 |
| Batu Bara | 142 |
| Nias | 139 |
| Kota Medan | 138 |
| Nias Utara | 107 |
| Dairi | 103 |
| Samosir | 100 |
| Humbang Hasundutan | 97 |
| Nias Barat | 92 |
| Kota Gunungsitoli | 88 |
| Labuhanbatu Utara | 75 |
| Labuhanbatu | 74 |
| Labuhanbatu Selatan | 50 |
| Kota Tebing Tinggi | 34 |
| Kota Tanjungbalai | 31 |
| Pakpak Bharat | 30 |
| Kota Pematangsiantar | 29 |
| Kota Binjai | 20 |
| Kota Padangsidimpuan | 19 |
| Kota Sibolga | 15 |

Kabupaten/kota pada lembar Sumut yang tidak ada di Terpapar: Dairi, Karo, Kota Gunungsitoli, Kota Pematangsiantar, Kota Tanjungbalai, Labuhanbatu, Labuhanbatu Selatan, Labuhanbatu Utara, Padang Lawas, Padang Lawas Utara, Samosir, Simalungun, Toba.

Kabupaten/kota titik yang tidak ada di Terpapar: —.

## Isian kosong

Sebelum isi-ke-depan, sel kab/kec/desa/keterangan kosong pada baris titik: sirine 274, sensor 29. Setelah isi-ke-depan:

| Kolom | Sirine kosong | Sensor kosong |
| --- | --- | --- |
| wadmkk | 0 | 0 |
| wadmkc | 0 | 0 |
| wadmkd | 0 | 0 |
| keterangan | 286 | 0 |
| remark | 0 | 0 |
| x/y | 0 | 0 |

Lembar penduduk: baris tanpa kab/kec/desa/nilai tidak ditemukan pada pemeriksaan konversi (baris kosong dilewati).

## Duplikat

Koordinat identik dalam lapisan sirine: 0.
Koordinat identik dalam lapisan sensor: 0.

Remark sirine yang tidak unik:

| Remark | Jumlah |
| --- | --- |
| Kantor Urusan Agama | 3 |

Remark sensor yang tidak unik (ID unik tetap diberikan; remark sumber tidak diubah):

| Remark | Jumlah |
| --- | --- |
| Jembatan | 2 |

Remark sensor persis `Jembatan`: 2 titik. Itu sebab ID `SNS-DS-###` dipakai, bukan teks remark.

## Bbox dan batas provinsi

Batas referensi: geoBoundaries ADM1 `North Sumatra` / tampilan Sumatera Utara. Bbox verteks: [97.0586196, -0.6383341, 100.4401959, 4.3016772].

| Lapisan | Bbox [barat, selatan, timur, utara] | Di dalam bbox batas |
| --- | --- | --- |
| Sirine | [98.28845528, 1.14227833, 99.43123028, 4.03868528] | True |
| Sensor | [98.155625, 1.16755111, 99.410385, 4.0016125] | True |

Titik di luar poligon batas (ray casting, tidak dihapus):

- Sirine: 0
- tidak ada
- Sensor: 0
- tidak ada

Semua teks koordinat sumber yang terbaca berakhiran `E` (kolom X, bujur) dan `N` (kolom Y, lintang).

## Isu yang diketahui

1. Lembar Terdampak identik dengan Terpapar sebagai multiset: True. Urutan baris berbeda. Header nilai tetap "Penduduk Terpapar". Dipertahankan di `data/penduduk_terdampak.json` dan tidak ditampilkan sebagai angka kedua.
2. Remark tidak unik pada sebagian sirine. Nama sensor diambil dari kolom Name. ID yang koordinatnya masih sama dipertahankan; ID baru melanjutkan nomor tertinggi dan ID yang hilang tidak dipakai lagi.
3. String `KABUPATEN PADANGSIDIMPUAN` tidak muncul pada kolom kabupaten/kota. Nama yang tertulis sudah `Kota Padangsidimpuan` (titik: Kota Padangsidimpuan; penduduk: Kota Padangsidimpuan). Judul dan filter memakai nama sumber itu. Pemetaan cadangan di skrip mengubah `KABUPATEN PADANGSIDIMPUAN` menjadi `Kota Padangsidimpuan` pada `wadmkk_tampil` jika string itu muncul.
4. Kolom E lembar Terpapar tidak berjudul. 108 sel terisi (nilai 1.0–108.0). Disimpan sebagai `kolom_e_tanpa_judul`, bukan sebagai peringkat resmi.
5. Angka kolom F (tanpa judul) pada Alternatif Lokasi yang se-desa dengan lembar Sumut: cocok 110, beda 0. Pengamatan, bukan penamaan ulang kolom.
6. Lembar Terpapar terhadap Sumut: kunci desa hilang 0, nilai berbeda 0.
7. Metode dan sumber penduduk tidak ada di berkas. Tidak diperkirakan di laporan ini.
8. Tidak ada poligon desa pada masukan. Peta tidak mengarang batas desa.
9. Ejaan teks remark (contoh pada sumber: "Hampaaran", "Percuit", "Padang Sidempuan") dibiarkan apa adanya.
10. Excel tidak memuat kolom status. Properti status bukan kolom pada Excel. Lembar sirine tidak punya kolom KETERANGAN. Lembar sensor menyimpan KETERANGAN sebagai Eksisting atau Rencana, dan nama pos pada kolom Name. Nilai awal semua titik adalah usulan_studi sesuai keputusan tampilan, dibaca dari data/status_override.csv (bukan inferensi lokasi). ID baru ditambahkan sebagai usulan_studi. ID yang hilang dari sumber dibuang dari berkas itu. Nilai belum_ditentukan memakai ikon pin asli tanpa warna status. Ringkasan status saat konversi: usulan_studi=327. Catatan berkas override: tidak ada.

## CRS

EPSG:4326 (WGS84), derajat desimal, urutan GeoJSON `[bujur, lintang]`.

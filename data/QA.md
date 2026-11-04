# Laporan QA data Studi EWS Sumut

Dihasilkan oleh `scripts/convert_data.py`. Berkas mentah di `data/raw/` tidak diubah.

## Berkas sumber

| Berkas | SHA-256 |
| --- | --- |
| data/raw/SEBARAN SIRINE DAN SENSOR.xlsx | `178eefd119f5275bac98e25b62dfb9dca0554ba7ecf70c33fc9c6d700ef75653` |
| data/raw/Olah Penduduk Terpapar.xlsx | `4576fe7bd3e864ce176e379063b37b690f793629848d3aa2db860861270bd26e` |

## Jumlah

| Lapisan | Jumlah | Keterangan |
| --- | --- | --- |
| Sirine | 209 | diharapkan 209 |
| Sensor | 65 | diharapkan 65 |
| Kabupaten/kota pada titik | 12 | diharapkan 12 |
| Desa lembar Terpapar | 3039 | 20 kabupaten/kota |
| Desa lembar Terdampak | 3039 | dipertahankan, ditandai |
| Desa lembar Sumut | 4700 | 33 kabupaten/kota |
| Alternatif panel kiri | 28 | |
| Alternatif panel kanan | 81 | |
| Gagal konversi DMS sirine | 0 | |
| Gagal konversi DMS sensor | 0 | |

Baris `Grand Total` pada lembar SIRINE dan SENSOR dibuang (bukan titik).

## Sirine per kabupaten/kota

| Kabupaten/kota | Sirine |
| --- | --- |
| Deli Serdang | 46 |
| Langkat | 42 |
| Kota Medan | 26 |
| Serdang Bedagai | 18 |
| Kota Binjai | 14 |
| Kota Tebing Tinggi | 12 |
| Humbang Hasundutan | 10 |
| Kota Sibolga | 10 |
| Tapanuli Utara | 10 |
| Tapanuli Tengah | 9 |
| Tapanuli Selatan | 8 |
| Kota Padangsidimpuan | 4 |

## Sensor per kabupaten/kota

| Kabupaten/kota | Sensor |
| --- | --- |
| Deli Serdang | 15 |
| Langkat | 15 |
| Kota Medan | 9 |
| Serdang Bedagai | 6 |
| Kota Binjai | 5 |
| Humbang Hasundutan | 3 |
| Tapanuli Tengah | 3 |
| Kota Padangsidimpuan | 2 |
| Kota Tebing Tinggi | 2 |
| Tapanuli Selatan | 2 |
| Tapanuli Utara | 2 |
| Kota Sibolga | 1 |

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

Sebelum isi-ke-depan, sel kab/kec/desa/keterangan kosong pada baris titik: sirine 197, sensor 53. Setelah isi-ke-depan:

| Kolom | Sirine kosong | Sensor kosong |
| --- | --- | --- |
| wadmkk | 0 | 0 |
| wadmkc | 0 | 0 |
| wadmkd | 0 | 0 |
| keterangan | 0 | 0 |
| remark | 0 | 0 |
| x/y | 0 | 0 |

Lembar penduduk: baris tanpa kab/kec/desa/nilai tidak ditemukan pada pemeriksaan konversi (baris kosong dilewati).

## Duplikat

Koordinat identik dalam lapisan sirine: 0.
Koordinat identik dalam lapisan sensor: 0.

Remark sirine yang tidak unik:

| Remark | Jumlah |
| --- | --- |
| Kantor Urusan Agama | 2 |

Remark sensor yang tidak unik (ID unik tetap diberikan; remark sumber tidak diubah):

| Remark | Jumlah |
| --- | --- |
| Jembatan | 30 |
| Jembatan Jl. Binjai- Stabat | 2 |

Remark sensor persis `Jembatan`: 30 titik. Itu sebab ID `SNS-DS-###` dipakai, bukan teks remark.

## Bbox dan batas provinsi

Batas referensi: geoBoundaries ADM1 `North Sumatra` / tampilan Sumatera Utara. Bbox verteks: [97.0586196, -0.6383341, 100.4401959, 4.3016772].

| Lapisan | Bbox [barat, selatan, timur, utara] | Di dalam bbox batas |
| --- | --- | --- |
| Sirine | [98.28845528, 1.14227833, 99.43123028, 4.03868528] | True |
| Sensor | [98.28985222, 1.145035, 99.43044389, 4.05027889] | True |

Titik di luar poligon batas (ray casting, tidak dihapus):

- Sirine: 0
- tidak ada
- Sensor: 0
- tidak ada

Semua teks koordinat sumber yang terbaca berakhiran `E` (kolom X, bujur) dan `N` (kolom Y, lintang).

## Isu yang diketahui

1. Lembar Terdampak identik dengan Terpapar sebagai multiset: True. Urutan baris berbeda. Header nilai tetap "Penduduk Terpapar". Dipertahankan di `data/penduduk_terdampak.json` dan tidak ditampilkan sebagai angka kedua.
2. Remark tidak unik, terutama sensor `Jembatan` (30 kali) dan beberapa nama sirine/sensor lain pada tabel di atas. ID titik dibuat unik: `SRN-DS-001` … dan `SNS-DS-001` ….
3. String `KABUPATEN PADANGSIDIMPUAN` tidak muncul pada kolom kabupaten/kota. Nama yang tertulis sudah `Kota Padangsidimpuan` (titik: Kota Padangsidimpuan; penduduk: Kota Padangsidimpuan). Judul dan filter memakai nama sumber itu. Pemetaan cadangan di skrip mengubah `KABUPATEN PADANGSIDIMPUAN` menjadi `Kota Padangsidimpuan` pada `wadmkk_tampil` jika string itu muncul.
4. Kolom E lembar Terpapar tidak berjudul. 108 sel terisi (nilai 1.0–108.0). Disimpan sebagai `kolom_e_tanpa_judul`, bukan sebagai peringkat resmi.
5. Angka pada Alternatif Lokasi yang se-desa dengan lembar Sumut: panel kiri cocok 28 beda 0; panel kanan cocok 81 beda 0. Kecocokan ini pengamatan, bukan penamaan ulang kolom. `angka_penutup` panel kanan: 108.0.
6. Lembar Terpapar terhadap Sumut: kunci desa hilang 0, nilai berbeda 0.
7. Metode dan sumber penduduk tidak ada di berkas. Tidak diperkirakan di laporan ini.
8. Tidak ada poligon desa pada masukan. Peta tidak mengarang batas desa.
9. Ejaan teks remark (contoh pada sumber: "Hampaaran", "Percuit", "Padang Sidempuan") dibiarkan apa adanya.
10. Excel tidak memuat kolom status. Properti status bukan kolom pada Excel. KETERANGAN sumber hanya 'Titik Penempatan Sirine Peringatan' atau 'Titik Sensor'. Nilai awal semua titik adalah usulan_studi sesuai keputusan tampilan, dibaca dari data/status_override.csv (bukan inferensi lokasi). ID yang tidak ada di berkas itu memakai bawaan usulan_studi. Nilai belum_ditentukan memakai ikon pin asli tanpa warna status. Ringkasan status saat konversi: usulan_studi=274. Catatan berkas override: tidak ada.

## CRS

EPSG:4326 (WGS84), derajat desimal, urutan GeoJSON `[bujur, lintang]`.

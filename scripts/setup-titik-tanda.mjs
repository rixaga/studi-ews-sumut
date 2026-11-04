/**
 * Tabel `titik_tanda` sudah ada di database `ews` (proyek studi-ews-sumut).
 * Skrip ini tidak membuat tabel. Klien menulis lewat sesi tim admin.
 *
 * Izin: read any; create/update/delete team:admin; rowSecurity false.
 * Indeks: idx_titik pada titik_id.
 *
 * Kolom:
 * - titik_id    string(64) required
 * - sumber      enum [asli, usulan] required
 * - status      enum [dihapus] required
 * - dibuat_oleh string(128)
 * - waktu       datetime
 */
console.log("Tabel ews/titik_tanda sudah ada. Tidak ada yang dibuat.");

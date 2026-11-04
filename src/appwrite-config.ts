/** Konfigurasi klien Appwrite. Tidak ada kunci API di frontend. */
export const APPWRITE = {
  endpoint: "https://sgp.cloud.appwrite.io/v1",
  projectId: "studi-ews-sumut",
  databaseId: "ews",
  tableId: "titik_usulan",
  tableIdTanda: "titik_tanda",
  timAdmin: "admin",
  pemulihanUrl: "https://rixaga.github.io/studi-ews-sumut/",
} as const;

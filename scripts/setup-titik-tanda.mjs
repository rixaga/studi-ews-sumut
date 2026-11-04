/**
 * Membuat tabel Appwrite `titik_tanda` di database `ews`.
 * Butuh kunci server (bukan kunci yang dipakai peramban):
 *   APPWRITE_API_KEY=... node scripts/setup-titik-tanda.mjs
 *
 * Skema (TablesDB, Appwrite 1.8+ / 2.x):
 * - databaseId: ews
 * - tableId: titik_tanda
 * - name: Titik tanda
 * - rowSecurity: false
 * - permissions: read("any"), create("team:admin"), update("team:admin"), delete("team:admin")
 * - columns:
 *     titik_id   varchar(64) required
 *     sumber     enum ["asli", "usulan"] required
 *     status     enum ["dihapus"] required
 *     dibuat_oleh varchar(64) required
 *     waktu      varchar(40) required
 */
const endpoint = (process.env.APPWRITE_ENDPOINT ?? "https://sgp.cloud.appwrite.io/v1").replace(/\/$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID ?? "studi-ews-sumut";
const databaseId = process.env.APPWRITE_DATABASE_ID ?? "ews";
const tableId = "titik_tanda";
const key = process.env.APPWRITE_API_KEY ?? "";

if (!key) {
  console.error("APPWRITE_API_KEY tidak ada. Tabel tidak dibuat. Skema tercetak di komentar berkas ini dan di README.");
  process.exit(2);
}

const headers = {
  "content-type": "application/json",
  "x-appwrite-project": projectId,
  "x-appwrite-key": key,
};

async function kirim(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const teks = await response.text();
  if (!response.ok && response.status !== 409) {
    throw new Error(`${method} ${path} → ${response.status} ${teks}`);
  }
  return teks ? JSON.parse(teks) : null;
}

await kirim("POST", `/tablesdb/${databaseId}/tables`, {
  tableId,
  name: "Titik tanda",
  permissions: ['read("any")', 'create("team:admin")', 'update("team:admin")', 'delete("team:admin")'],
  rowSecurity: false,
  enabled: true,
});

const kolom = [
  ["/columns/varchar", { key: "titik_id", size: 64, required: true }],
  ["/columns/enum", { key: "sumber", elements: ["asli", "usulan"], required: true }],
  ["/columns/enum", { key: "status", elements: ["dihapus"], required: true }],
  ["/columns/varchar", { key: "dibuat_oleh", size: 64, required: true }],
  ["/columns/varchar", { key: "waktu", size: 40, required: true }],
];

for (const [path, body] of kolom) {
  await kirim("POST", `/tablesdb/${databaseId}/tables/${tableId}${path}`, body);
}

console.log(`Tabel ${databaseId}/${tableId} siap (atau sudah ada).`);

const HIDUP = [
  {
    id: "inarisk",
    nama: "InaRISK — Indeks Bahaya Banjir",
    url: "https://gis.bnpb.go.id/server/rest/services/inarisk/INDEKS_BAHAYA_BANJIR/ImageServer?f=json",
  },
  {
    id: "openfreemap",
    nama: "OpenFreeMap — gaya Liberty",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
] as const;

type Hasil = { keadaan: "memeriksa" | "terhubung" | "gagal"; ms: number | null; saat: string };

const hasil = new Map<string, Hasil>();

function formatSaat(waktu: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(waktu);
}

async function periksa(url: string, batasMs = 8000): Promise<{ ok: boolean; ms: number }> {
  const mulai = performance.now();
  const kontrol = new AbortController();
  const timer = setTimeout(() => kontrol.abort(), batasMs);
  try {
    const respons = await fetch(url, { signal: kontrol.signal, cache: "no-store" });
    return { ok: respons.ok, ms: Math.round(performance.now() - mulai) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - mulai) };
  } finally {
    clearTimeout(timer);
  }
}

function gambarStatus() {
  for (const sumber of HIDUP) {
    const simpul = document.querySelector<HTMLElement>(`#status-${sumber.id}`);
    if (!simpul) continue;
    const item = hasil.get(sumber.id);
    if (!item || item.keadaan === "memeriksa") {
      simpul.innerHTML = `<span class="pil pil-tunggu">Memeriksa…</span>`;
      continue;
    }
    const kelas = item.keadaan === "terhubung" ? "pil-siap" : "pil-gagal";
    const label = item.keadaan === "terhubung" ? "Terhubung" : "Gagal";
    const latency = item.ms == null ? "—" : `${item.ms.toLocaleString("id-ID")} ms`;
    simpul.innerHTML = `<span class="pil ${kelas}">${label}</span><span>${latency}</span><span>Diperiksa ${item.saat}</span>`;
  }
}

export async function periksaUlang() {
  const tombol = document.querySelector<HTMLButtonElement>("#info-muat");
  if (tombol) tombol.disabled = true;
  for (const sumber of HIDUP) hasil.set(sumber.id, { keadaan: "memeriksa", ms: null, saat: "" });
  gambarStatus();
  await Promise.all(
    HIDUP.map(async (sumber) => {
      const cek = await periksa(sumber.url);
      hasil.set(sumber.id, {
        keadaan: cek.ok ? "terhubung" : "gagal",
        ms: cek.ms,
        saat: formatSaat(new Date()),
      });
      gambarStatus();
    }),
  );
  if (tombol) tombol.disabled = false;
}

export function pasangInfo() {
  document.querySelector("#info-muat")?.addEventListener("click", () => {
    void periksaUlang();
  });
}

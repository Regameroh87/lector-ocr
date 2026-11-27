import { describe, expect, it } from "vitest";
import { ajustarPeso, PASOS, type Paso } from "../lib/client/comprimir";

const img = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

// Simula la recompresión: cada paso deja la imagen en una fracción de su peso original.
const factor = (p: Paso) => (PASOS.indexOf(p) + 1) * 0.15;
const falso = (usados: Paso[]) => async (b: Blob, p: Paso) => {
  usados.push(p);
  return img(Math.round(b.size * (1 - factor(p))));
};

describe("ajustarPeso", () => {
  it("no toca imágenes que ya entran", async () => {
    const usados: Paso[] = [];
    const orig = [img(1_000_000), img(1_000_000)];
    expect(await ajustarPeso(orig, 4_000_000, falso(usados))).toBe(orig);
    expect(usados).toHaveLength(0);
  });

  it("usa el paso más suave que alcanza", async () => {
    const usados: Paso[] = [];
    const r = await ajustarPeso([img(1_500_000), img(1_500_000), img(1_500_000)], 4_000_000, falso(usados));
    expect(r.reduce((s, b) => s + b.size, 0)).toBeLessThanOrEqual(4_000_000);
    // 4,5 MB × 0,85 = 3,8 MB: alcanza el primer paso
    expect(new Set(usados)).toEqual(new Set([PASOS[0]]));
  });

  it("deja sin recomprimir las imágenes chicas", async () => {
    const usados: Paso[] = [];
    const chica = img(100_000);
    const r = await ajustarPeso([chica, img(5_000_000)], 4_000_000, falso(usados));
    expect(r[0]).toBe(chica);
    expect(r.reduce((s, b) => s + b.size, 0)).toBeLessThanOrEqual(4_000_000);
  });

  it("si nada alcanza, devuelve el intento más comprimido", async () => {
    const r = await ajustarPeso([img(20_000_000)], 4_000_000, falso([]));
    expect(r[0].size).toBe(Math.round(20_000_000 * (1 - factor(PASOS.at(-1)!))));
  });
});

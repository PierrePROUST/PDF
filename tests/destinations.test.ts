import { describe, expect, it } from "vitest";
import { fractionDansPage, resoudreDestination, type DocumentPourDestinations } from "../src/destinations";

// Références de page factices, comme celles renvoyées par PDF.js ({num, gen}).
const REF_P1 = { num: 10, gen: 0 };
const REF_P5 = { num: 50, gen: 0 };

function faux(nommees: Record<string, unknown[]>): DocumentPourDestinations {
  return {
    numPages: 8,
    async getDestination(id: string) {
      return nommees[id] ?? null;
    },
    async getPageIndex(ref: never) {
      const r = ref as { num: number };
      if (r === REF_P1 || r.num === 10) return 0;
      if (r.num === 50) return 4;
      throw new Error("Référence de page invalide");
    },
  };
}

describe("resoudreDestination", () => {
  const doc = faux({
    chapitre: [REF_P5, { name: "XYZ" }, 0, 400, null],
    cassee: [{ num: 999, gen: 0 }, { name: "Fit" }],
  });

  it("résout une destination nommée (chaîne) via getDestination", async () => {
    expect(await resoudreDestination(doc, "chapitre")).toEqual({
      page: 4,
      destArray: [REF_P5, { name: "XYZ" }, 0, 400, null],
    });
  });

  it("accepte directement un tableau de destination", async () => {
    const dest = [REF_P1, { name: "FitH" }, 700];
    expect(await resoudreDestination(doc, dest)).toEqual({ page: 0, destArray: dest });
  });

  it("accepte un numéro de page entier en premier élément", async () => {
    const dest = [3, { name: "Fit" }];
    expect(await resoudreDestination(doc, dest)).toEqual({ page: 3, destArray: dest });
  });

  it("renvoie null pour une destination nommée inconnue", async () => {
    expect(await resoudreDestination(doc, "inexistante")).toBeNull();
  });

  it("renvoie null si la référence de page est invalide", async () => {
    expect(await resoudreDestination(doc, "cassee")).toBeNull();
  });

  it("renvoie null pour une page hors du document", async () => {
    expect(await resoudreDestination(doc, [42, { name: "Fit" }])).toBeNull();
  });

  it("renvoie null pour null, un tableau vide ou un type inattendu", async () => {
    expect(await resoudreDestination(doc, null)).toBeNull();
    expect(await resoudreDestination(doc, [])).toBeNull();
    expect(await resoudreDestination(doc, { a: 1 })).toBeNull();
  });

  it("renvoie null si getDestination échoue", async () => {
    const enPanne = { ...doc, getDestination: () => Promise.reject(new Error("x")) };
    expect(await resoudreDestination(enPanne, "chapitre")).toBeNull();
  });
});

describe("fractionDansPage", () => {
  const A4 = [0, 0, 595, 842];

  it("XYZ : utilise la coordonnée « haut » (4e élément)", () => {
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, 0, 842, null], A4)).toBe(0);
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, 0, 421, null], A4)).toBeCloseTo(0.5);
  });

  it("FitH et FitBH : utilisent le 3e élément", () => {
    expect(fractionDansPage([REF_P1, { name: "FitH" }, 210.5], A4)).toBeCloseTo(0.75);
    expect(fractionDansPage([REF_P1, { name: "FitBH" }, 842], A4)).toBe(0);
  });

  it("FitR : utilise le haut du rectangle", () => {
    expect(fractionDansPage([REF_P1, { name: "FitR" }, 0, 100, 300, 421], A4)).toBeCloseTo(0.5);
  });

  it("renvoie null sans hauteur précisée (Fit, XYZ avec null)", () => {
    expect(fractionDansPage([REF_P1, { name: "Fit" }], A4)).toBeNull();
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, null, null, null], A4)).toBeNull();
  });

  it("tient compte d'une boîte de page décalée et borne entre 0 et 1", () => {
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, 0, 500, 0], [0, 100, 595, 900])).toBeCloseTo(0.5);
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, 0, 5000, 0], A4)).toBe(0);
    expect(fractionDansPage([REF_P1, { name: "XYZ" }, 0, -50, 0], A4)).toBe(1);
  });
});

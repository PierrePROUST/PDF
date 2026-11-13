import { PDFDocument } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { assemblerPdf, extrairePages, nomFichierPdf, trierParChemin } from "../src/assemblage";

/** PDF de n pages vides, de largeurs 101, 102… points pour les reconnaître. */
async function pdf(n: number, largeur = 100): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= n; i++) doc.addPage([largeur + i, 200]);
  return doc.save();
}
const largeurs = async (octets: Uint8Array) => (await PDFDocument.load(octets)).getPages().map((p) => p.getWidth());
const source = (nom: string, octets: Uint8Array) => ({ nom, lire: async () => octets.slice().buffer as ArrayBuffer });

describe("trierParChemin", () => {
  it("trie comme un explorateur de fichiers (nombres, casse, accents)", () => {
    const chemins = ["d/10 fin.pdf", "d/2 suite.pdf", "d/Étape.pdf", "d/1 début.pdf", "d/annexe/b.pdf", "d/abc.pdf"];
    expect(trierParChemin(chemins.map((chemin) => ({ chemin }))).map((f) => f.chemin)).toEqual([
      "d/1 début.pdf",
      "d/2 suite.pdf",
      "d/10 fin.pdf",
      "d/abc.pdf",
      "d/annexe/b.pdf",
      "d/Étape.pdf",
    ]);
  });
});

describe("nomFichierPdf", () => {
  it("ajoute l'extension une seule fois et retire les caractères interdits", () => {
    expect(nomFichierPdf("règles - extrait")).toBe("règles - extrait.pdf");
    expect(nomFichierPdf("a.PDF")).toBe("a.pdf");
    expect(nomFichierPdf("a/b:c")).toBe("a-b-c.pdf");
    expect(nomFichierPdf("  ", "extrait")).toBe("extrait.pdf");
  });
});

describe("extrairePages", () => {
  it("ne garde que les pages demandées, sans modifier l'original", async () => {
    const original = await pdf(6);
    const copie = original.slice();
    const extrait = await extrairePages(original, [0, 2, 5]);
    expect(await largeurs(extrait)).toEqual([101, 103, 106]);
    expect(original).toEqual(copie);
  });
});

describe("assemblerPdf", () => {
  it("met bout à bout les pages de plusieurs PDF, dans l'ordre donné", async () => {
    const r = await assemblerPdf([source("a.pdf", await pdf(2)), source("b.pdf", await pdf(3, 300))]);
    expect(r.nbPages).toBe(5);
    expect(await largeurs(r.octets)).toEqual([101, 102, 301, 302, 303]);
    expect(r.ignores).toEqual([]);
  });

  it("laisse de côté un fichier illisible et le signale", async () => {
    const r = await assemblerPdf([source("faux.pdf", new TextEncoder().encode("pas un PDF")), source("b.pdf", await pdf(2))]);
    expect(r.ignores.map((i) => i.nom)).toEqual(["faux.pdf"]);
    expect(r.nbPages).toBe(2);
  });

  it("échoue clairement s'il n'y a aucune page", async () => {
    await expect(assemblerPdf([])).rejects.toThrow(/Aucune page/);
  });
});

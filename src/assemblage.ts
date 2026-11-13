/**
 * Fabrication de nouveaux PDF : extraction de pages et assemblage de plusieurs PDF.
 *
 * PDF.js ne sait que lire : l'écriture passe par @cantoo/pdf-lib (licence MIT). Ce module est
 * chargé à la demande (import dynamique) pour ne pas alourdir le démarrage.
 * Les fichiers d'origine ne sont jamais modifiés : on produit toujours un nouveau PDF.
 * La table des matières et les liens internes ne sont pas recopiés dans le nouveau PDF.
 */
import { PDFDocument } from "@cantoo/pdf-lib";

const comparateur = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Ordre d'assemblage : chemins triés comme dans un explorateur (« 2 » avant « 10 »). */
export function trierParChemin<T extends { chemin: string }>(fichiers: T[]): T[] {
  return [...fichiers].sort((a, b) => comparateur.compare(a.chemin, b.chemin));
}

/** Nom de fichier terminé par « .pdf », sans caractères interdits dans un nom de fichier. */
export function nomFichierPdf(nom: string, defaut = "document"): string {
  const propre = nom.replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "").trim();
  return `${propre || defaut}.pdf`;
}

/** Nouveau PDF ne contenant que les pages demandées (index à partir de 0), dans l'ordre donné. */
export async function extrairePages(octets: Uint8Array | ArrayBuffer, indices: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(octets);
  const sortie = await PDFDocument.create();
  for (const page of await sortie.copyPages(source, indices)) sortie.addPage(page);
  return sortie.save();
}

export interface SourcePdf {
  nom: string;
  lire(): Promise<ArrayBuffer>;
}

export interface ResultatAssemblage {
  octets: Uint8Array;
  nbPages: number;
  /** Fichiers laissés de côté (illisibles, protégés par mot de passe…). */
  ignores: { nom: string; raison: string }[];
}

/** Met bout à bout toutes les pages des PDF donnés, dans l'ordre de la liste. */
export async function assemblerPdf(
  sources: SourcePdf[],
  surProgression: (fait: number, total: number) => void = () => {},
): Promise<ResultatAssemblage> {
  const sortie = await PDFDocument.create();
  const ignores: ResultatAssemblage["ignores"] = [];
  for (const [i, source] of sources.entries()) {
    surProgression(i, sources.length);
    try {
      const doc = await PDFDocument.load(await source.lire());
      for (const page of await sortie.copyPages(doc, doc.getPageIndices())) sortie.addPage(page);
    } catch (e) {
      ignores.push({ nom: source.nom, raison: e instanceof Error ? e.message : String(e) });
    }
  }
  surProgression(sources.length, sources.length);
  const nbPages = sortie.getPageCount();
  if (nbPages === 0) throw new Error("Aucune page à assembler : " + (ignores.map((i) => `${i.nom} (${i.raison})`).join(" ; ") || "aucun PDF"));
  return { octets: await sortie.save(), nbPages, ignores };
}

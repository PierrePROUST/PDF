/**
 * Un emplacement dans un document : c'est ce qui est empilé dans l'historique de
 * navigation et enregistré dans les signets perso.
 */
export interface Emplacement {
  /** Empreinte SHA-256 du contenu du PDF. */
  docId: string;
  /** Index de page, à partir de 0. */
  page: number;
  /** Décalage vertical du haut de l'écran dans la page, fraction de 0 (haut) à 1 (bas). */
  fraction: number;
  /** Niveau de zoom (échelle PDF.js, 1 = 100 %). */
  zoom: number;
}

export function memeEndroit(a: Emplacement, b: Emplacement): boolean {
  return a.docId === b.docId && a.page === b.page && Math.abs(a.fraction - b.fraction) < 0.01;
}

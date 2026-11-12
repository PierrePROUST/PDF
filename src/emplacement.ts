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
  /**
   * Décalage horizontal du bord gauche de l'écran dans la page, fraction de 0 (bord gauche)
   * à 1 (bord droit) : retrouve la bonne colonne en mode colonnes. Absent des emplacements
   * enregistrés avant son ajout : la position horizontale n'est alors pas modifiée.
   */
  x?: number;
}

export function memeEndroit(a: Emplacement, b: Emplacement): boolean {
  return a.docId === b.docId && a.page === b.page && Math.abs(a.fraction - b.fraction) < 0.01;
}

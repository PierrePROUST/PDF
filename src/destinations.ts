/**
 * Résolution des destinations PDF (table des matières et liens internes).
 *
 * Dans la norme PDF, une destination est soit une chaîne (destination nommée, à chercher
 * dans le dictionnaire /Dests du document), soit directement un tableau :
 *   [refPage, {name: "XYZ"}, gauche, haut, zoom], [refPage, {name: "FitH"}, haut], …
 */

/** Sous-ensemble de PDFDocumentProxy utilisé ici (permet de tester sans PDF.js). */
export interface DocumentPourDestinations {
  numPages: number;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: never): Promise<number>;
}

export interface DestinationResolue {
  /** Index de page, à partir de 0. */
  page: number;
  /** Tableau de destination explicite (pour PDFViewer.scrollPageIntoView). */
  destArray: unknown[];
}

export async function resoudreDestination(
  doc: DocumentPourDestinations,
  dest: unknown,
): Promise<DestinationResolue | null> {
  let destArray: unknown;
  if (typeof dest === "string") {
    try {
      destArray = await doc.getDestination(dest);
    } catch {
      return null;
    }
  } else {
    destArray = dest;
  }
  if (!Array.isArray(destArray) || destArray.length === 0) return null;

  const ref = destArray[0];
  let page: number;
  if (Number.isInteger(ref)) {
    // Certains PDF donnent directement un numéro de page (index à partir de 0).
    page = ref as number;
  } else if (ref && typeof ref === "object") {
    try {
      page = await doc.getPageIndex(ref as never);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!(page >= 0 && page < doc.numPages)) return null;
  return { page, destArray };
}

/**
 * Position verticale visée par une destination, en fraction de la page (0 = haut).
 * `vue` est la boîte de la page en unités PDF ([x0, y0, x1, y1], l'axe y monte).
 * Renvoie null quand la destination ne précise pas de hauteur (Fit, XYZ sans « haut », …).
 */
export function fractionDansPage(destArray: unknown[], vue: number[]): number | null {
  const type = (destArray[1] as { name?: string } | undefined)?.name;
  let y: unknown;
  switch (type) {
    case "XYZ":
      y = destArray[3];
      break;
    case "FitH":
    case "FitBH":
      y = destArray[2];
      break;
    case "FitR":
      y = Math.max(Number(destArray[3]), Number(destArray[5]));
      break;
    default:
      return null;
  }
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  const [, y0, , y1] = vue;
  const hauteur = y1 - y0;
  if (!(hauteur > 0)) return null;
  return Math.min(1, Math.max(0, (y1 - y) / hauteur));
}

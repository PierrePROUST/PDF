// Sélection du texte des pages et copie dans le presse-papiers.
//
// PDF.js pose sur chaque page une couche de texte transparente (.textLayer) que le
// navigateur sait sélectionner : appui long sur Android, puis poignées pour étendre.
// Ce module ajoute un bouton « Copier » bien visible tant qu'un texte du PDF est
// sélectionné, en plus du menu natif d'Android.
import { pdfjsLib } from "./pdfjs";

/** Délai avant de cacher le bouton quand la sélection disparaît (ms). Sur Android, toucher
 * le bouton peut effacer la sélection juste avant le « click » : on garde le texte. */
const DELAI_MASQUAGE = 400;

let zoneLecture: HTMLElement | null = null;

/** Texte sélectionné dans les pages du PDF (chaîne vide sinon). */
export function texteSelectionne(): string {
  const sel = document.getSelection();
  if (!zoneLecture || !sel || sel.rangeCount === 0 || sel.isCollapsed) return "";
  for (let i = 0; i < sel.rangeCount; i++) {
    if (sel.getRangeAt(i).intersectsNode(zoneLecture)) return nettoyer(sel.toString());
  }
  return "";
}

/** Vrai si l'utilisateur est en train de sélectionner du texte dans les pages. */
export function selectionEnCours(): boolean {
  return texteSelectionne() !== "";
}

/** Même nettoyage que PDF.js lors d'une copie (ligatures, caractères nuls). */
function nettoyer(texte: string): string {
  return pdfjsLib.normalizeUnicode(texte).replaceAll("\0", "").trim();
}

/** Copie dans le presse-papiers ; repli sur execCommand si l'API Clipboard échoue. */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = document.createElement("textarea");
    zone.value = texte;
    zone.setAttribute("readonly", "");
    zone.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.append(zone);
    zone.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    zone.remove();
    return ok;
  }
}

/**
 * Affiche le bouton « Copier » tant qu'un texte des pages est sélectionné.
 * `avertir` reçoit le message à afficher après la copie.
 */
export function installerCopie(zone: HTMLElement, bouton: HTMLButtonElement, avertir: (message: string) => void): void {
  zoneLecture = zone;
  let dernierTexte = "";
  let minuterie = 0;

  document.addEventListener("selectionchange", () => {
    const texte = texteSelectionne();
    if (texte) {
      clearTimeout(minuterie);
      dernierTexte = texte;
      bouton.hidden = false;
    } else if (!bouton.hidden) {
      clearTimeout(minuterie);
      minuterie = window.setTimeout(() => {
        bouton.hidden = true;
        dernierTexte = "";
      }, DELAI_MASQUAGE);
    }
  });

  // Évite que le bouton prenne le focus et efface la sélection (souris, clavier).
  bouton.addEventListener("mousedown", (ev) => ev.preventDefault());

  bouton.addEventListener("click", async () => {
    const texte = texteSelectionne() || dernierTexte;
    if (!texte) return;
    const ok = await copierTexte(texte);
    clearTimeout(minuterie);
    bouton.hidden = true;
    dernierTexte = "";
    document.getSelection()?.removeAllRanges();
    const n = [...texte].length;
    avertir(ok ? `Texte copié (${n} caractère${n > 1 ? "s" : ""})` : "Copie impossible : utilisez le menu « Copier » d'Android");
  });
}

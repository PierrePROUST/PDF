/**
 * Thème de l'application et des pages PDF : automatique (réglage du téléphone), clair ou sombre.
 *
 * Le choix est gardé dans localStorage (clé préfixée « pdfapp- », l'origine étant partagée
 * avec d'autres PWA) : il doit être lu dès le chargement d'index.html, avant le module
 * principal, pour éviter un flash blanc. Le script classique d'index.html applique déjà
 * l'attribut data-theme ; ce module gère les boutons et la couleur de la barre système.
 */

export type Theme = "auto" | "clair" | "sombre";

const CLE = "pdfapp-theme";
const ORDRE: Theme[] = ["auto", "clair", "sombre"];
const LIBELLES: Record<Theme, string> = {
  auto: "Thème : automatique (réglage du téléphone)",
  clair: "Thème : clair",
  sombre: "Thème : sombre (pages PDF assombries)",
};
/** Couleur de la barre d'état Android (= couleur de la barre supérieure). */
const COULEUR_BARRE = { clair: "#1f2933", sombre: "#0f1419" };

const requeteSombre = window.matchMedia("(prefers-color-scheme: dark)");

export function lireTheme(): Theme {
  try {
    const v = localStorage.getItem(CLE);
    if (v === "clair" || v === "sombre") return v;
  } catch {
    // Stockage inaccessible : thème automatique.
  }
  return "auto";
}

function ecrireTheme(t: Theme): void {
  try {
    if (t === "auto") localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, t);
  } catch {
    // Choix non mémorisé, mais appliqué pour cette session.
  }
}

/** Le thème sombre est-il effectivement affiché ? */
export function themeSombreActif(t: Theme = lireTheme()): boolean {
  return t === "sombre" || (t === "auto" && requeteSombre.matches);
}

function appliquer(t: Theme, boutons: HTMLButtonElement[]): void {
  const racine = document.documentElement;
  if (t === "auto") racine.removeAttribute("data-theme");
  else racine.dataset.theme = t;
  const sombre = themeSombreActif(t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sombre ? COULEUR_BARRE.sombre : COULEUR_BARRE.clair);
  for (const b of boutons) {
    b.dataset.theme = t;
    b.setAttribute("aria-label", LIBELLES[t]);
    b.title = LIBELLES[t];
  }
}

/**
 * Branche les boutons de thème : chaque toucher passe à automatique → clair → sombre.
 * Renvoie le libellé du nouveau thème via `surChangement` (pour un message bref).
 */
export function installerTheme(boutons: HTMLButtonElement[], surChangement?: (libelle: string) => void): void {
  let theme = lireTheme();
  appliquer(theme, boutons);
  for (const b of boutons) {
    b.addEventListener("click", () => {
      theme = ORDRE[(ORDRE.indexOf(theme) + 1) % ORDRE.length];
      ecrireTheme(theme);
      appliquer(theme, boutons);
      surChangement?.(LIBELLES[theme]);
    });
  }
  // Thème automatique : suivre le téléphone s'il change pendant l'utilisation.
  requeteSombre.addEventListener("change", () => appliquer(theme, boutons));
}

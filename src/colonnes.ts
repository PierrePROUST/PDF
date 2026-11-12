/**
 * Détection des colonnes de texte d'une page, à partir des positions des morceaux de texte
 * fournis par PDF.js (page.getTextContent()).
 *
 * Toutes les coordonnées sont des fractions de la page : x de 0 (bord gauche) à 1 (bord
 * droit), y de 0 (haut) à 1 (bas). Fonction pure, sans PDF.js : testée unitairement.
 */

export interface MorceauTexte {
  /** Bord gauche. */
  x: number;
  /** Largeur. */
  largeur: number;
  /** Haut. */
  y: number;
  /** Hauteur. */
  hauteur: number;
  /** Poids (nombre de caractères). */
  poids: number;
}

export interface Colonne {
  x0: number;
  x1: number;
  /** Haut du texte de la colonne. */
  y0: number;
  /** Bas du texte de la colonne. */
  y1: number;
}

/** Morceaux plus larges que ceci (titres, légendes pleine largeur) : ignorés pour la détection. */
const LARGEUR_MAX_MORCEAU = 0.55;
/** En dessous de ce nombre de caractères, la page n'a pas assez de texte pour décider. */
const POIDS_MIN = 200;
/** Part maximale du texte qui peut traverser la gouttière. */
const TRAVERSEE_MAX = 0.04;
/** Part minimale du texte de chaque côté de la gouttière. */
const PART_MIN_COLONNE = 0.2;

function centile(valeurs: number[], p: number): number {
  const tri = [...valeurs].sort((a, b) => a - b);
  return tri[Math.min(tri.length - 1, Math.max(0, Math.round(p * (tri.length - 1))))];
}

function colonneDe(morceaux: MorceauTexte[]): Colonne {
  return {
    // Centiles plutôt que min/max : un numéro de page ou un caractère isolé ne doit pas élargir la colonne.
    x0: centile(morceaux.map((m) => m.x), 0.02),
    x1: centile(morceaux.map((m) => m.x + m.largeur), 0.98),
    y0: Math.min(...morceaux.map((m) => m.y)),
    y1: Math.max(...morceaux.map((m) => m.y + m.hauteur)),
  };
}

/**
 * Renvoie [colonne gauche, colonne droite] si la page est en deux colonnes, sinon null.
 * Principe : chercher, dans la zone centrale (30 % à 70 % de la largeur), une ligne verticale
 * que presque aucun texte ne traverse, avec assez de texte de part et d'autre.
 */
export function detecterColonnes(tous: MorceauTexte[]): [Colonne, Colonne] | null {
  const morceaux = tous.filter(
    (m) => m.poids > 0 && m.largeur > 0 && m.largeur <= LARGEUR_MAX_MORCEAU && m.x >= -0.05 && m.x + m.largeur <= 1.05,
  );
  const total = morceaux.reduce((s, m) => s + m.poids, 0);
  if (total < POIDS_MIN) return null;

  // Poids du texte qui traverse chaque position candidate de la gouttière.
  const candidats: { s: number; traversee: number }[] = [];
  for (let s = 0.3; s <= 0.7001; s += 0.005) {
    let traversee = 0;
    for (const m of morceaux) if (m.x < s && m.x + m.largeur > s) traversee += m.poids;
    candidats.push({ s, traversee });
  }
  const minimum = Math.min(...candidats.map((c) => c.traversee));
  if (minimum / total > TRAVERSEE_MAX) return null;
  // Milieu du plateau de traversée minimale : position la plus sûre de la gouttière.
  const plateau = candidats.filter((c) => c.traversee === minimum).map((c) => c.s);
  const s = (plateau[0] + plateau[plateau.length - 1]) / 2;

  const gauche = morceaux.filter((m) => m.x + m.largeur / 2 < s);
  const droite = morceaux.filter((m) => m.x + m.largeur / 2 >= s);
  const poids = (l: MorceauTexte[]) => l.reduce((t, m) => t + m.poids, 0);
  if (poids(gauche) < PART_MIN_COLONNE * total || poids(droite) < PART_MIN_COLONNE * total) return null;

  const g = colonneDe(gauche);
  const d = colonneDe(droite);
  // Il faut une vraie gouttière entre les deux colonnes.
  if (d.x0 - g.x1 < 0.01) return null;
  return [g, d];
}

/** Colonne contenant (ou la plus proche de) la position horizontale x. */
export function indexColonne(colonnes: [Colonne, Colonne], x: number): 0 | 1 {
  const separation = (colonnes[0].x1 + colonnes[1].x0) / 2;
  return x < separation ? 0 : 1;
}

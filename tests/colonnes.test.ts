import { describe, expect, it } from "vitest";
import { detecterColonnes, indexColonne, type MorceauTexte } from "../src/colonnes";

/** Lignes de texte d'une colonne : une ligne par morceau, comme le fait souvent PDF.js. */
function lignes(x: number, largeur: number, nb: number, debutY = 0.08): MorceauTexte[] {
  return Array.from({ length: nb }, (_, i) => ({
    x,
    largeur: i % 7 === 6 ? largeur * 0.4 : largeur, // fin de paragraphe plus courte
    y: debutY + i * 0.018,
    hauteur: 0.012,
    poids: 60,
  }));
}

describe("detecterColonnes", () => {
  it("détecte deux colonnes séparées par une gouttière", () => {
    const morceaux = [...lignes(0.07, 0.41, 45), ...lignes(0.52, 0.41, 40)];
    const r = detecterColonnes(morceaux);
    expect(r).not.toBeNull();
    const [g, d] = r!;
    expect(g.x0).toBeCloseTo(0.07, 2);
    expect(g.x1).toBeCloseTo(0.48, 2);
    expect(d.x0).toBeCloseTo(0.52, 2);
    expect(d.x1).toBeCloseTo(0.93, 2);
    expect(g.y0).toBeCloseTo(0.08, 2);
  });

  it("ignore un titre et un pied de page pleine largeur", () => {
    const morceaux = [
      { x: 0.07, largeur: 0.86, y: 0.03, hauteur: 0.02, poids: 40 }, // titre pleine largeur
      ...lignes(0.07, 0.41, 45, 0.08),
      ...lignes(0.52, 0.41, 45, 0.08),
      { x: 0.07, largeur: 0.86, y: 0.95, hauteur: 0.01, poids: 120 }, // mention légale
    ];
    expect(detecterColonnes(morceaux)).not.toBeNull();
  });

  it("répond null pour une page en une seule colonne (lignes entières)", () => {
    expect(detecterColonnes(lignes(0.1, 0.8, 50))).toBeNull();
  });

  it("répond null pour une seule colonne découpée en mots", () => {
    const mots: MorceauTexte[] = [];
    for (let l = 0; l < 50; l++) {
      // Les espaces entre mots tombent à des endroits différents d'une ligne à l'autre.
      for (let x = 0.1 + ((l * 0.037) % 0.07); x < 0.88; x += 0.06 + ((l * 7 + x * 100) % 3) * 0.01) {
        mots.push({ x, largeur: 0.06, y: 0.05 + l * 0.018, hauteur: 0.012, poids: 6 });
      }
    }
    expect(detecterColonnes(mots)).toBeNull();
  });

  it("répond null quand il y a trop peu de texte", () => {
    expect(detecterColonnes([...lignes(0.07, 0.41, 1), ...lignes(0.52, 0.41, 1)])).toBeNull();
    expect(detecterColonnes([])).toBeNull();
  });

  it("répond null quand presque tout le texte est d'un seul côté", () => {
    expect(detecterColonnes([...lignes(0.07, 0.41, 45), ...lignes(0.52, 0.41, 3)])).toBeNull();
  });

  it("tolère quelques morceaux qui débordent sur la gouttière", () => {
    const morceaux = [
      ...lignes(0.07, 0.41, 45),
      ...lignes(0.52, 0.41, 45),
      { x: 0.4, largeur: 0.2, y: 0.5, hauteur: 0.012, poids: 20 },
    ];
    expect(detecterColonnes(morceaux)).not.toBeNull();
  });
});

describe("indexColonne", () => {
  const cols = detecterColonnes([...lignes(0.07, 0.41, 45), ...lignes(0.52, 0.41, 45)])!;
  it("situe une position dans la bonne colonne", () => {
    expect(indexColonne(cols, 0.2)).toBe(0);
    expect(indexColonne(cols, 0.49)).toBe(0);
    expect(indexColonne(cols, 0.51)).toBe(1);
    expect(indexColonne(cols, 0.9)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { Historique } from "../src/historique";

describe("Historique", () => {
  it("est vide au départ", () => {
    const h = new Historique<string>();
    expect(h.peutRetour).toBe(false);
    expect(h.peutAvancer).toBe(false);
    expect(h.profondeur).toBe(0);
    expect(h.retour("ici")).toBeUndefined();
    expect(h.avancer("ici")).toBeUndefined();
    // Un retour impossible ne doit rien empiler.
    expect(h.peutAvancer).toBe(false);
  });

  it("ramène à l'endroit d'origine d'un saut", () => {
    const h = new Historique<string>();
    h.sauter("p10"); // on était en p10, on saute en p50
    expect(h.peutRetour).toBe(true);
    expect(h.precedent).toBe("p10");
    expect(h.retour("p50")).toBe("p10");
    expect(h.peutRetour).toBe(false);
    expect(h.peutAvancer).toBe(true);
  });

  it("empile plusieurs sauts successifs (dernier entré, premier sorti)", () => {
    const h = new Historique<string>();
    h.sauter("A"); // A → B
    h.sauter("B"); // B → C
    h.sauter("C"); // C → D
    expect(h.profondeur).toBe(3);
    expect(h.retour("D")).toBe("C");
    expect(h.retour("C")).toBe("B");
    expect(h.retour("B")).toBe("A");
    expect(h.retour("A")).toBeUndefined();
  });

  it("« Avancer » refait les sauts annulés, avec l'endroit réellement quitté", () => {
    const h = new Historique<string>();
    h.sauter("A");
    h.sauter("B");
    expect(h.retour("C")).toBe("B");
    // Après le retour, l'utilisateur a défilé un peu : il quitte B' et non B.
    expect(h.retour("B'")).toBe("A");
    expect(h.avancer("A")).toBe("B'");
    expect(h.avancer("B'")).toBe("C");
    expect(h.peutAvancer).toBe(false);
    expect(h.retour("C")).toBe("B'");
  });

  it("un nouveau saut après un retour efface la branche « Avancer »", () => {
    const h = new Historique<string>();
    h.sauter("A");
    h.sauter("B");
    h.retour("C");
    expect(h.peutAvancer).toBe(true);
    h.sauter("B"); // nouveau saut depuis B vers X
    expect(h.peutAvancer).toBe(false);
    expect(h.avancer("X")).toBeUndefined();
    expect(h.retour("X")).toBe("B");
    expect(h.retour("B")).toBe("A");
  });

  it("vider() remet tout à zéro", () => {
    const h = new Historique<number>();
    h.sauter(1);
    h.sauter(2);
    h.retour(3);
    h.vider();
    expect(h.peutRetour).toBe(false);
    expect(h.peutAvancer).toBe(false);
    expect(h.profondeur).toBe(0);
  });

  it("fonctionne avec des emplacements (objets)", () => {
    const h = new Historique<{ page: number; fraction: number }>();
    const origine = { page: 3, fraction: 0.42 };
    h.sauter(origine);
    expect(h.retour({ page: 20, fraction: 0 })).toBe(origine);
  });
});

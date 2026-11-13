/**
 * Extracteur de pages : toutes les pages du document en vignettes, avec une case à cocher
 * chacune. Les vignettes ne sont dessinées que lorsqu'elles approchent de l'écran, une à la
 * fois, et sont libérées quand elles s'en éloignent (reste fluide sur 500 pages).
 */
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { el } from "./ui";

interface Vignette {
  canvas: HTMLCanvasElement;
  case: HTMLInputElement;
  visible: boolean;
  dessinee: boolean;
}

export class Extracteur {
  private readonly racine = el("extracteur");
  private readonly grille = el("extraction-grille");
  private readonly valider = el<HTMLButtonElement>("extraction-valider");
  private vignettes: Vignette[] = [];
  private doc: PDFDocumentProxy | null = null;
  private observateur: IntersectionObserver | null = null;
  private file: number[] = [];
  private enCours = false;
  private generation = 0;

  constructor(rappels: { fermer(): void; extraire(indices: number[]): void }) {
    el("extraction-fermer").addEventListener("click", () => rappels.fermer());
    el("extraction-tout").addEventListener("click", () => this.cocherTout(true));
    el("extraction-aucune").addEventListener("click", () => this.cocherTout(false));
    this.valider.addEventListener("click", () => {
      const indices = this.selection();
      if (indices.length) rappels.extraire(indices);
    });
    this.grille.addEventListener("change", () => this.majBouton());
  }

  get ouvert(): boolean {
    return !this.racine.hidden;
  }

  async ouvrir(doc: PDFDocumentProxy): Promise<void> {
    this.fermer();
    const generation = this.generation;
    this.doc = doc;
    this.racine.hidden = false;
    // Proportions de la première page en attendant le dessin de chaque vignette.
    const premiere = (await doc.getPage(1)).getViewport({ scale: 1 });
    if (generation !== this.generation) return;
    this.observateur = new IntersectionObserver((entrees) => this.surIntersection(entrees), {
      root: this.grille,
      rootMargin: "600px 0px",
    });
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < doc.numPages; i++) {
      const etiquette = document.createElement("label");
      etiquette.className = "vignette";
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 0;
      canvas.style.aspectRatio = `${premiere.width} / ${premiere.height}`;
      canvas.dataset.index = String(i);
      const pied = document.createElement("span");
      pied.className = "vignette-pied";
      const coche = document.createElement("input");
      coche.type = "checkbox";
      coche.setAttribute("aria-label", `Page ${i + 1}`);
      pied.append(coche, String(i + 1));
      etiquette.append(canvas, pied);
      fragment.append(etiquette);
      this.vignettes.push({ canvas, case: coche, visible: false, dessinee: false });
      this.observateur.observe(canvas);
    }
    this.grille.append(fragment);
    this.grille.scrollTop = 0;
    this.majBouton();
  }

  fermer(): void {
    this.generation++;
    this.observateur?.disconnect();
    this.observateur = null;
    this.doc = null;
    this.file = [];
    for (const v of this.vignettes) v.canvas.width = v.canvas.height = 0;
    this.vignettes = [];
    this.grille.replaceChildren();
    this.racine.hidden = true;
    this.occupe(false);
  }

  /** Bloque les commandes pendant la fabrication du PDF. */
  occupe(occupe: boolean): void {
    this.racine.classList.toggle("occupe", occupe);
    if (!occupe) this.majBouton();
    else {
      this.valider.disabled = true;
      this.valider.textContent = "Extraction en cours…";
    }
  }

  /** Index (à partir de 0) des pages cochées, dans l'ordre du document. */
  selection(): number[] {
    return this.vignettes.flatMap((v, i) => (v.case.checked ? [i] : []));
  }

  private cocherTout(coche: boolean): void {
    for (const v of this.vignettes) v.case.checked = coche;
    this.majBouton();
  }

  private majBouton(): void {
    const n = this.selection().length;
    this.valider.disabled = n === 0;
    this.valider.textContent = n === 0 ? "Cochez des pages" : n === 1 ? "Extraire 1 page" : `Extraire ${n} pages`;
  }

  private surIntersection(entrees: IntersectionObserverEntry[]): void {
    for (const e of entrees) {
      const index = Number((e.target as HTMLElement).dataset.index);
      const v = this.vignettes[index];
      if (!v) continue;
      v.visible = e.isIntersecting;
      if (v.visible && !v.dessinee) this.file.push(index);
      else if (!v.visible && v.dessinee) {
        // Loin de l'écran : on rend la mémoire, la vignette sera redessinée au besoin.
        v.canvas.width = v.canvas.height = 0;
        v.dessinee = false;
      }
    }
    void this.dessinerSuivantes();
  }

  private async dessinerSuivantes(): Promise<void> {
    if (this.enCours) return;
    this.enCours = true;
    try {
      while (this.file.length) {
        const generation = this.generation;
        const index = this.file.shift()!;
        const v = this.vignettes[index];
        const doc = this.doc;
        if (!v || !doc || !v.visible || v.dessinee) continue;
        try {
          const page = await doc.getPage(index + 1);
          if (generation !== this.generation) continue;
          const base = page.getViewport({ scale: 1 });
          const largeur = Math.max(80, v.canvas.clientWidth) * Math.min(window.devicePixelRatio || 1, 1.5);
          const viewport = page.getViewport({ scale: largeur / base.width });
          v.canvas.style.aspectRatio = `${base.width} / ${base.height}`;
          v.canvas.width = Math.round(viewport.width);
          v.canvas.height = Math.round(viewport.height);
          v.dessinee = true;
          await page.render({ canvas: v.canvas, viewport }).promise;
        } catch (e) {
          console.warn("Vignette impossible, page", index + 1, e);
        }
      }
    } finally {
      this.enCours = false;
    }
  }
}

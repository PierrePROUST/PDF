/**
 * Mode « lecture en colonnes » pour les PDF en deux colonnes (règles de jeu, articles…).
 *
 * - Zoom pour qu'une colonne occupe la largeur de l'écran ; le pincement reste possible pour
 *   grossir ou réduire à l'intérieur de la colonne en cours.
 * - Ordre de lecture : colonne gauche → colonne droite → colonne gauche de la page suivante.
 *   En défilant, arriver en bas d'une colonne amène en haut de la suivante (et en haut d'une
 *   colonne, en bas de la précédente) : on ne change jamais de page en restant du même côté.
 * - Balayage horizontal : colonne suivante / précédente (sauf quand la colonne est grossie
 *   au-delà de la largeur de l'écran : le doigt sert alors à se déplacer dans la colonne).
 * - Les colonnes sont détectées à partir des positions du texte (page.getTextContent()).
 *   Page sans colonnes détectées (figure, tableau pleine largeur) : on la parcourt en deux
 *   moitiés gauche / droite.
 * - Passer d'une colonne à l'autre n'est pas un « saut » : rien n'est ajouté à l'historique.
 */
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { detecterColonnes, indexColonne, sortieDeColonne, type Colonne, type MorceauTexte } from "./colonnes";
import { pdfjsLib } from "./pdfjs";
import type { Visionneuse } from "./visionneuse";

type Paire = [Colonne, Colonne];

/** Marge visible autour de la colonne (px CSS). */
const MARGE = 6;
/** Nombre de pages examinées pour décider si le document est en deux colonnes. */
const PAGES_ECHANTILLON = 8;
/** Balayage : déplacement horizontal minimal (px) et durée maximale (ms). */
const BALAYAGE_MIN = 60;
const BALAYAGE_DUREE_MAX = 700;

const MOITIES: Paire = [
  { x0: 0, x1: 0.5, y0: 0, y1: 1 },
  { x0: 0.5, x1: 1, y0: 0, y1: 1 },
];

export interface AnalyseDocument {
  deuxColonnes: boolean;
  /** Largeur typique d'une colonne, en points PDF (pour le zoom). */
  largeurColonne: number | null;
}

export class ModeColonnes {
  actif = false;
  private doc: PDFDocumentProxy | null = null;
  private cache = new Map<number, Promise<Paire | null>>();
  private largeurColonne: number | null = null;
  private generation = 0;
  /** Échelle pour laquelle une colonne occupe exactement la largeur de l'écran. */
  private zoomAjuste: number | null = null;
  /** Dernière position verticale connue (null = à ne pas comparer : zoom, placement). */
  private dernierHaut: number | null = null;
  private pincement = false;
  private transition = false;
  private largeurEcran = 0;

  constructor(
    private readonly vision: Visionneuse,
    private readonly rappels: { surChangement(actif: boolean): void },
  ) {
    this.installerBalayage();
    this.installerEnchainement();
    this.largeurEcran = vision.conteneur.clientWidth;
    window.addEventListener("resize", () => {
      const largeur = this.vision.conteneur.clientWidth;
      // Clavier qui s'ouvre, barre d'adresse : la largeur ne change pas, on ne touche à rien.
      if (largeur === this.largeurEcran) return;
      this.largeurEcran = largeur;
      if (!this.actif) return;
      // Zoom choisi au pincement : on le garde ; sinon la colonne suit la nouvelle largeur.
      const personnalise = this.zoomAjuste !== null && Math.abs(this.vision.vue.currentScale / this.zoomAjuste - 1) > 0.02;
      this.zoomAjuste = null;
      void (personnalise ? this.calculerZoomAjuste().then(() => this.majColonneLarge()) : this.ajusterZoom()).then(() =>
        this.recaler(),
      );
    });
    vision.bus.on("scalechanging", () => {
      this.dernierHaut = null;
    });
  }

  /** Nouveau document : oublie les colonnes du précédent et quitte le mode. */
  reinitialiser(doc: PDFDocumentProxy | null): void {
    this.generation++;
    this.doc = doc;
    this.cache.clear();
    this.largeurColonne = null;
    this.zoomAjuste = null;
    this.dernierHaut = null;
    this.basculerAffichage(false);
  }

  /** Colonnes d'une page (index à partir de 0), ou null si elle n'est pas en deux colonnes. */
  colonnes(page: number): Promise<Paire | null> {
    let p = this.cache.get(page);
    if (!p) {
      p = this.calculerColonnes(page).catch((e) => {
        console.warn("Détection des colonnes impossible, page", page + 1, e);
        return null;
      });
      this.cache.set(page, p);
    }
    return p;
  }

  private async calculerColonnes(page: number): Promise<Paire | null> {
    const doc = this.doc;
    if (!doc) return null;
    const p = await doc.getPage(page + 1);
    if (p.rotate % 180 !== 0) return null;
    const [vx0, vy0, vx1, vy1] = p.view;
    const l = vx1 - vx0;
    const h = vy1 - vy0;
    const contenu = await p.getTextContent();
    const morceaux: MorceauTexte[] = [];
    for (const item of contenu.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , e, f] = item.transform as number[];
      morceaux.push({
        x: (e - vx0) / l,
        largeur: item.width / l,
        y: (vy1 - (f + item.height)) / h,
        hauteur: item.height / h,
        poids: item.str.trim().length,
      });
    }
    return detecterColonnes(morceaux);
  }

  /** Examine quelques pages réparties dans le document. */
  async analyser(doc: PDFDocumentProxy): Promise<AnalyseDocument> {
    const n = doc.numPages;
    const indices = new Set<number>();
    // On évite la couverture et les premières pages (sommaire…) quand le document est assez long.
    const debut = n > 6 ? 2 : 0;
    for (let k = 0; k < PAGES_ECHANTILLON; k++) {
      indices.add(Math.min(n - 1, debut + Math.floor(((n - debut) * k) / PAGES_ECHANTILLON)));
    }
    let avecTexte = 0;
    const largeurs: number[] = [];
    for (const i of indices) {
      if (doc !== this.doc) break;
      const cols = await this.colonnes(i);
      const vue = (await doc.getPage(i + 1)).view;
      if (cols) {
        avecTexte++;
        largeurs.push(Math.max(cols[0].x1 - cols[0].x0, cols[1].x1 - cols[1].x0) * (vue[2] - vue[0]));
      } else {
        // Une page sans texte (image) ne compte ni pour ni contre.
        const contenu = await (await doc.getPage(i + 1)).getTextContent();
        if (contenu.items.some((it) => "str" in it && it.str.trim())) avecTexte++;
      }
    }
    largeurs.sort((a, b) => a - b);
    const largeurColonne = largeurs.length ? largeurs[Math.floor(largeurs.length / 2)] : null;
    if (doc === this.doc) this.largeurColonne = largeurColonne;
    return { deuxColonnes: avecTexte > 0 && largeurs.length >= Math.max(1, avecTexte / 2), largeurColonne };
  }

  /**
   * Active le mode. Avec `recadrer`, zoome sur la largeur d'une colonne et se place sur la
   * colonne la plus proche ; sans, garde la position (par exemple une reprise de lecture
   * déjà enregistrée en mode colonnes).
   */
  async activer(recadrer: boolean): Promise<void> {
    if (!this.doc) return;
    const generation = this.generation;
    if (this.largeurColonne === null) await this.analyser(this.doc);
    if (generation !== this.generation) return;
    this.basculerAffichage(true);
    if (recadrer) {
      await this.ajusterZoom();
      await this.recaler();
    } else {
      await this.calculerZoomAjuste();
      this.majColonneLarge();
    }
  }

  desactiver(): void {
    if (!this.actif) return;
    this.basculerAffichage(false);
    this.vision.vue.currentScaleValue = "page-width";
  }

  private basculerAffichage(actif: boolean): void {
    const change = actif !== this.actif;
    this.actif = actif;
    this.vision.conteneur.classList.toggle("mode-colonnes", actif);
    if (!actif) this.vision.conteneur.classList.remove("colonne-large");
    this.dernierHaut = null;
    if (change) this.rappels.surChangement(actif);
  }

  /** Échelle pour laquelle une colonne typique occupe la largeur de l'écran. */
  private async calculerZoomAjuste(): Promise<number | null> {
    if (!this.largeurColonne) {
      // Aucune colonne détectée : moitié de la largeur de la page courante.
      const page = await this.doc?.getPage(this.pageAuCentre() + 1);
      if (!page) return null;
      this.largeurColonne = (page.view[2] - page.view[0]) / 2;
    }
    const largeurEcran = this.vision.conteneur.clientWidth - 2 * MARGE;
    const echelle = largeurEcran / (this.largeurColonne * pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS);
    this.zoomAjuste = Math.min(6, Math.max(0.25, echelle));
    return this.zoomAjuste;
  }

  /** Zoom pour qu'une colonne typique occupe la largeur de l'écran. */
  private async ajusterZoom(): Promise<void> {
    const zoom = await this.calculerZoomAjuste();
    if (zoom === null) return;
    const emp = this.vision.emplacement();
    this.vision.allerA({ ...emp, zoom, x: undefined });
    this.majColonneLarge();
  }

  /** Vrai si la colonne est grossie au-delà de la largeur de l'écran (zoom au pincement). */
  private colonneLarge(): boolean {
    return this.actif && this.zoomAjuste !== null && this.vision.vue.currentScale > this.zoomAjuste * 1.02;
  }

  /** Colonne plus large que l'écran : le défilement horizontal au doigt est autorisé. */
  private majColonneLarge(): void {
    this.vision.conteneur.classList.toggle("colonne-large", this.colonneLarge());
  }

  private pageAuCentre(): number {
    const c = this.vision.conteneur;
    return this.vision.pageALaHauteur(c.scrollTop + c.clientHeight / 2);
  }

  /** Position horizontale du centre de l'écran, en fraction de la largeur de la page. */
  private xCentre(page: number): number {
    const div = this.vision.divPage(page);
    const c = this.vision.conteneur;
    return (c.scrollLeft + c.clientWidth / 2 - div.offsetLeft - div.clientLeft) / div.clientWidth;
  }

  private async colonnesOuMoities(page: number): Promise<Paire> {
    return (await this.colonnes(page)) ?? MOITIES;
  }

  /** Place l'écran sur une colonne : en haut, ou bas de colonne en bas de l'écran. */
  private placer(page: number, colonnes: Paire, index: 0 | 1, alignement: "haut" | "bas" | "horizontal"): void {
    const div = this.vision.divPage(page);
    const c = this.vision.conteneur;
    const gauche = div.offsetLeft + div.clientLeft;
    const haut = div.offsetTop + div.clientTop;
    const col = colonnes[index];
    const xCol = gauche + col.x0 * div.clientWidth;
    const largeurCol = (col.x1 - col.x0) * div.clientWidth;
    c.scrollLeft = largeurCol <= c.clientWidth - 2 * MARGE ? xCol - (c.clientWidth - largeurCol) / 2 : xCol - MARGE;
    if (alignement === "horizontal") return;
    const yHaut = haut + col.y0 * div.clientHeight - MARGE;
    const yBas = haut + col.y1 * div.clientHeight + MARGE - c.clientHeight;
    c.scrollTop = alignement === "bas" && yBas > yHaut ? yBas : yHaut;
    this.dernierHaut = c.scrollTop;
  }

  /**
   * Enchaînement des colonnes au défilement : en bas d'une colonne, on arrive en haut de la
   * suivante ; en haut d'une colonne, en bas de la précédente.
   */
  private installerEnchainement(): void {
    const c = this.vision.conteneur;
    c.addEventListener(
      "scroll",
      () => {
        const haut = c.scrollTop;
        const avant = this.dernierHaut;
        this.dernierHaut = haut;
        if (!this.actif || !this.doc || avant === null || this.pincement || this.transition) return;
        const delta = haut - avant;
        // Un grand déplacement d'un coup est un saut (lien, signet, retour), pas un défilement.
        if (delta === 0 || Math.abs(delta) > c.clientHeight) return;
        void this.enchainer(this.vision.pageALaHauteur(avant + c.clientHeight / 2), delta > 0 ? 1 : -1);
      },
      { passive: true },
    );
  }

  private async enchainer(page: number, sens: 1 | -1): Promise<void> {
    const c = this.vision.conteneur;
    const generation = this.generation;
    this.transition = true;
    try {
      const colonnes = await this.colonnesOuMoities(page);
      if (generation !== this.generation || !this.actif) return;
      const div = this.vision.divPage(page);
      // Page entière visible à l'écran (zoom très réduit) : rien à enchaîner.
      if (div.clientHeight <= c.clientHeight) return;
      const index = indexColonne(colonnes, this.xCentre(page));
      const sortie = sortieDeColonne(
        colonnes[index],
        div.offsetTop + div.clientTop,
        div.clientHeight,
        c.scrollTop,
        c.clientHeight,
        sens,
      );
      if (!sortie) return;
      const pageCible = sens === 1 ? (index === 0 ? page : page + 1) : index === 1 ? page : page - 1;
      if (pageCible < 0 || pageCible >= this.vision.nbPages) return;
      // Arrête l'élan du défilement, sinon il continuerait dans la nouvelle colonne.
      c.style.overflow = "hidden";
      try {
        const cible = pageCible === page ? colonnes : await this.colonnesOuMoities(pageCible);
        if (generation !== this.generation || !this.actif) return;
        this.placer(pageCible, cible, index === 0 ? 1 : 0, sens === 1 ? "haut" : "bas");
      } finally {
        requestAnimationFrame(() => {
          c.style.overflow = "";
          this.dernierHaut = c.scrollTop;
        });
      }
    } finally {
      this.transition = false;
    }
  }

  /** Colonne suivante (sens 1) ou précédente (sens -1). */
  async aller(sens: 1 | -1): Promise<void> {
    if (!this.actif || !this.doc) return;
    const page = this.pageAuCentre();
    const colonnes = await this.colonnesOuMoities(page);
    const index = indexColonne(colonnes, this.xCentre(page));
    if (sens === 1) {
      if (index === 0) this.placer(page, colonnes, 1, "haut");
      else if (page + 1 < this.vision.nbPages) this.placer(page + 1, await this.colonnesOuMoities(page + 1), 0, "haut");
    } else {
      if (index === 1) this.placer(page, colonnes, 0, "bas");
      else if (page > 0) this.placer(page - 1, await this.colonnesOuMoities(page - 1), 1, "bas");
    }
  }

  /** Aligne horizontalement sur la colonne la plus proche, sans changer la hauteur. */
  async recaler(): Promise<void> {
    if (!this.actif || !this.vision.nbPages) return;
    const page = this.pageAuCentre();
    const colonnes = await this.colonnesOuMoities(page);
    this.placer(page, colonnes, indexColonne(colonnes, this.xCentre(page)), "horizontal");
  }

  /** Balayage horizontal à un doigt = colonne suivante / précédente. */
  private installerBalayage(): void {
    const c = this.vision.conteneur;
    let depart: { x: number; y: number; t: number } | null = null;
    c.addEventListener(
      "touchstart",
      (ev) => {
        depart = ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() } : null;
        if (ev.touches.length >= 2) this.pincement = true;
      },
      { passive: true },
    );
    c.addEventListener("touchmove", (ev) => {
      if (ev.touches.length !== 1) depart = null;
    }, { passive: true });
    c.addEventListener(
      "touchend",
      (ev) => {
        if (this.pincement) {
          depart = null;
          if (ev.touches.length > 0) return;
          // Fin d'un zoom au pincement : on reste dans la colonne en cours.
          this.pincement = false;
          this.dernierHaut = null;
          if (!this.actif) return;
          this.majColonneLarge();
          if (!this.colonneLarge()) void this.recaler();
          return;
        }
        // Colonne grossie : le déplacement horizontal du doigt fait défiler, pas changer de colonne.
        if (!this.actif || !depart || ev.changedTouches.length !== 1 || this.colonneLarge()) return;
        const dx = ev.changedTouches[0].clientX - depart.x;
        const dy = ev.changedTouches[0].clientY - depart.y;
        const rapide = Date.now() - depart.t < BALAYAGE_DUREE_MAX;
        depart = null;
        if (rapide && Math.abs(dx) > BALAYAGE_MIN && Math.abs(dx) > 2 * Math.abs(dy)) void this.aller(dx < 0 ? 1 : -1);
      },
      { passive: true },
    );
    c.addEventListener("touchcancel", (ev) => {
      depart = null;
      if (ev.touches.length === 0) this.pincement = false;
    }, { passive: true });
  }
}

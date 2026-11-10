import { chargerDocument } from "./pdfjs";
import { EventBus, LinkTarget, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { resoudreDestination } from "./destinations";
import type { Emplacement } from "./emplacement";

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
/** Délai avant de redessiner nettement les pages pendant un pincement (ms). */
const DELAI_RENDU_PINCEMENT = 400;

/**
 * Service de liens qui fait passer TOUS les sauts internes (liens du PDF, table des
 * matières, numéro de page) par un point unique, pour mémoriser l'emplacement d'origine.
 */
class ServiceLiens extends PDFLinkService {
  /** Appelé juste avant un saut, quand la destination est valide. */
  avantSaut: () => void = () => {};

  override async goToDestination(dest: string | unknown[]): Promise<void> {
    const doc = this.pdfDocument as PDFDocumentProxy | null;
    if (!doc) return;
    const cible = await resoudreDestination(doc, dest);
    if (!cible) {
      console.warn("Destination introuvable :", dest);
      return;
    }
    this.avantSaut();
    this.pdfViewer.scrollPageIntoView({
      pageNumber: cible.page + 1,
      destArray: cible.destArray,
      // Sur téléphone, on garde le zoom choisi par l'utilisateur.
      ignoreDestinationZoom: true,
    });
  }

  override goToPage(val: number | string): void {
    const n = typeof val === "string" ? parseInt(val, 10) : val;
    if (!(Number.isInteger(n) && n >= 1 && n <= this.pagesCount)) return;
    this.avantSaut();
    this.pdfViewer.scrollPageIntoView({ pageNumber: n });
  }
}

export interface RappelsVisionneuse {
  /** Juste avant un saut : l'emplacement courant est encore celui d'origine. */
  avantSaut(): void;
  /** Après tout défilement, zoom ou changement de page. */
  surDeplacement(): void;
}

export class Visionneuse {
  readonly bus = new EventBus();
  readonly liens: ServiceLiens;
  readonly vue: PDFViewer;
  document: PDFDocumentProxy | null = null;
  docId = "";

  constructor(
    private readonly conteneur: HTMLDivElement,
    visionneuse: HTMLDivElement,
    rappels: RappelsVisionneuse,
  ) {
    this.liens = new ServiceLiens({
      eventBus: this.bus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: "noopener noreferrer",
    });
    this.liens.avantSaut = () => rappels.avantSaut();
    this.vue = new PDFViewer({
      container: conteneur,
      viewer: visionneuse,
      eventBus: this.bus,
      linkService: this.liens,
      // Pas d'éditeur d'annotations (hors périmètre V1).
      annotationEditorMode: -1,
    });
    this.liens.setViewer(this.vue);
    this.bus.on("updateviewarea", () => rappels.surDeplacement());
    this.bus.on("pagechanging", () => rappels.surDeplacement());
    this.installerPincement();
  }

  get nbPages(): number {
    return this.document?.numPages ?? 0;
  }

  /** Numéro de la page la plus visible (à partir de 1). */
  get pageCourante(): number {
    return this.vue.currentPageNumber;
  }

  async ouvrir(donnees: Uint8Array<ArrayBuffer>, docId: string, depart?: Emplacement): Promise<PDFDocumentProxy> {
    await this.fermer();
    const doc = await chargerDocument(donnees).promise;
    this.document = doc;
    this.docId = docId;
    const pret = new Promise<void>((resolve) => this.bus.on("pagesinit", () => resolve(), { once: true }));
    this.vue.setDocument(doc);
    this.liens.setDocument(doc, null);
    await pret;
    this.vue.currentScaleValue = "page-width";
    if (depart && depart.docId === docId) this.allerA(depart);
    return doc;
  }

  async fermer(): Promise<void> {
    const doc = this.document;
    this.document = null;
    this.docId = "";
    this.vue.setDocument(null);
    this.liens.setDocument(null, null);
    if (doc) await doc.loadingTask.destroy();
  }

  /** Emplacement actuel : page en haut de l'écran et décalage dans cette page. */
  emplacement(): Emplacement {
    const haut = this.conteneur.scrollTop;
    const page = this.pageA(haut);
    const div = this.nbPages > 0 ? this.divPage(page) : null;
    const fraction = div && div.offsetHeight > 0 ? (haut - div.offsetTop) / div.offsetHeight : 0;
    return {
      docId: this.docId,
      page,
      fraction: Math.min(1, Math.max(0, fraction)),
      zoom: this.vue.currentScale,
    };
  }

  /**
   * Numéro (à partir de 1) de la page en cours de lecture : celle qui se trouve au quart
   * supérieur de l'écran. Plus intuitif que la « page la plus visible » de PDF.js juste
   * après un saut vers le milieu d'une page.
   */
  pageLue(): number {
    if (!this.nbPages) return 0;
    return this.pageA(this.conteneur.scrollTop + this.conteneur.clientHeight / 4) + 1;
  }

  /** Index de la dernière page dont le haut est au-dessus de la position y (recherche dichotomique). */
  private pageA(y: number): number {
    let bas = 0;
    let fin = this.nbPages - 1;
    while (bas < fin) {
      const milieu = (bas + fin + 1) >> 1;
      if (this.divPage(milieu).offsetTop <= y) bas = milieu;
      else fin = milieu - 1;
    }
    return Math.max(0, bas);
  }

  /** Replace l'écran exactement sur un emplacement (même page, même hauteur, même zoom). */
  allerA(e: Emplacement): void {
    if (!this.document || e.page < 0 || e.page >= this.nbPages) return;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, e.zoom));
    if (Math.abs(this.vue.currentScale - zoom) > 0.001) this.vue.currentScale = zoom;
    const placer = () => {
      const div = this.divPage(e.page);
      this.conteneur.scrollTop = div.offsetTop + e.fraction * div.offsetHeight;
    };
    placer();
    // Le changement d'échelle peut repositionner la vue au prochain cadre : on recale.
    requestAnimationFrame(placer);
  }

  /** Saut vers une destination PDF (chaîne ou tableau) ; passe par l'historique. */
  sauterDestination(dest: string | unknown[]): Promise<void> {
    return this.liens.goToDestination(dest);
  }

  /** Saut vers un emplacement enregistré (signet) ; passe par l'historique. */
  sauterEmplacement(e: Emplacement): void {
    if (!this.document || e.docId !== this.docId) return;
    this.liens.avantSaut();
    this.allerA(e);
  }

  /** Saut vers un numéro de page (à partir de 1) ; passe par l'historique. */
  sauterPage(numero: number): void {
    this.liens.goToPage(numero);
  }

  private divPage(index: number): HTMLDivElement {
    return this.vue.getPageView(index).div as HTMLDivElement;
  }

  /**
   * Zoom par pincement à deux doigts. PDF.js met d'abord les pages à l'échelle en CSS
   * (immédiat), puis les redessine nettement après DELAI_RENDU_PINCEMENT.
   */
  private installerPincement(): void {
    let distancePrecedente = 0;
    let facteurEnAttente = 1;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    this.conteneur.addEventListener(
      "touchstart",
      (ev) => {
        if (ev.touches.length === 2) {
          distancePrecedente = distance(ev.touches);
          facteurEnAttente = 1;
        }
      },
      { passive: true },
    );
    this.conteneur.addEventListener(
      "touchmove",
      (ev) => {
        if (ev.touches.length !== 2 || !this.document || distancePrecedente === 0) return;
        ev.preventDefault();
        const d = distance(ev.touches);
        facteurEnAttente *= d / distancePrecedente;
        distancePrecedente = d;
        const echelle = this.vue.currentScale;
        const cible = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, echelle * facteurEnAttente));
        // PDF.js arrondit l'échelle au centième : on accumule les petits mouvements.
        if (Math.abs(cible - echelle) < 0.01) return;
        const origine: [number, number] = [
          (ev.touches[0].clientX + ev.touches[1].clientX) / 2,
          (ev.touches[0].clientY + ev.touches[1].clientY) / 2,
        ];
        this.vue.updateScale({ drawingDelay: DELAI_RENDU_PINCEMENT, scaleFactor: cible / echelle, origin: origine });
        facteurEnAttente = 1;
      },
      { passive: false },
    );
    const fin = (ev: TouchEvent) => {
      if (ev.touches.length < 2) distancePrecedente = 0;
    };
    this.conteneur.addEventListener("touchend", fin, { passive: true });
    this.conteneur.addEventListener("touchcancel", fin, { passive: true });
  }
}

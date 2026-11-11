import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fractionDansPage, resoudreDestination } from "./destinations";
import type { Emplacement } from "./emplacement";

type NoeudPdf = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

interface Entree {
  titre: string;
  noeud: NoeudPdf;
  niveau: number;
  parent: Entree | null;
  /** Index de page (0…) une fois la destination résolue ; null si inconnue ou lien externe. */
  page: number | null;
  /** Hauteur visée dans la page (0 = haut). */
  fraction: number;
  ligne: HTMLDivElement;
  sousListe: HTMLUListElement | null;
  bouton: HTMLButtonElement | null;
}

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6-1.4-1.4 4.6-4.6-4.6-4.6z"/></svg>';

/** Panneau « Table des matières » : arbre dépliable construit depuis getOutline(). */
export class TableDesMatieres {
  private entrees: Entree[] = [];
  /** Entrées triées par position dans le document (pour trouver la section courante). */
  private ordonnees: Entree[] = [];
  private courante: Entree | null = null;
  private generation = 0;

  constructor(
    private readonly racine: HTMLElement,
    private readonly rappels: {
      sauter(dest: string | unknown[]): void;
      ouvrirUrl(url: string): void;
    },
  ) {}

  vider(): void {
    this.generation++;
    this.entrees = [];
    this.ordonnees = [];
    this.courante = null;
    this.racine.replaceChildren();
  }

  async charger(doc: PDFDocumentProxy): Promise<void> {
    this.vider();
    const generation = this.generation;
    const arbre = await doc.getOutline().catch(() => null);
    if (generation !== this.generation) return;
    if (!arbre || arbre.length === 0) {
      const p = document.createElement("p");
      p.className = "vide";
      p.textContent = "Ce PDF ne contient pas de table des matières.";
      this.racine.append(p);
      return;
    }
    this.racine.append(this.construireListe(arbre, 0, null));
    await this.resoudrePages(doc, generation);
  }

  private construireListe(noeuds: NoeudPdf[], niveau: number, parent: Entree | null): HTMLUListElement {
    const ul = document.createElement("ul");
    ul.className = "tdm-liste";
    ul.setAttribute("role", niveau === 0 ? "tree" : "group");
    for (const noeud of noeuds) {
      const li = document.createElement("li");
      li.setAttribute("role", "treeitem");
      const ligne = document.createElement("div");
      ligne.className = "tdm-ligne";
      ligne.style.paddingLeft = `${niveau * 16}px`;

      const entree: Entree = {
        titre: (noeud.title || "(sans titre)").trim(),
        noeud,
        niveau,
        parent,
        page: null,
        fraction: 0,
        ligne,
        sousListe: null,
        bouton: null,
      };
      this.entrees.push(entree);

      if (noeud.items?.length) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "tdm-deplier";
        bouton.innerHTML = CHEVRON;
        // count > 0 (ou absent) : déplié par défaut ; count < 0 : replié (norme PDF).
        const deplie = (noeud.count ?? 1) > 0;
        bouton.setAttribute("aria-expanded", String(deplie));
        bouton.setAttribute("aria-label", deplie ? "Replier" : "Déplier");
        entree.sousListe = this.construireListe(noeud.items, niveau + 1, entree);
        entree.sousListe.hidden = !deplie;
        entree.bouton = bouton;
        bouton.addEventListener("click", () => this.deplier(entree, entree.sousListe!.hidden !== false));
        ligne.append(bouton);
      } else {
        const espace = document.createElement("span");
        espace.className = "tdm-espace";
        ligne.append(espace);
      }

      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "tdm-entree";
      const titre = document.createElement("span");
      titre.className = "tdm-titre";
      titre.textContent = entree.titre;
      if (noeud.bold) titre.style.fontWeight = "700";
      if (noeud.italic) titre.style.fontStyle = "italic";
      const page = document.createElement("span");
      page.className = "tdm-page";
      page.textContent = noeud.url ? "↗" : "";
      bouton.append(titre, page);
      bouton.addEventListener("click", () => this.activer(entree));
      ligne.append(bouton);

      li.append(ligne);
      if (entree.sousListe) li.append(entree.sousListe);
      ul.append(li);
    }
    return ul;
  }

  private deplier(entree: Entree, deplie: boolean): void {
    if (!entree.sousListe || !entree.bouton) return;
    entree.sousListe.hidden = !deplie;
    entree.bouton.setAttribute("aria-expanded", String(deplie));
    entree.bouton.setAttribute("aria-label", deplie ? "Replier" : "Déplier");
  }

  private activer(entree: Entree): void {
    const { url, dest } = entree.noeud;
    if (url) {
      // Lien externe : ouvert dans le navigateur, ce n'est pas un saut interne.
      this.rappels.ouvrirUrl(url);
    } else if (dest) {
      this.rappels.sauter(dest as string | unknown[]);
    }
  }

  /** Résout les numéros de page de toutes les entrées (affichage + section courante). */
  private async resoudrePages(doc: PDFDocumentProxy, generation: number): Promise<void> {
    const vues = new Map<number, number[]>();
    for (const e of this.entrees) {
      if (generation !== this.generation) return;
      if (!e.noeud.dest) continue;
      const cible = await resoudreDestination(doc, e.noeud.dest);
      if (!cible || generation !== this.generation) continue;
      e.page = cible.page;
      let vue = vues.get(cible.page);
      if (!vue) {
        vue = (await doc.getPage(cible.page + 1)).view;
        vues.set(cible.page, vue);
      }
      e.fraction = fractionDansPage(cible.destArray, vue) ?? 0;
      (e.ligne.querySelector(".tdm-page") as HTMLElement).textContent = String(cible.page + 1);
    }
    if (generation !== this.generation) return;
    // Tri stable : à position égale, l'ordre du document (parent avant enfant) est conservé.
    this.ordonnees = this.entrees
      .filter((e) => e.page !== null)
      .sort((a, b) => a.page! - b.page! || a.fraction - b.fraction);
  }

  /** Met en évidence la section qui contient l'emplacement donné. */
  majCourante(emp: Emplacement): void {
    let trouvee: Entree | null = null;
    for (const e of this.ordonnees) {
      if (e.page! < emp.page || (e.page === emp.page && e.fraction <= emp.fraction + 0.02)) trouvee = e;
      else break;
    }
    if (trouvee === this.courante) return;
    this.courante?.ligne.classList.remove("courante");
    this.courante = trouvee;
    trouvee?.ligne.classList.add("courante");
  }

  /** Titre de la section courante (proposé comme titre de signet). */
  titreCourant(): string | null {
    return this.courante?.titre ?? null;
  }

  /** À l'ouverture du panneau : déplie les parents de la section courante et la montre. */
  montrerCourante(): void {
    const c = this.courante;
    if (!c) return;
    for (let p = c.parent; p; p = p.parent) this.deplier(p, true);
    c.ligne.scrollIntoView({ block: "center" });
  }
}

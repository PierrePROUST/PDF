import type { Emplacement } from "./emplacement";
import { enregistrerSignet, listerSignets, supprimerSignet, type Signet } from "./stockage";
import { demander } from "./ui";

const ICONE_RENOMMER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.2V21h3.8l11-11-3.8-3.8zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8z"/></svg>';
const ICONE_SUPPRIMER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>';

/** Panneau « Signets » : signets perso du document ouvert. */
export class PanneauSignets {
  private docId = "";
  private signets: Signet[] = [];

  constructor(
    private readonly liste: HTMLUListElement,
    private readonly messageVide: HTMLElement,
    private readonly rappels: {
      /** Saut vers un signet (doit passer par l'historique). */
      sauter(e: Emplacement): void;
    },
  ) {}

  async charger(docId: string): Promise<void> {
    this.docId = docId;
    const signets = docId ? await listerSignets(docId) : [];
    // Ignore le résultat si un autre document a été ouvert entre-temps.
    if (docId !== this.docId) return;
    this.signets = signets;
    this.afficher();
  }

  vider(): void {
    this.docId = "";
    this.signets = [];
    this.afficher();
  }

  /** Ajoute un signet à l'emplacement donné ; le titre proposé est modifiable. */
  async ajouter(emplacement: Emplacement, titrePropose: string): Promise<boolean> {
    const titre = await demander("Titre du signet", titrePropose);
    if (!titre) return false;
    const signet: Signet = {
      id: crypto.randomUUID(),
      docId: emplacement.docId,
      titre,
      emplacement,
      creeLe: Date.now(),
    };
    await enregistrerSignet(signet);
    await this.charger(this.docId);
    return true;
  }

  private async renommer(signet: Signet): Promise<void> {
    const titre = await demander("Renommer le signet", signet.titre);
    if (!titre || titre === signet.titre) return;
    await enregistrerSignet({ ...signet, titre });
    await this.charger(this.docId);
  }

  private async supprimer(signet: Signet): Promise<void> {
    if (!confirm(`Supprimer le signet « ${signet.titre} » ?`)) return;
    await supprimerSignet(signet.id);
    await this.charger(this.docId);
  }

  private afficher(): void {
    this.liste.replaceChildren(
      ...this.signets.map((s) => {
        const li = document.createElement("li");
        li.className = "element";

        const principal = document.createElement("button");
        principal.type = "button";
        principal.className = "element-principal";
        const titre = document.createElement("span");
        titre.className = "element-titre";
        titre.textContent = s.titre;
        const detail = document.createElement("span");
        detail.className = "element-detail";
        detail.textContent = `Page ${s.emplacement.page + 1}`;
        principal.append(titre, detail);
        principal.addEventListener("click", () => this.rappels.sauter(s.emplacement));

        const renommer = document.createElement("button");
        renommer.type = "button";
        renommer.className = "icone";
        renommer.setAttribute("aria-label", `Renommer « ${s.titre} »`);
        renommer.innerHTML = ICONE_RENOMMER;
        renommer.addEventListener("click", () => void this.renommer(s));

        const supprimer = document.createElement("button");
        supprimer.type = "button";
        supprimer.className = "icone";
        supprimer.setAttribute("aria-label", `Supprimer « ${s.titre} »`);
        supprimer.innerHTML = ICONE_SUPPRIMER;
        supprimer.addEventListener("click", () => void this.supprimer(s));

        li.append(principal, renommer, supprimer);
        return li;
      }),
    );
    this.messageVide.hidden = this.signets.length > 0;
  }
}

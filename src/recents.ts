import { espaceUtilise, listerDocuments, supprimerDocument, type DocumentEnregistre } from "./stockage";
import { formaterTaille } from "./ui";

const ICONE_SUPPRIMER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>';

const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Écran d'accueil : liste des documents récents et espace de stockage utilisé. */
export class ListeRecents {
  constructor(
    private readonly liste: HTMLUListElement,
    private readonly messageVide: HTMLElement,
    private readonly espace: HTMLElement,
    private readonly rappels: { ouvrir(doc: DocumentEnregistre): void },
  ) {}

  async afficher(): Promise<void> {
    const docs = await listerDocuments().catch((e) => {
      console.error("Lecture des récents impossible", e);
      return [] as DocumentEnregistre[];
    });
    this.liste.replaceChildren(...docs.map((d) => this.element(d)));
    this.messageVide.hidden = docs.length > 0;
    void this.afficherEspace();
  }

  private element(d: DocumentEnregistre): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "element";

    const principal = document.createElement("button");
    principal.type = "button";
    principal.className = "element-principal";
    const titre = document.createElement("span");
    titre.className = "element-titre";
    titre.textContent = d.titre || d.nom;
    const detail = document.createElement("span");
    detail.className = "element-detail";
    const morceaux = [];
    if (d.titre && d.titre !== d.nom) morceaux.push(d.nom);
    if (d.position && d.nbPages) morceaux.push(`page ${d.position.page + 1} / ${d.nbPages}`);
    morceaux.push(formaterTaille(d.taille), formatDate.format(d.ouvertLe));
    detail.textContent = morceaux.join(" · ");
    principal.append(titre, detail);
    principal.addEventListener("click", () => this.rappels.ouvrir(d));

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "icone";
    supprimer.setAttribute("aria-label", `Supprimer « ${d.titre || d.nom} » de la liste`);
    supprimer.innerHTML = ICONE_SUPPRIMER;
    supprimer.addEventListener("click", async () => {
      if (!confirm(`Supprimer « ${d.titre || d.nom} » de la liste ?\nLa copie du PDF et ses signets seront effacés de l'application.`)) {
        return;
      }
      await supprimerDocument(d.id);
      await this.afficher();
    });

    li.append(principal, supprimer);
    return li;
  }

  private async afficherEspace(): Promise<void> {
    const e = await espaceUtilise().catch(() => null);
    if (!e) {
      this.espace.textContent = "";
      return;
    }
    this.espace.textContent =
      `Espace utilisé : ${formaterTaille(e.utilise)} sur ${formaterTaille(e.quota)} disponibles. ` +
      (e.persistant
        ? "Stockage persistant : les documents ne seront pas effacés automatiquement."
        : "Stockage non persistant : le navigateur peut effacer les documents s'il manque de place.");
  }
}

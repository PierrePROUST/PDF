import {
  detailEspace,
  effacerAncienLecteurPdf,
  espaceUtilise,
  listerDocuments,
  supprimerDocument,
  type DocumentEnregistre,
} from "./stockage";
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
      this.espace.replaceChildren();
      return;
    }
    const resume = document.createElement("p");
    resume.textContent =
      `Espace utilisé par tout le site pierreproust.github.io : ${formaterTaille(e.utilise)} ` +
      `sur ${formaterTaille(e.quota)} disponibles. ` +
      (e.persistant
        ? "Stockage persistant : les documents ne seront pas effacés automatiquement."
        : "Stockage non persistant : le navigateur peut effacer les documents s'il manque de place.");
    this.espace.replaceChildren(resume);

    const detail = await detailEspace().catch((err) => {
      console.warn("Détail de l'espace indisponible", err);
      return null;
    });
    if (!detail) return;
    const explication = document.createElement("p");
    explication.textContent =
      "Ce site est partagé avec vos autres applications (ancien LecteurPDF, VASLweb…). Détail :";
    const liste = document.createElement("ul");
    liste.className = "detail-espace";
    let mesure = 0;
    for (const l of detail.lignes) {
      mesure += l.octets;
      const li = document.createElement("li");
      li.textContent = `${l.libelle} : ${formaterTaille(l.octets)}`;
      liste.append(li);
    }
    const reste = document.createElement("li");
    reste.textContent =
      `Le reste (${formaterTaille(Math.max(0, e.utilise - mesure))}) : données d'autres applications ` +
      "du site et réserve interne de Chrome, non détaillables ici. Après un effacement, Chrome peut " +
      "mettre un moment à faire baisser le total : c'est normal.";
    liste.append(reste);
    this.espace.append(explication, liste);

    if (detail.ancienLecteurPdf) {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "bouton";
      bouton.textContent = "Effacer les données de l'ancien LecteurPDF";
      bouton.addEventListener("click", async () => {
        if (
          !confirm(
            "Effacer les données de l'ancienne application LecteurPDF (caches, documents, signets) ?\n" +
              "PDF et VASLweb ne sont pas touchés.",
          )
        ) {
          return;
        }
        bouton.disabled = true;
        await effacerAncienLecteurPdf().catch((err) => console.error(err));
        await this.afficherEspace();
      });
      this.espace.append(bouton);
    }
  }
}

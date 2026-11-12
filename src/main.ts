import "./style.css";
import type { Emplacement } from "./emplacement";
import { empreinteSha256 } from "./hachage";
import { Historique } from "./historique";
import { ModeColonnes } from "./modecolonnes";
import { ListeRecents } from "./recents";
import { PanneauSignets } from "./signets";
import {
  demanderPersistance,
  enregistrerDocument,
  enregistrerDocumentEtFichier,
  lireDocument,
  lireFichier,
  majModeColonnes,
  majPosition,
  type DocumentEnregistre,
} from "./stockage";
import { afficherErreur, afficherMessage, demander, el } from "./ui";
import { TableDesMatieres } from "./tdm";
import { Visionneuse } from "./visionneuse";

const ecranAccueil = el("accueil");
const ecranLecteur = el("lecteur");
const indicateur = el<HTMLButtonElement>("indicateur-page");

const visionneuse = new Visionneuse(el<HTMLDivElement>("conteneur-pdf"), el<HTMLDivElement>("visionneuse"), {
  avantSaut: () => enregistrerSaut(),
  surDeplacement: () => surDeplacement(),
  apresSaut: () => void modeColonnes.recaler(),
});

// ---------- Mode lecture en colonnes (PDF en deux colonnes) ----------
const btnColonnes = el<HTMLButtonElement>("btn-colonnes");
const modeColonnes = new ModeColonnes(visionneuse, {
  surChangement: (actif) => {
    btnColonnes.setAttribute("aria-pressed", String(actif));
  },
});
btnColonnes.addEventListener("click", async () => {
  if (!visionneuse.document) return;
  const docId = visionneuse.docId;
  const actif = !modeColonnes.actif;
  if (actif) await modeColonnes.activer(true);
  else modeColonnes.desactiver();
  afficherMessage(actif ? "Lecture en colonnes : en bas d'une colonne, on passe à la suivante" : "Page entière");
  // Le choix est retenu pour ce document et l'emporte sur la détection automatique.
  void majModeColonnes(docId, actif).catch((e) => console.error(e));
});

/**
 * À l'ouverture : active le mode colonnes si l'utilisateur l'a choisi pour ce document, ou
 * si la détection trouve deux colonnes (sauf refus explicite de l'utilisateur).
 */
async function demarrerModeColonnes(docId: string, connu: DocumentEnregistre | undefined): Promise<void> {
  const choix = connu?.modeColonnes;
  if (choix === false || !visionneuse.document) return;
  const analyse = await modeColonnes.analyser(visionneuse.document);
  if (visionneuse.docId !== docId) return;
  if (choix !== true && !analyse.deuxColonnes) return;
  // Reprise de lecture déjà zoomée sur une colonne : on garde exactement cette position.
  const reprise = connu?.position;
  const garderPosition = !!reprise && (reprise.x ?? 0) > 0.01;
  await modeColonnes.activer(!garderPosition);
  if (choix === undefined) afficherMessage("Deux colonnes détectées : lecture en colonnes (bouton ▥ pour la page entière)", 5000);
}

const tdm = new TableDesMatieres(el("arbre-tdm"), {
  sauter: (dest) => {
    fermerPanneaux();
    void visionneuse.sauterDestination(dest);
  },
  ouvrirUrl: (url) => window.open(url, "_blank", "noopener,noreferrer"),
});

const signets = new PanneauSignets(el<HTMLUListElement>("liste-signets"), el("aucun-signet"), {
  sauter: (e) => {
    fermerPanneaux();
    visionneuse.sauterEmplacement(e);
  },
});

el("btn-signets").addEventListener("click", () => ouvrirPanneau(el("panneau-signets")));
el("btn-ajouter-signet").addEventListener("click", async () => {
  if (!visionneuse.document) return;
  const emplacement = visionneuse.emplacement();
  const propose = tdm.titreCourant() ?? `Page ${emplacement.page + 1}`;
  if (await signets.ajouter(emplacement, propose)) afficherMessage("Signet ajouté");
});

let cadreDemande = 0;
function surDeplacement(): void {
  majIndicateur();
  planifierSauvegardePosition();
  if (cadreDemande) return;
  cadreDemande = requestAnimationFrame(() => {
    cadreDemande = 0;
    if (visionneuse.nbPages) tdm.majCourante(visionneuse.emplacement());
  });
}

// ---------- Panneaux latéraux ----------
const voile = el("voile");
const panneaux = [el("panneau-tdm"), el("panneau-signets")];

function ouvrirPanneau(panneau: HTMLElement): void {
  for (const p of panneaux) p.hidden = p !== panneau;
  voile.hidden = false;
}

function fermerPanneaux(): void {
  for (const p of panneaux) p.hidden = true;
  voile.hidden = true;
}

voile.addEventListener("click", fermerPanneaux);
for (const b of document.querySelectorAll(".fermer-panneau")) b.addEventListener("click", fermerPanneaux);

el("btn-tdm").addEventListener("click", () => {
  ouvrirPanneau(el("panneau-tdm"));
  tdm.montrerCourante();
});

// ---------- Historique de navigation (Retour / Avancer) ----------
//
// La pile de l'application est synchronisée avec l'API History du navigateur :
//   { lp: "accueil" }            liste des documents
//   { lp: "lecteur", n: 0 }      document ouvert, aucun saut
//   { lp: "lecteur", n: k }      après k sauts
// Ainsi le geste / bouton retour d'Android (PWA en mode standalone) dépile les sauts
// au lieu de quitter l'application, et ramène à la liste quand la pile est vide.
// Les boutons Retour / Avancer de la barre passent eux aussi par history.back()/forward().
type EtatHistorique = { lp: "accueil" } | { lp: "lecteur"; n: number };

const historique = new Historique<Emplacement>();
const btnRetour = el<HTMLButtonElement>("btn-retour");
const btnAvancer = el<HTMLButtonElement>("btn-avancer");
const bandeau = el<HTMLButtonElement>("bandeau-retour");
let minuterieBandeau = 0;

function etat(e: EtatHistorique): EtatHistorique {
  return e;
}

/** Appelé juste avant chaque saut (table des matières, signet, lien interne, numéro de page). */
function enregistrerSaut(): void {
  historique.sauter(visionneuse.emplacement());
  history.pushState(etat({ lp: "lecteur", n: historique.profondeur }), "");
  majBoutonsHistorique();
  montrerBandeau();
}

function majBoutonsHistorique(): void {
  btnRetour.disabled = !historique.peutRetour;
  btnAvancer.disabled = !historique.peutAvancer;
}

/** Bandeau « ← Revenir à la page X » affiché quelques secondes après un saut. */
function montrerBandeau(): void {
  const origine = historique.precedent;
  if (!origine) return masquerBandeau();
  bandeau.textContent = `← Revenir à la page ${origine.page + 1}`;
  bandeau.hidden = false;
  clearTimeout(minuterieBandeau);
  minuterieBandeau = window.setTimeout(masquerBandeau, 6000);
}

function masquerBandeau(): void {
  clearTimeout(minuterieBandeau);
  bandeau.hidden = true;
}

btnRetour.addEventListener("click", () => {
  if (historique.peutRetour) history.back();
});
btnAvancer.addEventListener("click", () => {
  if (historique.peutAvancer) history.forward();
});
bandeau.addEventListener("click", () => {
  masquerBandeau();
  if (historique.peutRetour) history.back();
});

window.addEventListener("popstate", (ev) => {
  const e = ev.state as EtatHistorique | null;
  if (!e || e.lp !== "lecteur") {
    // Retour à la liste des documents.
    if (visionneuse.document) void fermerDocument();
    return;
  }
  if (!visionneuse.document) {
    // Entrée « lecteur » d'un document déjà fermé (bouton Avancer depuis la liste) : on reste sur la liste.
    history.replaceState(etat({ lp: "accueil" }), "");
    return;
  }
  fermerPanneaux();
  masquerBandeau();
  // Plusieurs pas d'un coup sont possibles (appui long sur Retour dans Chrome).
  while (historique.profondeur > e.n) {
    const cible = historique.retour(visionneuse.emplacement());
    if (!cible) break;
    visionneuse.allerA(cible);
  }
  while (historique.profondeur < e.n) {
    const cible = historique.avancer(visionneuse.emplacement());
    if (!cible) break;
    visionneuse.allerA(cible);
  }
  majBoutonsHistorique();
});

history.replaceState(etat({ lp: "accueil" }), "");

function majIndicateur(): void {
  indicateur.textContent = visionneuse.nbPages ? `${visionneuse.pageLue()} / ${visionneuse.nbPages}` : "– / –";
}

function montrerEcran(lecteur: boolean): void {
  ecranAccueil.hidden = lecteur;
  ecranLecteur.hidden = !lecteur;
}

// ---------- Ouverture, récents et reprise de lecture ----------

const recents = new ListeRecents(el<HTMLUListElement>("liste-recents"), el("aucun-recent"), el("espace-stockage"), {
  ouvrir: (d) => void ouvrirRecent(d.id, d.nom),
});

let ouvertureEnCours = false;

/**
 * Ouvre un PDF (fichier choisi, partagé ou récent). Le document et une copie du PDF
 * sont enregistrés dans IndexedDB ; s'il est déjà connu, on reprend à la dernière position.
 */
async function ouvrirFichier(fichier: Blob, nom: string): Promise<void> {
  if (ouvertureEnCours) return;
  ouvertureEnCours = true;
  let entreeAjoutee = false;
  try {
    const octets = await fichier.arrayBuffer();
    const docId = await empreinteSha256(octets);
    const connu = await lireDocument(docId).catch(() => undefined);
    const enregistrement: DocumentEnregistre = { ...(connu ?? { id: docId, nom, taille: fichier.size }), ouvertLe: Date.now() };
    if (connu) {
      await enregistrerDocument(enregistrement);
    } else {
      await enregistrerDocumentEtFichier(enregistrement, fichier);
      void demanderPersistance();
    }

    historique.vider();
    majBoutonsHistorique();
    history.pushState(etat({ lp: "lecteur", n: 0 }), "");
    entreeAjoutee = true;
    montrerEcran(true);
    el("titre-document").textContent = enregistrement.titre || nom;
    // PDF.js transfère le tampon au worker : on lui en donne une copie.
    modeColonnes.reinitialiser(null);
    const doc = await visionneuse.ouvrir(new Uint8Array(octets.slice(0)), docId, connu?.position);
    modeColonnes.reinitialiser(doc);
    const meta = await doc.getMetadata().catch(() => null);
    const titre = (meta?.info as { Title?: string } | undefined)?.Title?.trim() || undefined;
    if (titre) el("titre-document").textContent = titre;
    await enregistrerDocument({ ...enregistrement, titre, nbPages: doc.numPages });
    majIndicateur();
    if (connu?.position && connu.position.page > 0) {
      afficherMessage(`Reprise à la page ${connu.position.page + 1}`);
    }
    void tdm.charger(doc).then(() => tdm.majCourante(visionneuse.emplacement()));
    void signets.charger(docId);
    void demarrerModeColonnes(docId, connu).catch((e) => console.warn("Mode colonnes :", e));
  } catch (e) {
    if (entreeAjoutee) history.back();
    afficherErreur(`Impossible d'ouvrir « ${nom} » (PDF.js)`, e);
  } finally {
    ouvertureEnCours = false;
  }
}

async function ouvrirRecent(id: string, nom: string): Promise<void> {
  const fichier = await lireFichier(id).catch(() => undefined);
  if (!fichier) {
    alert(`La copie de « ${nom} » est introuvable. Rouvrez le fichier avec « Ouvrir un PDF ».`);
    return;
  }
  await ouvrirFichier(fichier, nom);
}

// Sauvegarde de la dernière position lue (pour la reprise de lecture).
let minuterieSauvegarde = 0;
function planifierSauvegardePosition(): void {
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = window.setTimeout(sauvegarderPosition, 800);
}

function sauvegarderPosition(): void {
  clearTimeout(minuterieSauvegarde);
  if (!visionneuse.document || !visionneuse.docId) return;
  void majPosition(visionneuse.docId, visionneuse.emplacement()).catch((e) => console.error(e));
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") sauvegarderPosition();
});
window.addEventListener("pagehide", sauvegarderPosition);

// ---------- Réception d'un PDF via « Partager » (Web Share Target) ----------
// Le service worker range le fichier reçu dans ce cache puis redirige vers ?partage=1.
async function recupererPartage(): Promise<void> {
  const parametres = new URLSearchParams(location.search);
  const partage = parametres.get("partage");
  if (!partage) return;
  // Nettoie l'adresse pour qu'un rechargement ne rouvre pas le partage.
  history.replaceState(etat({ lp: "accueil" }), "", location.pathname);
  if (partage !== "1") {
    alert(partage === "vide" ? "Aucun PDF reçu par le partage." : "Le PDF partagé n'a pas pu être reçu.");
    return;
  }
  const cache = await caches.open("pdfapp-partage");
  const cle = new URL("__partage__", location.href).href;
  const reponse = await cache.match(cle);
  if (!reponse) return;
  await cache.delete(cle);
  const nom = decodeURIComponent(reponse.headers.get("X-Nom-Fichier") ?? "document.pdf");
  await ouvrirFichier(await reponse.blob(), nom);
}

el<HTMLInputElement>("choix-fichier").addEventListener("change", (ev) => {
  const input = ev.target as HTMLInputElement;
  const fichier = input.files?.[0];
  input.value = "";
  if (fichier) void ouvrirFichier(fichier, fichier.name);
});

indicateur.addEventListener("click", async () => {
  if (!visionneuse.nbPages) return;
  const n = visionneuse.nbPages;
  const saisie = await demander(`Aller à la page (1 à ${n})`, String(visionneuse.pageLue()), {
    type: "number",
    min: 1,
    max: n,
  });
  if (saisie === null) return;
  const page = parseInt(saisie, 10);
  if (page >= 1 && page <= n) visionneuse.sauterPage(page);
  else afficherMessage(`Page invalide : ${saisie}`);
});

async function fermerDocument(): Promise<void> {
  sauvegarderPosition();
  fermerPanneaux();
  masquerBandeau();
  tdm.vider();
  signets.vider();
  historique.vider();
  majBoutonsHistorique();
  montrerEcran(false);
  modeColonnes.reinitialiser(null);
  void recents.afficher();
  await visionneuse.fermer();
}

// « Documents » : revient à l'entrée « accueil » de l'historique (le popstate ferme le document).
el("btn-fermer").addEventListener("click", () => {
  history.go(-(historique.profondeur + 1));
});

void recents.afficher();
void recupererPartage();

// ---------- Service worker (hors-ligne, réception des partages) ----------
if (import.meta.env.PROD) {
  if (!("serviceWorker" in navigator)) {
    afficherErreur("Service worker indisponible", "Ce navigateur ne prend pas en charge les service workers : pas de mode hors ligne ni de « Partager ».");
  } else {
    // Le service worker signale lui-même un échec d'installation (mise en cache impossible…).
    navigator.serviceWorker.addEventListener("message", (ev: MessageEvent) => {
      const d = ev.data as { type?: string; message?: string } | null;
      if (d?.type === "erreur-sw") afficherErreur("Échec de l'installation du service worker", d.message ?? "");
    });
    navigator.serviceWorker.register("./sw.js").catch((e) => afficherErreur("Échec de l'enregistrement du service worker", e));
  }
}

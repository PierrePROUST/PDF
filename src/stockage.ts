/**
 * Stockage local (IndexedDB) : tout reste sur le téléphone.
 *
 *   documents : un enregistrement par PDF connu (récents, dernière position lue)
 *   fichiers  : anciennes copies de PDF. Depuis le 13 novembre 2026 l'application n'en crée
 *               plus (le fichier reste là où il est sur l'appareil) ; celles qui existent
 *               servent encore à rouvrir depuis les récents, jusqu'à leur effacement.
 *   signets   : signets perso, indexés par document
 */
import type { Emplacement } from "./emplacement";

export interface DocumentEnregistre {
  /** Empreinte SHA-256 du contenu. */
  id: string;
  nom: string;
  titre?: string;
  taille: number;
  nbPages?: number;
  ouvertLe: number;
  position?: Emplacement;
  /** Choix explicite de l'utilisateur pour le mode colonnes (absent : détection automatique). */
  modeColonnes?: boolean;
}

export interface Signet {
  id: string;
  docId: string;
  titre: string;
  emplacement: Emplacement;
  creeLe: number;
}

interface FichierEnregistre {
  id: string;
  donnees: Blob;
}

// Nom propre à cette application : l'origine pierreproust.github.io est partagée avec d'autres PWA.
const NOM_BASE = "pdfapp";
const VERSION_BASE = 1;

let basePromise: Promise<IDBDatabase> | null = null;

function base(): Promise<IDBDatabase> {
  basePromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, VERSION_BASE);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("documents")) db.createObjectStore("documents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("fichiers")) db.createObjectStore("fichiers", { keyPath: "id" });
      if (!db.objectStoreNames.contains("signets")) {
        db.createObjectStore("signets", { keyPath: "id" }).createIndex("docId", "docId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return basePromise;
}

function attendre<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fin(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction annulée"));
  });
}

async function magasin(nom: string, mode: IDBTransactionMode = "readonly"): Promise<IDBObjectStore> {
  return (await base()).transaction(nom, mode).objectStore(nom);
}

// ---------- Documents ----------

export async function listerDocuments(): Promise<DocumentEnregistre[]> {
  const docs = await attendre((await magasin("documents")).getAll() as IDBRequest<DocumentEnregistre[]>);
  return docs.sort((a, b) => b.ouvertLe - a.ouvertLe);
}

export async function lireDocument(id: string): Promise<DocumentEnregistre | undefined> {
  return attendre((await magasin("documents")).get(id) as IDBRequest<DocumentEnregistre | undefined>);
}

export async function enregistrerDocument(doc: DocumentEnregistre): Promise<void> {
  await attendre((await magasin("documents", "readwrite")).put(doc));
}

/** Anciennes copies de PDF encore gardées par l'application. */
export async function tailleCopies(): Promise<{ nombre: number; octets: number }> {
  const copies = await attendre((await magasin("fichiers")).getAll() as IDBRequest<FichierEnregistre[]>);
  return { nombre: copies.length, octets: copies.reduce((t, c) => t + c.donnees.size, 0) };
}

/** Efface les anciennes copies de PDF (documents, signets et positions sont conservés). */
export async function effacerCopies(): Promise<void> {
  await attendre((await magasin("fichiers", "readwrite")).clear());
}

export async function majPosition(id: string, position: Emplacement): Promise<void> {
  const tx = (await base()).transaction("documents", "readwrite");
  const store = tx.objectStore("documents");
  const doc = (await attendre(store.get(id))) as DocumentEnregistre | undefined;
  if (doc) store.put({ ...doc, position });
  await fin(tx);
}

export async function majModeColonnes(id: string, modeColonnes: boolean): Promise<void> {
  const tx = (await base()).transaction("documents", "readwrite");
  const store = tx.objectStore("documents");
  const doc = (await attendre(store.get(id))) as DocumentEnregistre | undefined;
  if (doc) store.put({ ...doc, modeColonnes });
  await fin(tx);
}

export async function lireFichier(id: string): Promise<Blob | undefined> {
  const f = await attendre((await magasin("fichiers")).get(id) as IDBRequest<FichierEnregistre | undefined>);
  return f?.donnees;
}

/** Supprime le document, sa copie et ses signets. */
export async function supprimerDocument(id: string): Promise<void> {
  const tx = (await base()).transaction(["documents", "fichiers", "signets"], "readwrite");
  tx.objectStore("documents").delete(id);
  tx.objectStore("fichiers").delete(id);
  const index = tx.objectStore("signets").index("docId");
  const cles = (await attendre(index.getAllKeys(id))) as IDBValidKey[];
  for (const cle of cles) tx.objectStore("signets").delete(cle);
  await fin(tx);
}

// ---------- Signets ----------

export async function listerSignets(docId: string): Promise<Signet[]> {
  const index = (await magasin("signets")).index("docId");
  const signets = (await attendre(index.getAll(docId))) as Signet[];
  return signets.sort(
    (a, b) => a.emplacement.page - b.emplacement.page || a.emplacement.fraction - b.emplacement.fraction,
  );
}

export async function enregistrerSignet(signet: Signet): Promise<void> {
  await attendre((await magasin("signets", "readwrite")).put(signet));
}

export async function supprimerSignet(id: string): Promise<void> {
  await attendre((await magasin("signets", "readwrite")).delete(id));
}

// ---------- Espace de stockage ----------

/** Demande un stockage persistant (non effacé automatiquement par le navigateur). */
export async function demanderPersistance(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function espaceUtilise(): Promise<{ utilise: number; quota: number; persistant: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persistant = (await navigator.storage.persisted?.()) ?? false;
  return { utilise: usage, quota, persistant };
}

// ---------- Détail de l'espace (site partagé avec d'autres applications) ----------
//
// navigator.storage.estimate() mesure TOUT le site pierreproust.github.io : il est partagé
// avec d'autres PWA (ancien LecteurPDF, VASLweb…). On détaille donc par application.

/** Ancienne application LecteurPDF, remplacée par PDF : base IndexedDB, caches, service worker. */
const ANCIEN_LECTEURPDF = { base: "lecteurpdf", prefixeCache: "lecteurpdf-", portee: "/LecteurPDF/" };

export interface LigneEspace {
  libelle: string;
  octets: number;
}

async function tailleCache(nom: string): Promise<number> {
  const cache = await caches.open(nom);
  let total = 0;
  for (const requete of await cache.keys()) {
    const reponse = await cache.match(requete);
    if (!reponse) continue;
    const longueur = Number(reponse.headers.get("Content-Length"));
    total += longueur > 0 ? longueur : (await reponse.blob()).size;
  }
  return total;
}

async function baseExiste(nom: string): Promise<boolean> {
  // indexedDB.databases() : Chrome 71+. Ne jamais ouvrir une base pour tester : cela la créerait.
  if (!indexedDB.databases) return false;
  return (await indexedDB.databases()).some((b) => b.name === nom);
}

/** Taille des caches par application, et des copies de PDF gardées par PDF. */
export async function detailEspace(): Promise<{ lignes: LigneEspace[]; ancienLecteurPdf: boolean; copies: number }> {
  const groupes = new Map<string, number>();
  const ajouter = (libelle: string, octets: number) => groupes.set(libelle, (groupes.get(libelle) ?? 0) + octets);
  let ancienLecteurPdf = false;
  for (const nom of await caches.keys()) {
    const taille = await tailleCache(nom);
    if (nom.startsWith("pdfapp-")) ajouter("PDF : l'application (hors ligne)", taille);
    else if (nom.startsWith(ANCIEN_LECTEURPDF.prefixeCache)) {
      ancienLecteurPdf = true;
      ajouter("Ancien LecteurPDF (caches)", taille);
    } else if (nom.startsWith("vaslweb-")) ajouter("VASLweb / Vaslwebtest (caches)", taille);
    else ajouter("Autres caches du site", taille);
  }
  const copies = await tailleCopies().catch(() => ({ nombre: 0, octets: 0 }));
  if (copies.nombre) ajouter("PDF : anciennes copies de documents", copies.octets);
  if (await baseExiste(ANCIEN_LECTEURPDF.base)) ancienLecteurPdf = true;
  return { lignes: [...groupes].map(([libelle, octets]) => ({ libelle, octets })), ancienLecteurPdf, copies: copies.nombre };
}

/** Efface tout ce qui reste de l'ancien LecteurPDF : caches, base IndexedDB, service worker. */
export async function effacerAncienLecteurPdf(): Promise<void> {
  for (const nom of await caches.keys()) {
    if (nom.startsWith(ANCIEN_LECTEURPDF.prefixeCache)) await caches.delete(nom);
  }
  if ("serviceWorker" in navigator) {
    for (const r of await navigator.serviceWorker.getRegistrations()) {
      if (new URL(r.scope).pathname === ANCIEN_LECTEURPDF.portee) await r.unregister();
    }
  }
  if (await baseExiste(ANCIEN_LECTEURPDF.base)) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(ANCIEN_LECTEURPDF.base);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      // Un onglet LecteurPDF encore ouvert bloque la suppression : elle se fera à sa fermeture.
      req.onblocked = () => resolve();
    });
  }
}

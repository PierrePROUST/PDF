/**
 * Stockage local (IndexedDB) : tout reste sur le téléphone.
 *
 *   documents : un enregistrement par PDF connu (récents, dernière position lue)
 *   fichiers  : la copie du PDF (une PWA Android ne garde pas l'accès au fichier d'origine)
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

/** Enregistre un document et sa copie dans une seule transaction. */
export async function enregistrerDocumentEtFichier(doc: DocumentEnregistre, donnees: Blob): Promise<void> {
  const tx = (await base()).transaction(["documents", "fichiers"], "readwrite");
  tx.objectStore("documents").put(doc);
  tx.objectStore("fichiers").put({ id: doc.id, donnees } satisfies FichierEnregistre);
  await fin(tx);
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

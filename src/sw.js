// Service worker de PDF (modèle : la version et la liste des fichiers sont
// injectées au build par vite.config.ts).
/* eslint-env serviceworker */

const VERSION = self.__VERSION__;
const FICHIERS = self.__FICHIERS__;
const CACHE = `pdfapp-${VERSION}`;
// Cache séparé où le PDF reçu par « Partager » attend que l'application le récupère.
const CACHE_PARTAGE = "pdfapp-partage";

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll(FICHIERS);
      } catch (erreur) {
        // Prévient les pages ouvertes pour qu'elles affichent l'erreur à l'écran.
        const message = `${erreur && erreur.stack ? erreur.stack : erreur}\nNavigateur : ${self.navigator.userAgent}`;
        for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
          client.postMessage({ type: "erreur-sw", message });
        }
        throw erreur;
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) {
        if (nom.startsWith("pdfapp-") && nom !== CACHE && nom !== CACHE_PARTAGE) {
          await caches.delete(nom);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Web Share Target : réception d'un PDF partagé depuis une autre application.
  if (requete.method === "POST" && url.pathname.endsWith("/partage")) {
    evenement.respondWith(recevoirPartage(requete));
    return;
  }
  if (requete.method !== "GET") return;

  if (requete.mode === "navigate") {
    evenement.respondWith(pageAccueil(requete));
    return;
  }
  // Fichiers de l'application (noms avec empreinte, jamais modifiés) : cache d'abord, en
  // cherchant dans TOUS les caches de l'application (une page encore ouverte peut réclamer
  // les fichiers de la version précédente), puis réseau.
  evenement.respondWith(
    (async () =>
      (await caches.match(requete, { ignoreSearch: true, ignoreVary: true })) ?? fetch(requete))(),
  );
});

/** Délai au-delà duquel on renonce au réseau pour la page d'accueil (réseau très lent). */
const DELAI_RESEAU_MS = 4000;

/**
 * Page d'accueil (index.html) : RÉSEAU D'ABORD, cache seulement hors ligne.
 * Servie depuis le cache alors qu'une nouvelle version est en ligne, elle réclamait des
 * fichiers que GitHub Pages ne sert plus (nom avec empreinte de l'ancienne version) :
 * page blanche avec « Un fichier de l'application n'a pas pu être chargé ».
 */
async function pageAccueil(requete) {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_RESEAU_MS);
  try {
    const reponse = await fetch(requete, { signal: arret.signal, cache: "no-cache" });
    if (reponse.ok) {
      // Garde la version la plus récente de la page d'accueil pour le hors-ligne.
      if (new URL(requete.url).pathname === new URL(self.registration.scope).pathname) {
        const cache = await caches.open(CACHE);
        await cache.put("./", reponse.clone());
      }
      return reponse;
    }
  } catch {
    // Hors ligne ou réseau trop lent : on se rabat sur le cache.
  } finally {
    clearTimeout(minuterie);
  }
  return (
    (await caches.match("./", { cacheName: CACHE, ignoreVary: true })) ??
    (await caches.match("./", { ignoreVary: true })) ??
    fetch(requete)
  );
}

async function recevoirPartage(requete) {
  const portee = self.registration.scope;
  try {
    const donnees = await requete.formData();
    const fichiers = donnees.getAll("pdf").filter((f) => f instanceof File);
    if (fichiers.length === 0) return Response.redirect(`${portee}?partage=vide`, 303);
    const fichier = fichiers[0];
    const cache = await caches.open(CACHE_PARTAGE);
    await cache.put(
      new Request(`${portee}__partage__`),
      new Response(fichier, {
        headers: {
          "Content-Type": "application/pdf",
          "X-Nom-Fichier": encodeURIComponent(fichier.name || "document.pdf"),
        },
      }),
    );
    return Response.redirect(`${portee}?partage=1`, 303);
  } catch (erreur) {
    console.error("Partage : échec de la réception", erreur);
    return Response.redirect(`${portee}?partage=erreur`, 303);
  }
}

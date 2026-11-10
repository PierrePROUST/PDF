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
      const cache = await caches.open(CACHE);
      await cache.addAll(FICHIERS);
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

  evenement.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (requete.mode === "navigate") {
        // Application monopage : toute navigation sert index.html depuis le cache.
        return (await cache.match("./", { ignoreVary: true })) ?? fetch(requete);
      }
      return (await cache.match(requete, { ignoreSearch: true, ignoreVary: true })) ?? fetch(requete);
    })(),
  );
});

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

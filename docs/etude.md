# Étape 0 — Étude préalable

Date : 9 novembre 2026. Vérifications faites sur le registre npm, sur les paquets eux-mêmes (code téléchargé et inspecté) et sur les données de compatibilité MDN (`@mdn/browser-compat-data` 8.1.8, publiée le 2 novembre 2026).

> Limite : le site developer.chrome.com n'était pas accessible depuis l'environnement de travail. Les points de prise en charge s'appuient donc sur MDN (données de compatibilité) et sur le code source, pas sur les annonces Chrome. Tout ce qui touche à Android reste à **confirmer sur l'appareil**.

## 1. Dépendances (vérifiées sur npm)

| Paquet | Dernière version | Licence | Rôle |
|---|---|---|---|
| `pdfjs-dist` | 6.5.438 (1er nov. 2026) | Apache-2.0 | moteur PDF |
| `vite` | 8.3.7 | MIT | outillage |
| `typescript` | 7.0.2 | Apache-2.0 | langage |
| `vitest` | 5.1.0 | MIT | tests unitaires |
| `vite-plugin-pwa` | 2.0.0 (oct. 2026) | MIT | facultatif (voir § 5) |

Les versions exactes seront figées au moment de l'installation (étape 1), par `npm install` et non de mémoire.

## 2. PDF.js 6.5.438 — API nécessaires

Vérifié dans `types/src/display/api.d.ts` et `web/pdf_viewer.mjs` du paquet :

- `pdfDocument.getOutline()` existe. Il renvoie un tableau de nœuds `{ title, bold, italic, color, dest: string | Array | null, url: string | null, unsafeUrl, newWindow, count, items }`. Les deux formes de `dest` sont confirmées (chaîne = destination nommée, tableau = destination explicite), ainsi que le champ `url` pour les liens externes.
- `getDestination(id: string): Promise<Array | null>` et `getPageIndex(ref): Promise<number>` existent.
- Le worker est fourni dans `build/pdf.worker.min.mjs` et peut être servi localement (pas de CDN).
- `web/pdf_viewer.mjs` exporte notamment `PDFViewer`, `PDFLinkService`, `EventBus`, `PDFHistory`, `AnnotationLayerBuilder`, `TextLayerBuilder`.
- `pdf.mjs` exporte `TouchManager`, mais ce module sert aux outils d'édition. **Aucun des composants de visionneuse ne gère le zoom par pincement** : dans Firefox, ce geste est géré par l'application `app.js`, qui n'est pas incluse dans le paquet. Le pincement est donc **à écrire nous-mêmes, quelle que soit l'option choisie**.
- Navigateurs pris en charge (FAQ PDF.js, modifiée le 31 mai 2026) : la version « moderne » vise les derniers navigateurs, et la version `legacy` vise Chrome 125+. Chrome Android à jour convient à la version moderne.

## 3. Visionneuse fournie ou rendu maison — **décision à prendre**

### Option A — composants `pdf_viewer` (`PDFViewer` + `PDFLinkService` + `EventBus`)

Avantages :
- Défilement continu avec **rendu paresseux** déjà en place (seules les pages visibles et voisines sont rendues, avec un tampon de pages). Un PDF de 500 pages reste gérable.
- Couche d'annotations (liens internes **et** externes) et couche de texte (sélection) incluses.
- `PDFLinkService.goToDestination(dest)` gère déjà la chaîne et le tableau, ainsi que les types de destination `XYZ`, `Fit`, `FitH`, `FitR`, etc. (via `scrollPageIntoView`) : on arrive au bon endroit dans la page.
- La position courante est fournie (page, `top`, `left`, échelle) à chaque défilement, par l'événement `updateviewarea`.
- Rendu haute densité (écrans HiDPI), annulation des rendus hors écran, et limitation de la mémoire déjà gérés.

Limites :
- L'API des composants est moins stable que celle du cœur : elle peut changer entre versions mineures. Il faut **figer la version**, et retester à chaque mise à jour.
- Pas de pincement intégré : il faut l'écrire (transformation CSS pendant le geste, puis `currentScale` au relâchement).
- Les liens passent par `PDFLinkService` : il faut l'**envelopper**, en dérivant la classe ou en interceptant `goToDestination` / `goToPage`, pour empiler l'emplacement d'origine dans **notre** historique. Le `PDFHistory` fourni n'est **pas** utilisé, car il s'appuie sur le hachage de l'URL et ne correspond pas à la définition de l'emplacement.
- Contraintes de mise en page imposées : le conteneur doit être en `position: absolute`, et il faut inclure `pdf_viewer.css`. Le paquet est plus lourd (environ 9 900 lignes non minifiées).

### Option B — rendu maison canvas page par page

Avantages : maîtrise totale du DOM, du défilement et du zoom, et code plus léger côté visionneuse.

Limites :
- Il faut réécrire le rendu paresseux (avec `IntersectionObserver`), le recyclage des canvas pour la mémoire, la haute densité et l'annulation des rendus.
- Il faut brancher soi-même `AnnotationLayer` pour les liens, avec un « link service » maison.
- Il faut convertir les coordonnées des destinations (`XYZ`, `FitH`…) en position de défilement.
- La sélection de texte est à refaire, ou abandonnée.
- Il y a beaucoup plus de code, donc plus de risques de bugs sur un PDF de 500 pages.

### Recommandation : **option A**

Elle couvre d'office les points les plus risqués : rendu paresseux, liens internes et coordonnées de destination. Le coût se limite au pincement (à écrire de toute façon) et à une couche d'interception des liens. Version de `pdfjs-dist` figée exactement.

## 4. Ouverture des fichiers sur Android

| Fonction | Chrome bureau | Chrome Android | Source |
|---|---|---|---|
| `file_handlers` (manifeste) | 102 | **non pris en charge** | MDN BCD 8.1.8 |
| `LaunchQueue` (API) | 102 | **non pris en charge** | MDN BCD 8.1.8 |
| `share_target` (manifeste) | 89 | **76** | MDN BCD 8.1.8 |

- **File Handling : toujours absent sur Android** → on ne l'utilise pas (conforme au CLAUDE.md). Le bouton « Ouvrir un PDF » reste la méthode de base.
- **Web Share Target : pris en charge sur Chrome Android depuis la version 76**, uniquement pour une PWA **installée**. On utilisera un `share_target` en `POST` + `multipart/form-data`, avec `params.files: [{ name: "pdf", accept: ["application/pdf", ".pdf"] }]`. Le service worker interceptera le `POST`, lira `request.formData()`, rangera le fichier dans IndexedDB, puis redirigera (303) vers l'application. Les données MDN ne détaillent pas le sous-champ `files` : **le test réel sur l'appareil sera fait à l'étape 6**.

## 5. PWA : plugin ou fait main

`vite-plugin-pwa` 2.0.0 est maintenu (publié en octobre 2026) et accepte Vite 8 (`peerDependencies: vite ^3 … ^8`). Il dépend de Workbox (`workbox-build` 7.4.1).

Cependant, le service worker doit traiter le `POST` du Web Share Target, ce qui impose de toute façon un service worker écrit à la main (mode `injectManifest` du plugin).

**Proposition** : `manifest.webmanifest` et service worker **écrits à la main**. Un petit script de build génère la liste des fichiers à mettre en cache, ce qui évite la dépendance à Workbox. Cette option est à valider : sinon, `vite-plugin-pwa` en mode `injectManifest`.

## 6. Autres API web (Chrome Android, MDN BCD)

| API | Chrome Android |
|---|---|
| `crypto.subtle.digest` (SHA-256) | 41+ (contexte HTTPS requis — GitHub Pages OK) |
| `navigator.storage.persist()` / `estimate()` | 55+ / 61+ |
| `history.pushState` / `popstate` | 18+ |
| IndexedDB | oui |

Point de vigilance (à **tester sur l'appareil**, non vérifié ici) : Chrome peut ignorer, lors du geste retour, les entrées d'historique ajoutées **sans action de l'utilisateur**. Nos `pushState` seront toujours appelés en réponse à un toucher (saut), ce qui devrait éviter le problème. On ne fera jamais de `pushState` automatique au chargement.

## 7. Décisions attendues

1. Visionneuse : **option A** (composants `pdf_viewer`) ou option B (rendu maison) ?
2. PWA : manifeste et service worker **faits main** ou `vite-plugin-pwa` (`injectManifest`) ?
3. PDF de test : je propose de les **générer par script** (avec une bibliothèque libre comme `pdf-lib`, MIT, à vérifier au moment voulu). Ils contiendront une table des matières imbriquée, des liens internes et des destinations `XYZ`, plus un PDF sans table des matières. D'accord ?
4. Adresse GitHub Pages : `https://pierreproust.github.io/LecteurPDF/` (base Vite `/LecteurPDF/`). Le déploiement par GitHub Actions doit être activé dans *Settings → Pages → Source : GitHub Actions*. D'accord ?

## Sources

- Registre npm : `npm view pdfjs-dist|vite|typescript|vitest|vite-plugin-pwa`
- Paquet `pdfjs-dist@6.5.438` (fichiers `types/src/display/api.d.ts`, `web/pdf_viewer.mjs`, `build/pdf.mjs`)
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) 8.1.8 — `manifests.webapp.file_handlers`, `manifests.webapp.share_target`, `api.LaunchQueue`
- [MDN — share_target](https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [MDN — Associer des fichiers à une PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Associate_files_with_your_PWA)
- [Chrome — File Handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling) et [Chrome — Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) (non consultables depuis l'environnement ; à relire)
- [FAQ PDF.js — navigateurs pris en charge](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
- [Versions PDF.js](https://github.com/mozilla/pdf.js/releases)

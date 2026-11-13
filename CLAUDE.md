# PDF — Instructions pour Claude Code

Dépôt : `PierrePROUST/PDF` (repris le 10 novembre 2026 de `PierrePROUST/LecteurPDF`, dont l'installation sur Android restait bloquée).
Adresse : https://pierreproust.github.io/PDF/ — l'origine `pierreproust.github.io` est partagée avec d'autres PWA (LecteurPDF, VASLweb…) : caches et base IndexedDB doivent garder le préfixe propre `pdfapp`.
Type d'application : **PWA (Progressive Web App)**, utilisée principalement sur **Android avec Chrome**, installée sur l'écran d'accueil. Usage personnel.
Hébergement : **GitHub Pages** du dépôt (HTTPS obligatoire pour le service worker).

## Règle générale : ne rien inventer

- Avant d'ajouter une dépendance npm, vérifie qu'elle existe, son **nom exact**, sa **dernière version** et sa **licence**. N'écris jamais une version de mémoire.
- Avant d'utiliser une API (PDF.js ou API web), vérifie qu'elle existe dans la version utilisée **et** qu'elle est prise en charge par Chrome sur Android. Si ce n'est pas le cas, **arrête-toi et signale-le** au lieu de la simuler.
- Si une exigence ci-dessous est ambiguë, pose la question plutôt que de choisir à ma place.

## Objectif fonctionnel

Un lecteur PDF simple qui fait bien trois choses :

1. **Table des matières** : afficher la table des matières intégrée au PDF (appelée aussi « outline » ou « signets » dans la norme PDF), sous forme d'arbre dépliable. Toucher une entrée amène à la page cible.
2. **Navigation par signets** : en plus de la table des matières du PDF, je peux poser mes propres signets (emplacement + titre libre), les lister, les renommer, les supprimer et y sauter.
3. **Retour arrière vers l'emplacement d'origine** : chaque saut (entrée de table des matières, signet perso, lien interne du PDF, saisie d'un numéro de page) mémorise l'endroit exact où j'étais avant le saut. Un bouton « Retour » **et le bouton/geste retour d'Android** me ramènent à cet endroit. Plusieurs sauts successifs s'empilent. Prévoir aussi « Avancer » (comme un navigateur web).

Fonctions secondaires (V1 minimale) :
- Ouvrir un PDF depuis le sélecteur de fichiers.
- Recevoir un PDF via le menu **« Partager »** d'Android (voir « Ouverture des fichiers »).
- Défilement vertical continu, zoom par pincement.
- Fonctionne **hors ligne** une fois installée.
- Liste des documents récents et reprise à la dernière position lue.

Hors périmètre V1 : annotations, édition du contenu, formulaires, recherche plein texte (V2 éventuelle).

## Fabrication de PDF (ajoutée le 13 novembre 2026)

- **Ne jamais modifier un PDF d'origine** : on produit toujours un nouveau fichier, enregistré dans Téléchargements (`<a download>`) puis ouvert dans le lecteur.
- **Extraire des pages** : bouton de la barre du lecteur ; vignettes de toutes les pages avec case à cocher (dessin paresseux, mémoire libérée hors écran), nom du nouveau PDF demandé.
- **Assembler un dossier** : bouton de l'accueil, `<input type="file" webkitdirectory>` — choix fait par l'utilisateur : dossier seul. Le choix d'un dossier n'existe sur Chrome Android qu'à partir de la **version 132** (données MDN) : en dessous, un avertissement s'affiche et le sélecteur ne propose que des fichiers. Ordre : noms de fichiers, tri « naturel ».
- Écriture des PDF : **`@cantoo/pdf-lib`** (reprise maintenue de pdf-lib, licence MIT), version exacte dans `package.json`, chargée par import dynamique. PDF.js reste le seul moteur de lecture et d'affichage.

## Définition précise de « l'emplacement »

Un emplacement = `(identifiant du document, index de page, décalage vertical dans la page en fraction 0..1, niveau de zoom, décalage horizontal dans la page en fraction 0..1)`.
C'est cette structure qui est empilée dans l'historique de navigation et enregistrée dans les signets perso. Le retour doit me remettre au même endroit visuel, pas seulement au début de la page — y compris dans la bonne colonne en mode colonnes.
Le décalage horizontal (`x`) a été ajouté le 12 novembre 2026 : les emplacements enregistrés avant n'en ont pas, la position horizontale n'est alors pas modifiée.

Identifiant du document = empreinte du contenu (hash SHA-256 via `crypto.subtle`), pour que mes signets suivent le fichier même s'il est rouvert depuis un autre endroit.

## Choix techniques

- **Moteur PDF : PDF.js** (`pdfjs-dist`, Mozilla, licence Apache 2.0). API à utiliser, à vérifier dans la version installée :
  - `pdfDocument.getOutline()` : arbre de la table des matières (peut être `null`).
  - Chaque entrée a un `dest` qui peut être une **chaîne** (destination nommée → `getDestination(dest)`) ou **directement un tableau** de destination. Gérer les deux cas, puis `getPageIndex(ref)` pour obtenir l'index de page. Exploiter aussi les coordonnées de la destination (type `XYZ`, etc.) pour arriver au bon endroit dans la page, pas seulement en haut.
  - Les entrées peuvent avoir une `url` externe au lieu d'un `dest` : les ouvrir dans le navigateur, sans les compter comme saut interne.
  - Liens internes des pages : via la couche d'annotations de PDF.js. Les intercepter pour qu'ils passent par l'historique.
  - Décider avec moi : utiliser les composants de visionneuse fournis par `pdfjs-dist` (`PDFViewer`, `PDFLinkService`…) **ou** un rendu maison canvas page par page. Présenter les deux options avec leurs limites avant de coder.
- Le worker PDF.js doit être servi localement (pas de CDN), pour le hors-ligne.
- Outillage proposé : **Vite + TypeScript**, sans framework d'interface sauf justification. Plugin PWA seulement s'il est vérifié et maintenu ; sinon `manifest.webmanifest` + service worker écrits à la main.
- Stockage local : **IndexedDB** (signets perso, dernière position, liste des récents). **Aucune copie du PDF n'est gardée** (décision du 13 novembre 2026) : toucher un récent fait re-choisir le fichier, retrouvé par son empreinte. Les anciennes copies (magasin `fichiers`) restent lisibles jusqu'à ce que l'utilisateur les efface ; ne plus en créer. Garder un accès au fichier d'origine (`showOpenFilePicker`) n'existe sur Chrome Android qu'à partir de la version 132 : ne pas l'utiliser tant que le minimum est 125. Demander `navigator.storage.persist()` et afficher l'espace utilisé. Permettre de supprimer un document de la liste.
- Pas de serveur, pas d'envoi de données : tout reste sur le téléphone.

## Compatibilité

- **Appareil cible : tablette Huawei SHT-AL09** (Android ancien, sans services Google à jour : Chrome peut y rester bloqué sur une ancienne version).
- **Chrome 125 minimum.** Toute API web ou fonction JavaScript/CSS utilisée doit exister dans Chrome 125 pour Android (vérifier dans les données de compatibilité MDN, `@mdn/browser-compat-data`). Sinon : s'arrêter et le signaler.
- **PDF.js legacy obligatoire** : importer uniquement `pdfjs-dist/legacy/build/pdf.mjs`, `pdfjs-dist/legacy/build/pdf.worker.min.mjs`, `pdfjs-dist/legacy/web/pdf_viewer.mjs` et `pdfjs-dist/legacy/web/pdf_viewer.css`. La version « moderne » appelle directement des API absentes des Chrome anciens (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`, `Uint8Array.fromBase64`…) ; la version legacy contient les polyfills (FAQ PDF.js : legacy = Chrome 125+).
- Vite : `build.target: "chrome125"` (s'applique aussi au CSS). Ne pas le relever.
- Toute erreur au démarrage (PDF.js, service worker, script) doit s'afficher **à l'écran** avec le texte de l'erreur et `navigator.userAgent` (bandeau rouge d'`index.html`, fonction `afficherErreur`) : la tablette n'a pas d'outils de développement.
- Ne jamais écrire « testé sur la tablette » sans que l'utilisateur l'ait fait : préciser à chaque fois ce qui a été testé, avec quel navigateur et quelle version.

## Lecture en colonnes (PDF en deux colonnes)

- Détection automatique à l'ouverture (positions du texte, `page.getTextContent()`, sur quelques pages réparties dans le document) ; si le document est en deux colonnes, le mode s'active tout seul.
- Bouton « Lecture en colonnes » dans la barre : active/désactive ; ce choix est **mémorisé par document** et l'emporte ensuite sur la détection.
- Zoom pour qu'une colonne occupe la largeur de l'écran. Ordre de lecture : gauche → droite → page suivante. Page sans colonnes détectées : parcours en deux moitiés.
- Défilement vertical : arrivé en bas d'une colonne, on passe en haut de la colonne suivante (jamais à la même colonne de la page suivante) ; en remontant, en bas de la colonne précédente. Le balayage horizontal change aussi de colonne. **Pas de flèches ◂ ▸** (supprimées le 12 novembre 2026).
- Le zoom par pincement reste possible en mode colonnes, dans la colonne en cours ; colonne plus large que l'écran : déplacement libre au doigt, balayage coupé.
- Changer de colonne n'est **pas** un saut (rien dans l'historique). Après un saut (table des matières, lien interne, numéro de page), l'écran se recale sur la colonne visée.

## Ouverture des fichiers sur Android

- L'API **File Handling** (`file_handlers` dans le manifeste) n'est **pas prise en charge sur Android** d'après les annonces Chromium consultées : ne pas compter dessus pour « Ouvrir avec ». Vérifier si cela a changé ; sinon ne pas l'utiliser.
- Mettre en place **Web Share Target** (`share_target` dans le manifeste, réception de fichiers en `POST multipart/form-data` traitée par le service worker) pour que « Partager → PDF » fonctionne une fois la PWA installée. Vérifier la prise en charge actuelle sur Chrome Android et la tester.
- Toujours garder le bouton « Ouvrir un PDF » (`<input type="file" accept="application/pdf">`) comme méthode de base.

## Historique de navigation et bouton retour d'Android

- Implémenter une pile Retour/Avancer propre à l'application (tests unitaires dessus).
- La synchroniser avec l'**API History** (`history.pushState` / événement `popstate`) pour que le geste retour d'Android, dans la PWA installée en mode `standalone`, dépile mes sauts au lieu de quitter l'application.
- Quand l'historique de sauts est vide, le retour ramène à la liste des documents.
- Un nouveau saut après un retour efface la branche « Avancer ».

## Plan de travail (une étape = un commit ou une PR identifiable)

0. **Étude** : vérifier les points marqués « à vérifier » ci-dessus (version PDF.js, option visionneuse fournie vs rendu maison, Web Share Target sur Android, File Handling sur Android). Rapport court avec liens. **Attendre ma validation.**
1. **Squelette** : projet Vite + TS, manifeste, icônes, service worker hors-ligne, déploiement automatique sur GitHub Pages par GitHub Actions. Vérifier que Chrome Android propose l'installation.
2. **Ouverture et affichage** : sélecteur de fichier, rendu continu, zoom par pincement, rendu paresseux des pages visibles uniquement (doit rester fluide sur un PDF de 500 pages).
3. **Table des matières** : panneau latéral, arbre dépliable, indentation par niveau, numéro de page affiché, mise en évidence de la section courante. Message clair si le PDF n'en a pas.
4. **Historique de navigation** : pile Retour/Avancer + API History + liens internes.
5. **Signets perso** : ajout depuis la barre d'outils (titre proposé = section courante de la table des matières, modifiable), liste, renommage, suppression, saut (qui alimente aussi l'historique).
6. **Récents, reprise de lecture, Web Share Target.**

## Interface

- Pensée pour le téléphone en mode portrait, cibles tactiles d'au moins 48 px.
- Barre supérieure : titre du document, boutons Table des matières, Signets, Retour (désactivé si historique vide), Avancer.
- Indicateur « page X / N » ; le toucher permet de saisir un numéro de page.
- Après un saut, afficher brièvement un bandeau « ← Revenir à la page X » cliquable.
- Interface en français. Thème clair et sombre selon le réglage du téléphone.

## Tests

- Tests unitaires (Vitest) de la pile d'historique et de la résolution des destinations de la table des matières (chaîne vs tableau).
- PDF de test dans le dépôt : un **avec** table des matières imbriquée et liens internes, un **sans** table des matières. Les générer par script ou utiliser des fichiers sous licence libre ; indiquer la source.
- Avant chaque étape terminée : vérification manuelle sur Chrome Android décrite dans la PR (ce qui a été testé, sur quel appareil/version si possible).

## Conventions

- Messages de commit en français, courts, au présent.
- Mettre à jour le `README.md` (adresse de la PWA, comment l'installer sur Android, fonctions disponibles) à chaque étape.

# PDF

PWA de lecture de PDF pour Android (Chrome) : table des matières, signets perso, retour à l'emplacement d'origine.

- **Adresse** : https://pierreproust.github.io/PDF/
- Tout reste sur le téléphone : aucun serveur, aucun envoi de données.

## Installer sur Android

1. Ouvrir l'adresse ci-dessus dans **Chrome**.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** → **Installer**.
3. Lancer PDF depuis l'icône : l'application s'ouvre en plein écran et fonctionne hors ligne.

## Fonctions disponibles

- Installation en PWA, fonctionnement hors ligne (étape 1).
- Ouvrir un PDF (bouton « Ouvrir un PDF »), défilement vertical continu, zoom par pincement à deux doigts, rendu paresseux (seules les pages visibles sont dessinées). Toucher « page X / N » pour aller à une page (étape 2).
- Table des matières du PDF (bouton ☰ à puces) : arbre dépliable, indentation par niveau, numéro de page, section courante mise en évidence. Toucher une entrée amène à l'endroit exact visé dans la page. Les entrées vers une adresse web s'ouvrent dans le navigateur (étape 3).
- Retour à l'emplacement d'origine : chaque saut (table des matières, signet, lien interne du PDF, numéro de page) mémorise l'endroit exact (page, hauteur dans la page, zoom). Les boutons ← / → de la barre **et le geste retour d'Android** reviennent en arrière ou avancent, comme dans un navigateur. Après un saut, un bandeau « ← Revenir à la page X » s'affiche quelques secondes. Quand il n'y a plus de saut à défaire, le retour ramène à la liste des documents (étape 4).
- Signets perso (bouton signet) : « + Ajouter un signet ici » mémorise l'emplacement exact ; le titre proposé est celui de la section courante de la table des matières, modifiable. Liste triée par position, renommage, suppression, saut (qui alimente aussi l'historique Retour). Les signets sont rattachés à l'empreinte du fichier : ils le suivent même s'il est rouvert depuis un autre endroit (étape 5).
- Documents récents sur l'écran d'accueil, avec reprise à la dernière position lue. Une copie du PDF est gardée dans l'application (sur Android, une PWA ne garde pas l'accès au fichier d'origine) ; l'icône corbeille retire un document de la liste et efface sa copie et ses signets. L'espace utilisé est affiché, et le stockage persistant est demandé au premier enregistrement (étape 6).
- Recevoir un PDF depuis une autre application : **Partager → PDF** (PWA installée uniquement, Web Share Target) (étape 6).

- **Lecture en colonnes** pour les PDF en deux colonnes (livres de règles, articles) : détectée automatiquement à l'ouverture, une colonne occupe la largeur de l'écran ; ◂ ▸ ou balayage horizontal pour changer de colonne. Le bouton à deux colonnes de la barre active ou coupe le mode, et ce choix est retenu pour chaque document. Retour, signets et reprise de lecture retrouvent la bonne colonne.

- Espace de stockage : l'écran d'accueil détaille l'espace par application. Le site `pierreproust.github.io` est partagé avec l'ancien LecteurPDF et VASLweb, et le total affiché par Chrome les inclut. Un bouton efface les données de l'ancien LecteurPDF.

Non disponible en V1 : annotations, édition, formulaires, recherche plein texte. « Ouvrir avec » n'est pas possible : l'API File Handling n'existe pas sur Chrome Android ([étude](docs/etude.md)).

## Compatibilité

- Appareil cible : tablette **Huawei SHT-AL09**. **Chrome 125 minimum.**
- PDF.js est importé en version **legacy** (`pdfjs-dist/legacy/…`), qui contient les polyfills des API absentes des Chrome anciens (`Map.prototype.getOrInsertComputed`, `Math.sumPrecise`…).
- Limite dure : même en legacy, PDF.js dimensionne les pages avec la fonction CSS `round()`, disponible seulement depuis Chrome 125. En dessous, les pages s'affichent écrasées.
- En cas d'erreur au démarrage (script, PDF.js, service worker) ou de Chrome < 125, un **bandeau rouge** affiche l'erreur et la version du navigateur.

## Vérifications faites

Pour chaque étape, vérification automatisée dans Chromium (Playwright) avec l'émulation d'un **Pixel 7** (écran tactile, mode portrait). **Aucun test n'a encore été fait sur un vrai téléphone Android.**

| Étape | Vérifié |
|---|---|
| 1 | Aucune erreur d'installabilité (DevTools `Page.getInstallabilityErrors`), manifeste sans erreur, application rechargée **hors ligne** |
| 2 | PDF de 500 pages : premier affichage ≈ 0,5 s, 6 pages dessinées sur 500 après défilement jusqu'au milieu ; pincement à deux doigts (événements tactiles simulés) : zoom ×3 |
| 3 | Arbre complet, destinations nommées et explicites, arrivée au milieu de la page visée, section courante, message pour un PDF sans table des matières |
| 4 | Suite de sauts (table des matières, numéro de page, lien interne du PDF) puis retours par `history.back()` (équivalent du geste retour) : retour au pixel près, Avancer, branche effacée après un nouveau saut, retour à la liste quand la pile est vide |
| 5 | Signet (titre proposé = section courante), saut avec restauration du zoom (à 1–2 px près, arrondi d'échelle), retour, renommage, suppression, conservation après rechargement |
| 6 | Reprise de lecture après fermeture de l'onglet, liste des récents, suppression, partage simulé (formulaire `POST multipart/form-data` vers `./partage`, intercepté par le service worker), ouverture hors ligne, thème sombre |

### À vérifier sur le téléphone (Chrome Android)

1. Chrome propose bien « Installer l'application ».
2. Une fois installée : **Partager** un PDF depuis Fichiers ou Gmail → « PDF » apparaît et ouvre le document.
3. Le **geste retour** d'Android dépile les sauts, puis revient à la liste, puis quitte l'application. Chrome peut ignorer, au retour, les entrées d'historique ajoutées sans action de l'utilisateur : ce cas peut se produire pour un document reçu par partage.
4. Le zoom par pincement est fluide sur un gros PDF.
5. Le stockage persistant est accordé (message sous la liste des récents).

## Historique

Ce dépôt reprend le code de [LecteurPDF](https://github.com/PierrePROUST/LecteurPDF) (étapes 0 à 6) sous une nouvelle adresse : sur le téléphone, Chrome considérait LecteurPDF comme « déjà installée » sans pouvoir l'ouvrir. Les caches et la base IndexedDB portent le préfixe `pdfapp` pour ne pas entrer en conflit avec les autres PWA du même site (`pierreproust.github.io`).

## Développement

```sh
npm install
npm run dev        # serveur de développement
npm test           # tests unitaires (Vitest)
npm run build      # build de production dans dist/ (+ génération de dist/sw.js)
npm run preview    # sert dist/ localement
```

- Vite + TypeScript, sans framework d'interface. Moteur PDF : `pdfjs-dist` (version figée).
- Le service worker (`src/sw.js`) est un modèle : la liste des fichiers à mettre en cache et la version sont injectées au build par `vite.config.ts`. Les ressources de PDF.js (polices standard, CMaps, wasm) sont copiées dans `dist/pdfjs/` pour le hors-ligne.
- Icônes : `node outils/generer-icones.mjs` (à partir de `outils/icone.svg`, nécessite Playwright).

### PDF de test

`npm run pdf-test` régénère `pdf-test/avec-tdm.pdf` (table des matières imbriquée sur 3 niveaux, destinations nommées et explicites `XYZ`/`FitH`, liens internes, lien externe) et `pdf-test/sans-tdm.pdf`, ainsi que `pdf-test/deux-colonnes.pdf` (mise en page en deux colonnes, titres pleine largeur, une page de tableau pleine largeur, entrées de table des matières visant la colonne de droite). Ils sont produits par `outils/generer-pdf-test.mjs`, sans dépendance, et appartiennent au dépôt.
`python3 outils/generer-pdf-images.py` régénère `pdf-test/images.pdf` : une page par type d'image (Flate, JPEG RVB/CMJN/gris, JPEG 2000, transparence, grande photo), centre de chaque image en jaune.
Pour tester la fluidité : `node outils/generer-pdf-test.mjs --gros 500 gros.pdf`.

### Déploiement

Chaque push sur `main` lance `.github/workflows/deploiement.yml` (tests, build, publication).
À faire une fois : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

Étude préalable et choix techniques : [docs/etude.md](docs/etude.md). Instructions : [CLAUDE.md](CLAUDE.md).

// Génère les icônes PNG de la PWA à partir de outils/icone.svg.
// Usage ponctuel : node outils/generer-icones.mjs (nécessite Playwright + Chromium).
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const svg = await readFile(new URL("./icone.svg", import.meta.url), "utf8");
const navigateur = await chromium.launch();
const page = await navigateur.newPage();
const sorties = [
  { fichier: "icone-192.png", taille: 192, marge: 0 },
  { fichier: "icone-512.png", taille: 512, marge: 0 },
  // Zone de sécurité des icônes masquables : contenu dans le cercle central de 80 %.
  { fichier: "icone-masquable-512.png", taille: 512, marge: 0.12 },
  { fichier: "apple-touch-icon.png", taille: 180, marge: 0 },
];
for (const { fichier, taille, marge } of sorties) {
  await page.setViewportSize({ width: taille, height: taille });
  const interieur = Math.round(taille * (1 - 2 * marge));
  await page.setContent(
    `<body style="margin:0;background:#1f2933;display:grid;place-items:center;width:${taille}px;height:${taille}px">` +
      `<div style="width:${interieur}px;height:${interieur}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: new URL(`../public/icones/${fichier}`, import.meta.url).pathname });
}
await navigateur.close();

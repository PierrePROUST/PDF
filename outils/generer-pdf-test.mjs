// Génère les PDF de test du dépôt, sans aucune dépendance (PDF écrit « à la main »).
//
//   node outils/generer-pdf-test.mjs              → pdf-test/avec-tdm.pdf, sans-tdm.pdf et deux-colonnes.pdf
//   node outils/generer-pdf-test.mjs --gros 500 F → F : PDF de 500 pages avec table des matières (test de fluidité)
//
// Contenu de avec-tdm.pdf :
//   - table des matières imbriquée sur 3 niveaux ;
//   - destinations explicites (tableaux) ET nommées (chaînes), de types XYZ et FitH,
//     pointant au milieu des pages (pour vérifier l'arrivée au bon endroit) ;
//   - une entrée vers une URL externe ;
//   - un sommaire (page 2) avec liens internes, et des liens « retour au sommaire ».
// Licence : ces fichiers sont générés par ce script, ils appartiennent au dépôt.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const LARGEUR = 595; // A4 en points
const HAUTEUR = 842;

// Caractères WinAnsi hors latin-1 utilisés dans les textes.
const WINANSI = { "\u2014": "\x97", "\u2013": "\x96", "\u2019": "\x92", "\u2026": "\x85" };

/** Chaîne PDF littérale en WinAnsi, avec échappements. */
function texteLatin1(s) {
  const converti = [...s].map((c) => WINANSI[c] ?? (c.charCodeAt(0) < 256 ? c : "?")).join("");
  return "(" + converti.replace(/[\\()]/g, (c) => "\\" + c) + ")";
}

/** Chaîne PDF en UTF-16BE (pour les titres de la table des matières). */
function texteUnicode(s) {
  let hex = "FEFF";
  for (const c of s) {
    const code = c.codePointAt(0);
    hex += code.toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

class EcrivainPdf {
  objets = [];
  reserver() {
    this.objets.push(null);
    return this.objets.length; // numéro d'objet
  }
  definir(num, contenu) {
    this.objets[num - 1] = contenu;
  }
  ajouter(contenu) {
    const n = this.reserver();
    this.definir(n, contenu);
    return n;
  }
  flux(texte, dico = "") {
    const octets = Buffer.from(texte, "latin1");
    return { flux: octets, dico };
  }
  generer(racine) {
    const morceaux = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    let position = morceaux[0].length;
    const decalages = [];
    this.objets.forEach((o, i) => {
      decalages.push(position);
      let b;
      if (o && typeof o === "object" && o.flux) {
        b = Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n<< /Length ${o.flux.length} ${o.dico} >>\nstream\n`, "latin1"),
          o.flux,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]);
      } else {
        b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
      }
      morceaux.push(b);
      position += b.length;
    });
    let xref = `xref\n0 ${this.objets.length + 1}\n0000000000 65535 f \n`;
    for (const d of decalages) xref += `${String(d).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${this.objets.length + 1} /Root ${racine} 0 R >>\nstartxref\n${position}\n%%EOF\n`;
    morceaux.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(morceaux);
  }
}

/**
 * Construit un document.
 * @param {object} p
 * @param {number} p.nbPages
 * @param {(page: number) => {lignes: {x:number,y:number,taille:number,texte:string}[], liens?: {rect:number[], dest?:string|{page:number,y:number}, uri?:string}[]}} p.page
 * @param {Array} [p.tdm] arbre : {titre, dest?: {page, y, type?} | string, uri?, enfants?}
 * @param {Record<string, {page:number,y:number}>} [p.nommees] destinations nommées
 */
function construire({ nbPages, page, tdm, nommees = {} }) {
  const w = new EcrivainPdf();
  const catalogue = w.reserver();
  const arbrePages = w.reserver();
  const police = w.ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const policeGrasse = w.ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const numerosPages = Array.from({ length: nbPages }, () => w.reserver());

  const destExplicite = (d) => {
    const ref = `${numerosPages[d.page]} 0 R`;
    if (d.type === "FitH") return `[${ref} /FitH ${d.y}]`;
    return `[${ref} /XYZ ${d.x ?? 0} ${d.y} null]`;
  };
  const destPdf = (d) => (typeof d === "string" ? texteLatin1(d) : destExplicite(d));

  for (let i = 0; i < nbPages; i++) {
    const { lignes, liens = [] } = page(i);
    let contenu = "";
    for (const l of lignes) {
      contenu += `BT /${l.gras ? "F2" : "F1"} ${l.taille} Tf ${l.x} ${l.y} Td ${texteLatin1(l.texte)} Tj ET\n`;
    }
    const flux = w.ajouter(w.flux(contenu));
    const annots = liens.map((l) => {
      const action = l.uri
        ? `/A << /S /URI /URI ${texteLatin1(l.uri)} >>`
        : `/Dest ${destPdf(l.dest)}`;
      return w.ajouter(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.join(" ")}] /Border [0 0 0] ${action} >>`);
    });
    w.definir(
      numerosPages[i],
      `<< /Type /Page /Parent ${arbrePages} 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] ` +
        `/Resources << /Font << /F1 ${police} 0 R /F2 ${policeGrasse} 0 R >> >> /Contents ${flux} 0 R` +
        (annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : "") +
        " >>",
    );
  }
  w.definir(arbrePages, `<< /Type /Pages /Kids [${numerosPages.map((n) => `${n} 0 R`).join(" ")}] /Count ${nbPages} >>`);

  let extraCatalogue = "";
  const noms = Object.keys(nommees).sort();
  if (noms.length) {
    const tableau = noms.map((n) => `${texteLatin1(n)} ${destExplicite(nommees[n])}`).join(" ");
    const dests = w.ajouter(`<< /Names [${tableau}] >>`);
    extraCatalogue += ` /Names << /Dests ${dests} 0 R >>`;
  }

  if (tdm) {
    const racineTdm = w.reserver();
    const construireNiveau = (elements, parent) => {
      const nums = elements.map(() => w.reserver());
      let total = 0;
      elements.forEach((e, i) => {
        let champs = `/Title ${texteUnicode(e.titre)} /Parent ${parent} 0 R`;
        if (i > 0) champs += ` /Prev ${nums[i - 1]} 0 R`;
        if (i < nums.length - 1) champs += ` /Next ${nums[i + 1]} 0 R`;
        if (e.uri) champs += ` /A << /S /URI /URI ${texteLatin1(e.uri)} >>`;
        else champs += ` /Dest ${destPdf(e.dest)}`;
        if (e.enfants?.length) {
          const r = construireNiveau(e.enfants, nums[i]);
          // Count positif : entrée dépliée par défaut ; négatif : repliée.
          champs += ` /First ${r.premier} 0 R /Last ${r.dernier} 0 R /Count ${e.replie ? -r.total : r.total}`;
          if (!e.replie) total += r.total;
        }
        w.definir(nums[i], `<< ${champs} >>`);
        total += 1;
      });
      return { premier: nums[0], dernier: nums[nums.length - 1], total };
    };
    const r = construireNiveau(tdm, racineTdm);
    w.definir(racineTdm, `<< /Type /Outlines /First ${r.premier} 0 R /Last ${r.dernier} 0 R /Count ${r.total} >>`);
    extraCatalogue += ` /Outlines ${racineTdm} 0 R /PageMode /UseOutlines`;
  }
  w.definir(catalogue, `<< /Type /Catalog /Pages ${arbrePages} 0 R${extraCatalogue} >>`);
  return w.generer(catalogue);
}

function lignesCorps(debutY, finY, graine) {
  const lignes = [];
  for (let y = debutY, n = 0; y > finY; y -= 16, n++) {
    lignes.push({
      x: 56,
      y,
      taille: 10,
      texte: `Ligne ${graine}.${n + 1} — texte de remplissage pour vérifier le défilement et le zoom.`,
    });
  }
  return lignes;
}

// ---------- avec-tdm.pdf ----------
function documentAvecTdm() {
  // 4 chapitres × 3 sections ; chaque section occupe une demi-page.
  // Page 0 : couverture, page 1 : sommaire, puis 6 pages par chapitre (1 page d'intro + 3 sections × 2 demi-pages… simplifié).
  const chapitres = [];
  let pageCourante = 2;
  for (let c = 1; c <= 4; c++) {
    const ch = { numero: c, page: pageCourante, sections: [] };
    pageCourante += 1; // page de titre du chapitre
    for (let s = 1; s <= 3; s++) {
      // Section en haut (y=760) ou au milieu (y=420) de la page.
      const enHaut = s % 2 === 1;
      const sec = { numero: s, page: pageCourante, y: enHaut ? 780 : 440, sousSections: [] };
      for (let t = 1; t <= 2; t++) {
        sec.sousSections.push({ numero: t, page: pageCourante + 1, y: t === 1 ? 780 : 440 });
      }
      ch.sections.push(sec);
      pageCourante += 2;
    }
    chapitres.push(ch);
  }
  const nbPages = pageCourante + 1; // + annexe
  const pageAnnexe = pageCourante;

  const nommees = {};
  const tdm = [{ titre: "Couverture", dest: { page: 0, y: HAUTEUR } }, { titre: "Sommaire", dest: "sommaire" }];
  nommees.sommaire = { page: 1, y: HAUTEUR };
  for (const ch of chapitres) {
    const nomCh = `chapitre-${ch.numero}`;
    nommees[nomCh] = { page: ch.page, y: HAUTEUR };
    tdm.push({
      titre: `Chapitre ${ch.numero} — Thème ${"ABCD"[ch.numero - 1]}`,
      // Chapitres pairs : destination nommée (chaîne) ; impairs : tableau explicite.
      dest: ch.numero % 2 === 0 ? nomCh : { page: ch.page, y: HAUTEUR },
      replie: ch.numero === 4,
      enfants: ch.sections.map((sec) => {
        const nomSec = `section-${ch.numero}-${sec.numero}`;
        nommees[nomSec] = { page: sec.page, y: sec.y + 20 };
        return {
          titre: `${ch.numero}.${sec.numero} Section ${sec.numero} (page ${sec.page + 1}, ${sec.y > 600 ? "haut" : "milieu"})`,
          dest: sec.numero === 2 ? nomSec : { page: sec.page, y: sec.y + 20, type: sec.numero === 3 ? "FitH" : "XYZ" },
          enfants: sec.sousSections.map((ss) => ({
            titre: `${ch.numero}.${sec.numero}.${ss.numero} Sous-section`,
            dest: { page: ss.page, y: ss.y + 20 },
          })),
        };
      }),
    });
  }
  tdm.push({ titre: "Annexe", dest: { page: pageAnnexe, y: HAUTEUR } });
  tdm.push({ titre: "Lien externe (pdf.js sur GitHub)", uri: "https://github.com/mozilla/pdf.js" });

  // Contenu des pages
  const contenus = Array.from({ length: nbPages }, () => ({ lignes: [], liens: [] }));
  const ajouterTitre = (p, y, texte, taille = 20) => contenus[p].lignes.push({ x: 56, y, taille, gras: true, texte });

  ajouterTitre(0, 600, "Document de test PDF", 28);
  contenus[0].lignes.push({ x: 56, y: 560, taille: 12, texte: "Table des matières imbriquée, destinations nommées et explicites, liens internes." });

  ajouterTitre(1, 780, "Sommaire");
  let ySommaire = 740;
  for (const ch of chapitres) {
    contenus[1].lignes.push({ x: 56, y: ySommaire, taille: 14, gras: true, texte: `Chapitre ${ch.numero} ........ page ${ch.page + 1}` });
    contenus[1].liens.push({ rect: [50, ySommaire - 6, 400, ySommaire + 16], dest: ch.numero % 2 === 0 ? `chapitre-${ch.numero}` : { page: ch.page, y: HAUTEUR } });
    ySommaire -= 26;
    for (const sec of ch.sections) {
      contenus[1].lignes.push({ x: 80, y: ySommaire, taille: 12, texte: `Section ${ch.numero}.${sec.numero} ........ page ${sec.page + 1}` });
      contenus[1].liens.push({ rect: [74, ySommaire - 6, 400, ySommaire + 14], dest: `section-${ch.numero}-${sec.numero}` });
      ySommaire -= 22;
    }
    ySommaire -= 8;
  }
  contenus[1].lignes.push({ x: 56, y: ySommaire - 10, taille: 12, texte: "Annexe ........ (lien interne)" });
  contenus[1].liens.push({ rect: [50, ySommaire - 16, 400, ySommaire + 4], dest: { page: pageAnnexe, y: HAUTEUR } });
  contenus[1].lignes.push({ x: 56, y: ySommaire - 40, taille: 12, texte: "Lien externe : https://github.com/mozilla/pdf.js" });
  contenus[1].liens.push({ rect: [50, ySommaire - 46, 400, ySommaire - 26], uri: "https://github.com/mozilla/pdf.js" });

  for (const ch of chapitres) {
    ajouterTitre(ch.page, 780, `Chapitre ${ch.numero}`, 26);
    contenus[ch.page].lignes.push(...lignesCorps(740, 120, `C${ch.numero}`));
    for (const sec of ch.sections) {
      ajouterTitre(sec.page, sec.y, `Section ${ch.numero}.${sec.numero}`);
      contenus[sec.page].lignes.push({ x: 360, y: sec.y, taille: 11, texte: "Retour au sommaire" });
      contenus[sec.page].liens.push({ rect: [355, sec.y - 6, 540, sec.y + 14], dest: "sommaire" });
      contenus[sec.page].lignes.push(...lignesCorps(sec.y - 30, sec.y - 300, `S${ch.numero}.${sec.numero}`));
      for (const ss of sec.sousSections) {
        ajouterTitre(ss.page, ss.y, `Sous-section ${ch.numero}.${sec.numero}.${ss.numero}`, 16);
        contenus[ss.page].lignes.push(...lignesCorps(ss.y - 30, ss.y - 300, `T${ch.numero}.${sec.numero}.${ss.numero}`));
      }
    }
  }
  ajouterTitre(pageAnnexe, 780, "Annexe", 26);
  contenus[pageAnnexe].lignes.push(...lignesCorps(740, 120, "A"));

  for (let p = 0; p < nbPages; p++) {
    contenus[p].lignes.push({ x: LARGEUR / 2 - 20, y: 30, taille: 10, texte: `— ${p + 1} —` });
  }
  return construire({ nbPages, page: (i) => contenus[i], tdm, nommees });
}

// ---------- deux-colonnes.pdf ----------
// Mise en page de type « livre de règles » : titre pleine largeur, deux colonnes de texte,
// une page de tableau pleine largeur (sans colonnes), et une table des matières dont
// certaines entrées visent la colonne de droite (destination XYZ avec x = début de colonne).
function documentDeuxColonnes() {
  const nbPages = 6;
  const G = 42; // bord gauche, colonne gauche
  const D = 312; // bord gauche, colonne droite
  const largeurCol = 241;
  const mots = "règle unité tir moral terrain portée coût mouvement phase joueur pion case attaque défense ligne".split(" ");
  const ligne = (graine) => {
    let t = "";
    for (let k = 0; t.length < 46; k++) t += (t ? " " : "") + mots[(graine * 7 + k * 3) % mots.length];
    return t;
  };
  const colonne = (x, haut, bas, prefixe) => {
    const l = [];
    for (let y = haut, n = 1; y > bas; y -= 12, n++) l.push({ x, y, taille: 9, texte: n % 9 === 0 ? "" : `${prefixe}.${n} ${ligne(n + prefixe.length)}` });
    return l.filter((e) => e.texte);
  };
  const pages = [];
  const nommees = {};
  const tdm = [];
  for (let i = 0; i < nbPages; i++) {
    const lignes = [];
    const liens = [];
    if (i === 3) {
      // Page pleine largeur : tableau, pas de colonnes.
      lignes.push({ x: G, y: 790, taille: 16, gras: true, texte: "Tableau récapitulatif (pleine largeur)" });
      for (let r = 0; r < 40; r++) {
        lignes.push({ x: G, y: 750 - r * 16, taille: 9, texte: `Ligne ${r + 1} — ${ligne(r)} — ${ligne(r + 5)} — ${ligne(r + 9)}`.slice(0, 120) });
      }
    } else {
      lignes.push({ x: G, y: 800, taille: 15, gras: true, texte: `CHAPITRE ${i + 1} — TITRE PLEINE LARGEUR SUR LES DEUX COLONNES` });
      lignes.push({ x: G, y: 770, taille: 11, gras: true, texte: `${i + 1}.1 Colonne gauche` });
      lignes.push(...colonne(G, 752, 60, `G${i + 1}`));
      lignes.push({ x: D, y: 770, taille: 11, gras: true, texte: `${i + 1}.2 Colonne droite (haut)` });
      lignes.push(...colonne(D, 752, 430, `D${i + 1}`));
      lignes.push({ x: D, y: 410, taille: 11, gras: true, texte: `${i + 1}.3 Colonne droite (milieu)` });
      lignes.push(...colonne(D, 392, 60, `M${i + 1}`));
      nommees[`c${i + 1}-3`] = { page: i, y: 425, x: D };
      // Lien interne en colonne gauche vers la section .3 (colonne droite) de la page suivante.
      if (i + 1 < nbPages && i + 1 !== 3) {
        lignes.push({ x: G, y: 40, taille: 9, texte: `Voir ${i + 2}.3 (colonne droite, page ${i + 2})` });
        liens.push({ rect: [G - 2, 36, G + largeurCol, 50], dest: `c${i + 2}-3` });
      }
      tdm.push({
        titre: `Chapitre ${i + 1}`,
        dest: { page: i, y: 842 },
        enfants: [
          { titre: `${i + 1}.1 Colonne gauche`, dest: { page: i, y: 785 } },
          { titre: `${i + 1}.2 Colonne droite (haut)`, dest: { page: i, y: 785, x: D } },
          { titre: `${i + 1}.3 Colonne droite (milieu)`, dest: `c${i + 1}-3` },
        ],
      });
    }
    lignes.push({ x: LARGEUR / 2 - 10, y: 22, taille: 9, texte: String(i + 1) });
    pages.push({ lignes, liens });
  }
  tdm.splice(3, 0, { titre: "Tableau récapitulatif", dest: { page: 3, y: 842 } });
  return construire({ nbPages, page: (i) => pages[i], tdm, nommees });
}

// ---------- sans-tdm.pdf ----------
function documentSansTdm(nbPages = 12) {
  return construire({
    nbPages,
    page: (i) => ({
      lignes: [
        { x: 56, y: 780, taille: 22, gras: true, texte: `Page ${i + 1} (document sans table des matières)` },
        ...lignesCorps(740, 60, `P${i + 1}`),
      ],
    }),
  });
}

// ---------- gros PDF (fluidité) ----------
function grosDocument(nbPages) {
  const tdm = [];
  for (let c = 0; c < nbPages; c += 25) {
    tdm.push({
      titre: `Partie ${c / 25 + 1}`,
      dest: { page: c, y: HAUTEUR },
      enfants: Array.from({ length: Math.min(5, Math.ceil((nbPages - c) / 5)) }, (_, k) => ({
        titre: `Partie ${c / 25 + 1}, chapitre ${k + 1}`,
        dest: { page: Math.min(nbPages - 1, c + k * 5), y: 420 },
      })),
    });
  }
  return construire({
    nbPages,
    tdm,
    page: (i) => ({
      lignes: [{ x: 56, y: 780, taille: 22, gras: true, texte: `Page ${i + 1} / ${nbPages}` }, ...lignesCorps(740, 60, `G${i + 1}`)],
    }),
  });
}

async function ecrire(chemin, octets) {
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, octets);
  console.log(`${chemin} (${octets.length} octets)`);
}

const args = process.argv.slice(2);
if (args[0] === "--gros") {
  await ecrire(args[2] ?? "gros.pdf", grosDocument(Number(args[1] ?? 500)));
} else {
  await ecrire("pdf-test/avec-tdm.pdf", documentAvecTdm());
  await ecrire("pdf-test/sans-tdm.pdf", documentSansTdm());
  await ecrire("pdf-test/deux-colonnes.pdf", documentDeuxColonnes());
}

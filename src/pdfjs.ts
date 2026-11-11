// Chargement de PDF.js. Les composants de visionneuse (pdf_viewer.mjs) lisent la
// bibliothèque dans globalThis.pdfjsLib : ce module doit être importé avant eux.
// Version « legacy » obligatoire : elle contient les polyfills nécessaires à Chrome 125
// (la version moderne appelle directement des API absentes des Chrome anciens).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Worker servi localement (pas de CDN) pour le hors-ligne.
import urlWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = urlWorker;
(globalThis as unknown as { pdfjsLib: typeof pdfjsLib }).pdfjsLib = pdfjsLib;

// Ressources copiées dans dist/pdfjs/ au build (voir vite.config.ts).
const BASE_RESSOURCES = import.meta.env.DEV ? "/node_modules/pdfjs-dist/" : "./pdfjs/";

export function chargerDocument(donnees: Uint8Array<ArrayBuffer>) {
  return pdfjsLib.getDocument({
    data: donnees,
    cMapUrl: BASE_RESSOURCES + "cmaps/",
    standardFontDataUrl: BASE_RESSOURCES + "standard_fonts/",
    wasmUrl: BASE_RESSOURCES + "wasm/",
    iccUrl: BASE_RESSOURCES + "iccs/",
    enableXfa: false,
  });
}

export { pdfjsLib };

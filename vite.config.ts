import { createHash } from "node:crypto";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const DOSSIER_PDFJS = "node_modules/pdfjs-dist";
// Ressources de PDF.js nécessaires hors ligne (polices standard, CMaps, décodeurs wasm, profils ICC).
const RESSOURCES_PDFJS = ["cmaps", "standard_fonts", "wasm", "iccs"];

async function listerFichiers(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true, recursive: true });
  return entrees.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/**
 * Copie les ressources de PDF.js dans dist/pdfjs/ puis écrit dist/sw.js à partir de
 * src/sw.js en y injectant la liste des fichiers à mettre en cache et une version.
 */
function serviceWorker(): Plugin {
  let dossierSortie = "dist";
  return {
    name: "pdfapp-service-worker",
    apply: "build",
    configResolved(config) {
      dossierSortie = config.build.outDir;
    },
    async closeBundle() {
      for (const r of RESSOURCES_PDFJS) {
        await cp(join(DOSSIER_PDFJS, r), join(dossierSortie, "pdfjs", r), {
          recursive: true,
          // Le bac à sable de scripts (QuickJS) n'est pas utilisé : les scripts PDF sont désactivés.
          filter: (source) => !/quickjs/i.test(source),
        });
      }
      const fichiers = (await listerFichiers(dossierSortie))
        .map((f) => relative(dossierSortie, f).split(sep).join("/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map") && !/(^|\/)LICENSE/.test(f) && !f.startsWith("essais-installation/"))
        .sort();
      const empreinte = createHash("sha256");
      for (const f of fichiers) {
        empreinte.update(f);
        empreinte.update(await readFile(join(dossierSortie, f)));
      }
      const version = empreinte.digest("hex").slice(0, 12);
      const modele = await readFile("src/sw.js", "utf8");
      const code = modele
        .replace("self.__VERSION__", JSON.stringify(version))
        .replace("self.__FICHIERS__", JSON.stringify(["./", ...fichiers.filter((f) => f !== "index.html")]));
      await writeFile(join(dossierSortie, "sw.js"), code);
      console.log(`sw.js : ${fichiers.length} fichiers en cache, version ${version}`);
    },
  };
}

export default defineConfig({
  // Adresse GitHub Pages : https://pierreproust.github.io/PDF/
  base: "./",
  build: {
    target: "es2023",
    chunkSizeWarningLimit: 2000,
  },
  plugins: [serviceWorker()],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

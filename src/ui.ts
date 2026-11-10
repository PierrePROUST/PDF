/** Petits utilitaires d'interface. */

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Élément #${id} absent`);
  return e as T;
}

/**
 * Boîte de saisie (remplace prompt(), peu pratique sur téléphone).
 * Renvoie le texte saisi, ou null si annulé.
 */
export function demander(
  libelle: string,
  valeur = "",
  options: { type?: "text" | "number"; min?: number; max?: number } = {},
): Promise<string | null> {
  const dialogue = el<HTMLDialogElement>("dialogue-saisie");
  const champ = el<HTMLInputElement>("dialogue-champ");
  el("dialogue-libelle").textContent = libelle;
  champ.type = options.type ?? "text";
  champ.inputMode = options.type === "number" ? "numeric" : "text";
  champ.min = options.min !== undefined ? String(options.min) : "";
  champ.max = options.max !== undefined ? String(options.max) : "";
  champ.required = true;
  champ.value = valeur;
  dialogue.returnValue = "";
  return new Promise((resolve) => {
    dialogue.addEventListener(
      "close",
      () => resolve(dialogue.returnValue === "ok" ? champ.value.trim() : null),
      { once: true },
    );
    dialogue.showModal();
    champ.select();
  });
}

let minuterieMessage = 0;
/** Message bref en bas de l'écran de lecture. */
export function afficherMessage(texte: string, duree = 3000): void {
  const m = el("message");
  m.textContent = texte;
  m.hidden = false;
  clearTimeout(minuterieMessage);
  minuterieMessage = window.setTimeout(() => (m.hidden = true), duree);
}

export function formaterTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 ** 2) return `${(octets / 1024).toFixed(0)} Ko`;
  if (octets < 1024 ** 3) return `${(octets / 1024 ** 2).toFixed(1).replace(".", ",")} Mo`;
  return `${(octets / 1024 ** 3).toFixed(2).replace(".", ",")} Go`;
}

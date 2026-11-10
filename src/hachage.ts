/** Empreinte SHA-256 (hexadécimal) d'un contenu, via crypto.subtle (contexte HTTPS requis). */
export async function empreinteSha256(donnees: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const condense = await crypto.subtle.digest("SHA-256", donnees);
  return Array.from(new Uint8Array(condense), (o) => o.toString(16).padStart(2, "0")).join("");
}

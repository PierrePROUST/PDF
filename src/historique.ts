/**
 * Pile de navigation Retour / Avancer, comme dans un navigateur web.
 *
 * - `sauter(origine)` : avant chaque saut, on empile l'endroit qu'on quitte ;
 *   la branche « Avancer » est effacée.
 * - `retour(actuel)` : renvoie l'endroit où revenir et garde `actuel` pour « Avancer ».
 * - `avancer(actuel)` : l'inverse.
 */
export class Historique<T> {
  private arriere: T[] = [];
  private avant: T[] = [];

  get peutRetour(): boolean {
    return this.arriere.length > 0;
  }

  get peutAvancer(): boolean {
    return this.avant.length > 0;
  }

  /** Nombre de sauts empilés (position dans la pile). */
  get profondeur(): number {
    return this.arriere.length;
  }

  /** Endroit où « Retour » ramènerait, sans le dépiler. */
  get precedent(): T | undefined {
    return this.arriere.at(-1);
  }

  sauter(origine: T): void {
    this.arriere.push(origine);
    this.avant = [];
  }

  retour(actuel: T): T | undefined {
    const cible = this.arriere.pop();
    if (cible === undefined) return undefined;
    this.avant.push(actuel);
    return cible;
  }

  avancer(actuel: T): T | undefined {
    const cible = this.avant.pop();
    if (cible === undefined) return undefined;
    this.arriere.push(actuel);
    return cible;
  }

  vider(): void {
    this.arriere = [];
    this.avant = [];
  }
}

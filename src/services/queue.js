// Un seul processus par base. Sérialise mutations, tâches planifiées et interactions par serveur.
export class Queue {
  tails = new Map();
  async run(key, fn) {
    const previous = this.tails.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.tails.set(key, next);
    try { return await next; }
    finally { if (this.tails.get(key) === next) this.tails.delete(key); }
  }
}

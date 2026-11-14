export class UserError extends Error {}
export function assert(condition, message) { if (!condition) throw new UserError(message); }
export function safeError(error) {
  // Ne jamais sérialiser une requête REST, ses en-têtes ou l'environnement.
  if (error instanceof UserError) return error.message;
  return `Opération impossible (code ${error.code || 'interne'}). Vérifiez les permissions, la hiérarchie et le journal local.`;
}

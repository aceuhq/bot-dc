import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Store } from '../src/database/database.js';
import { config } from '../config/config.js';
// Configuration locale, jamais accessible depuis une commande Discord non autorisée.
const [guildId, path] = process.argv.slice(2);
if (!/^\d{17,20}$/.test(guildId || '') || !path) {
  console.error('Usage : node scripts/settings.js ID_SERVEUR chemin/settings.json'); process.exit(1);
}
const data = JSON.parse(readFileSync(path, 'utf8'));
for (const key of Object.keys(data)) if (!['logChannelId', 'syncRoles', 'roleIds'].includes(key)) throw new Error(`Clé non prise en charge : ${key}`);
if (data.logChannelId && !/^\d{17,20}$/.test(data.logChannelId)) throw new Error('ID de salon invalide.');
if ('syncRoles' in data && typeof data.syncRoles !== 'boolean') throw new Error('syncRoles doit être un booléen.');
if (data.roleIds && Object.entries(data.roleIds).some(([n, id]) => !['1', '2', '3', '4', '5'].includes(n) || (id !== '' && !/^\d{17,20}$/.test(id)))) throw new Error('Grades/identifiants de rôles invalides.');
const store = new Store(config.databasePath);
try {
  const settings = { ...store.settings(guildId), ...data };
  store.run('INSERT INTO guild_settings VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET settings=excluded.settings', guildId, JSON.stringify(settings));
  store.log(guildId, 'LOCAL_SETTINGS_CHANGED', { keys: Object.keys(data) });
  console.log('Configuration serveur enregistrée.');
} finally { store.close(); }

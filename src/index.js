import 'dotenv/config';
import { Client, GatewayIntentBits, Events, PermissionFlagsBits } from 'discord.js';
import { config } from '../config/config.js';
import { Store } from './database/database.js';
import { Permissions } from './services/permissionService.js';
import { DiscordGateway } from './services/discordService.js';
import { Audit } from './services/auditService.js';
import { Sanctions } from './services/sanctionService.js';
import { GradeService } from './services/gradeService.js';
import { Queue } from './services/queue.js';
import { openCommand } from './commands/index.js';
import { interactionCreate } from './events/interactionCreate.js';
import { panel } from './components/base.js';
import { safeError } from './utils/errors.js';
import { acquireLock } from './utils/processLock.js';
if (!process.env.DISCORD_TOKEN || !/^\d{17,20}$/.test(config.ownerId)) {
  console.error('Renseignez DISCORD_TOKEN et OWNER_ID dans .env.'); process.exit(1);
}
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMembers], allowedMentions: { parse: [] } });
const unlock = acquireLock(config.databasePath);
process.once('exit', unlock);
const store = new Store(config.databasePath), queue = new Queue();
const permissions = new Permissions(store, config), gateway = new DiscordGateway(client), audit = new Audit(store, client, config);
const sanctions = new Sanctions(store, permissions, gateway, audit, config);
const gradeService = new GradeService(store, permissions, gateway, audit, config);
const ctx = { client, store, queue, config, permissions, gateway, audit, sanctions, gradeService };
let stopping = false, tickRunning = false;
async function tick() {
  if (tickRunning || stopping) return;
  tickRunning = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      await queue.run(guild.id, () => sanctions.reconcileGuild(guild.id)).catch(error => console.error('Planificateur serveur', guild.id, error.code || 'interne'));
    }
  } finally { tickRunning = false; }
}
let timer;
client.once(Events.ClientReady, async () => {
  console.log(`DSB connecté : ${client.user.tag}. ${client.guilds.cache.size} serveur(s).`);
  for (const guild of client.guilds.cache.values()) {
    try {
      const me = await guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.BanMembers)) console.error(`Serveur ${guild.id} : permission BanMembers manquante.`);
      await audit.write(guild.id, 'BOT_READY', { result: 'Démarrage ; réconciliation des sanctions persistantes.' });
    } catch (error) { console.error('Vérification initiale', guild.id, error.code || 'interne'); }
  }
  await tick(); timer = setInterval(() => void tick().catch(() => console.error('Erreur planificateur')), config.schedulerMs);
});
client.on(Events.MessageCreate, message => {
  void queue.run(message.guildId || 'dm', () => openCommand(message, ctx)).catch(async error => {
    try { await message.reply(panel('⚠️ Commande impossible', [safeError(error)])); } catch { console.error('Réponse commande impossible'); }
    if (message.guildId) await audit.write(message.guildId, 'COMMAND_DENIED_OR_FAILED', { actor: message.author.id, grade: permissions.level(message.guildId, message.author.id), result: safeError(error) });
  }).catch(() => console.error('Erreur journalisation commande'));
});
client.on(Events.InteractionCreate, i => void interactionCreate(i, ctx).catch(() => console.error('Erreur interaction')));
client.on(Events.GuildBanRemove, ban => void queue.run(ban.guild.id, () => sanctions.enforceWipe(ban.guild.id, ban.user.id, true)).catch(() => console.error('Erreur protection Wipe')));
client.on(Events.GuildMemberAdd, member => void queue.run(member.guild.id, () => sanctions.enforceWipe(member.guild.id, member.id)).catch(() => console.error('Erreur contrôle arrivée')));
client.on(Events.GuildCreate, guild => void queue.run(guild.id, () => sanctions.reconcileGuild(guild.id)).catch(() => console.error('Erreur réconciliation nouveau serveur')));
client.on(Events.Error, error => console.error('Erreur client Discord', error.code || 'interne'));
async function shutdown() {
  if (stopping) return; stopping = true; clearInterval(timer); client.destroy();
  await Promise.allSettled([...queue.tails.values()]); store.close(); unlock();
}
process.once('SIGINT', () => void shutdown()); process.once('SIGTERM', () => void shutdown());
client.login(process.env.DISCORD_TOKEN).catch(error => {
  const detail = String(error.message || 'Erreur sans description')
    .replaceAll(process.env.DISCORD_TOKEN, '[TOKEN MASQUE]').slice(0, 300);
  const code = String(error.code || error.name || 'inconnu')
    .replaceAll(process.env.DISCORD_TOKEN, '[TOKEN MASQUE]').slice(0, 80);
  console.error(`Connexion Discord impossible [${code}] : ${detail}`);
  if (/disallowed.?intents|used disallowed intents|4014/i.test(`${code} ${detail}`)) {
    console.error('Developer Portal > votre application > Bot > Privileged Gateway Intents : activez SERVER MEMBERS INTENT et MESSAGE CONTENT INTENT, enregistrez puis relancez DSB.');
  } else if (/tokeninvalid|invalid token|authentication failed|4004/i.test(`${code} ${detail}`)) {
    console.error('Verifiez DISCORD_TOKEN dans votre fichier .env local : utilisez le token de la page Bot, pas le Client Secret. Ne le partagez pas.');
  } else {
    console.error('Verifiez le detail ci-dessus, les intents du Developer Portal et votre connexion reseau.');
  }
  stopping = true;
  clearInterval(timer);
  client.destroy();
  store.close();
  unlock();
  process.exitCode = 1;
});

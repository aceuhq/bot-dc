import { minimums } from '../../config/permissions.js';
import { userId } from '../utils/format.js';
import { assert } from '../utils/errors.js';
import { render } from '../components/panels.js';
export async function openCommand(message, ctx) {
  if (message.author.bot || !message.guild || !message.content.startsWith(ctx.config.prefix)) return;
  const [raw, arg] = message.content.slice(ctx.config.prefix.length).trim().split(/\s+/);
  const command = raw?.toLowerCase();
  if (!Object.hasOwn(minimums, command)) return;
  const guild = message.guild.id, actor = message.author.id;
  ctx.permissions.require(command, guild, actor);
  let state = {};
  if (command === 'help') state.category = 'general';
  else if (command.startsWith('clear')) {
    state = { type: command.includes('wipe') ? 'wipe' : 'bl', own: command.includes('my') };
  } else if (command.startsWith('my') || (['bl', 'wipe'].includes(command) && !arg)) {
    state = { type: command.includes('wipe') ? 'wipe' : 'bl', own: command.startsWith('my'), page: 0 };
  } else if (command.startsWith('un')) {
    const type = command === 'unbl' ? 'bl' : 'wipe';
    const id = userId(arg);
    const r = id ? ctx.store.sanctions(type, guild, { active: true }).find(r => r.target_id === id) : ctx.store.sanction(type, arg?.toUpperCase() || '');
    assert(r && r.status === 'active' && r.guild_id === guild, 'Aucun dossier actif correspondant. Utilisez la mention, l’ID ou le numéro complet du dossier.');
    ctx.permissions.removable(guild, actor, r);
    state = { type, caseId: r.id };
  } else {
    const target = userId(arg);
    assert(target, `Utilisation : &${command} @utilisateur ou ID_UTILISATEUR`);
    if (command === 'grade') {
      assert(target !== ctx.config.ownerId && target !== actor && ctx.permissions.level(guild, target) < ctx.permissions.level(guild, actor), 'Cette cible est protégée pour les changements de grade.');
    } else {
      ctx.permissions.target(guild, actor, target);
      await ctx.gateway.checkTarget(guild, actor, target);
    }
    const user = await ctx.gateway.user(target);
    state = { target, username: user.username };
  }
  // Les listes sans argument utilisent le même contrôle de commande que leur point d'entrée.
  const s = ctx.store.createSession(guild, actor, command, state, ctx.config.sessionMinutes);
  const payload = state.type && !command.startsWith('un') && !command.startsWith('clear') ? (await import('../components/panels.js')).listPanel(s, ctx) : render(s, ctx);
  ctx.store.saveSession(s);
  await message.reply(payload);
}

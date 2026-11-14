import { PermissionFlagsBits } from 'discord.js';
import { assert } from '../utils/errors.js';
export class DiscordGateway {
  constructor(client) { this.client = client; }
  async guild(id) { return this.client.guilds.fetch(id); }
  async user(id) { return this.client.users.fetch(id); }
  async bot(guild) {
    const me = await guild.members.fetchMe();
    assert(me.permissions.has(PermissionFlagsBits.BanMembers), 'Le bot doit posséder la permission Bannir des membres.');
    return me;
  }
  async checkTarget(guildId, actorId, targetId) {
    const guild = await this.guild(guildId), me = await this.bot(guild);
    assert(targetId !== guild.ownerId && targetId !== me.id, 'Le propriétaire Discord et le bot sont protégés.');
    const actor = await guild.members.fetch(actorId);
    let target;
    try { target = await guild.members.fetch(targetId); }
    catch (error) { if (error.code !== 10007) throw error; }
    if (target) {
      assert(me.roles.highest.comparePositionTo(target.roles.highest) > 0, 'Le rôle du bot doit être placé au-dessus de la cible.');
      assert(actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(target.roles.highest) > 0, 'Votre rôle Discord doit être placé au-dessus de la cible.');
    }
    assert(!target?.user.bot, 'Les comptes bots sont protégés.');
    return guild;
  }
  async ban(guildId, user, reason, deleteMessageSeconds = 0) {
    const guild = await this.guild(guildId);
    await this.bot(guild);
    await guild.members.ban(user, { reason: reason.slice(0, 512), deleteMessageSeconds });
  }
  async banInfo(guildId, user) {
    try { return await (await this.guild(guildId)).bans.fetch(user); }
    catch (error) { if (error.code === 10026) return null; throw error; }
  }
  async unban(guildId, user, reason) { await (await this.guild(guildId)).members.unban(user, reason); }
}

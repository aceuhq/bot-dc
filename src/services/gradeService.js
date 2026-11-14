import { PermissionFlagsBits } from 'discord.js';
import { assert, safeError, UserError } from '../utils/errors.js';
export class GradeService {
  constructor(store, permissions, gateway, audit, config) { Object.assign(this, { store, permissions, gateway, audit, config }); }
  async assign(guildId, actor, target, next) {
    this.permissions.assignable(guildId, actor, target, next);
    assert(!this.store.blockers(guildId, target).length, 'Retirez d’abord les sanctions actives de cette cible avant de modifier son grade.');
    const settings = { ...this.config, ...this.store.settings(guildId) };
    const before = this.permissions.level(guildId, target);
    let member, oldRoles, managed, nextRole;
    if (settings.syncRoles) {
      const guild = await this.gateway.guild(guildId), me = await guild.members.fetchMe();
      member = await guild.members.fetch(target);
      const actorMember = await guild.members.fetch(actor);
      assert(actor === guild.ownerId || actorMember.roles.highest.comparePositionTo(member.roles.highest) > 0, 'Votre rôle Discord doit dépasser celui de la cible.');
      assert(me.permissions.has(PermissionFlagsBits.ManageRoles) && me.roles.highest.comparePositionTo(member.roles.highest) > 0, 'Le bot ne peut pas gérer les rôles de cette cible.');
      managed = Object.values(settings.roleIds).filter(Boolean);
      nextRole = settings.roleIds[next];
      assert(nextRole, 'Configurez le rôle correspondant au grade sélectionné.');
      await guild.roles.fetch();
      assert(new Set(managed).size === managed.length, 'Un rôle Discord ne peut pas représenter plusieurs grades.');
      for (const id of managed) {
        const role = guild.roles.cache.get(id);
        assert(role && !role.managed && role.id !== guild.id && me.roles.highest.comparePositionTo(role) > 0, 'Rôle configuré absent, géré par une intégration ou placé au-dessus du bot.');
      }
      oldRoles = managed.filter(id => member.roles.cache.has(id));
      try {
        await member.roles.remove(oldRoles.filter(id => id !== nextRole), `DSB grade par ${actor}`);
        await member.roles.add(nextRole, `DSB grade par ${actor}`);
      } catch (error) {
        await this.audit.write(guildId, 'GRADE_ROLE_FAILED', { actor, target, result: safeError(error) });
        throw new UserError('Synchronisation des rôles échouée. Grade DSB conservé ; vérifiez les rôles Discord partiellement modifiés.');
      }
    }
    this.permissions.assignable(guildId, actor, target, next);
    this.store.transaction(() => {
      this.store.run('INSERT INTO grades VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET level=excluded.level', guildId, target, next);
      this.store.run('INSERT INTO grade_history(guild_id,user_id,actor_id,old_level,new_level,created_at) VALUES (?,?,?,?,?,?)', guildId, target, actor, before, next, Date.now());
    });
    await this.audit.write(guildId, 'GRADE', { actor, target, grade: this.permissions.level(guildId, actor), reason: `${before} → ${next}` });
    return next;
  }
}

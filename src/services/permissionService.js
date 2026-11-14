import { minimums } from '../../config/permissions.js';
import { assert } from '../utils/errors.js';
export class Permissions {
  constructor(store, config) { this.store = store; this.config = config; }
  level(guild, user) { return user === this.config.ownerId ? 5 : this.store.level(guild, user); }
  require(command, guild, actor) {
    const level = this.level(guild, actor);
    assert(Object.hasOwn(minimums, command) && level >= minimums[command], '⛔ Permission insuffisante\nTu n’as pas le grade requis pour effectuer cette action.');
    return level;
  }
  target(guild, actor, target) {
    const a = this.level(guild, actor), b = this.level(guild, target);
    assert(actor !== target && b < a && b < 4 && target !== this.config.ownerId, 'Cette cible est protégée par la hiérarchie DSB.');
  }
  removable(guild, actor, sanction) {
    this.require(sanction.type === 'bl' ? 'unbl' : 'unwipe', guild, actor);
    this.target(guild, actor, sanction.target_id);
    const level = this.level(guild, actor);
    assert(sanction.guild_id === guild && sanction.type !== 'hakai', 'Dossier non autorisé.');
    assert(level === 5 || (sanction.moderator_id === actor && sanction.moderator_grade <= level), 'Seul le créateur autorisé ou un Super Dev peut retirer cette sanction.');
    assert(sanction.duration !== null || level === 5, 'Sanction permanente réservée au Super Dev.');
  }
  assignable(guild, actor, target, next) {
    const level = this.require('grade', guild, actor);
    assert(actor !== target, 'L’auto-modification de grade est interdite. Le propriétaire récupère toujours Super Dev via OWNER_ID.');
    assert(target !== this.config.ownerId, 'Le propriétaire principal est protégé.');
    assert(this.level(guild, target) < level, 'Vous ne pouvez pas modifier un grade égal ou supérieur au vôtre.');
    assert(Number.isInteger(next) && next >= 1 && (next < level || (next === 5 && actor === this.config.ownerId)), 'Ce grade ne peut pas être attribué par votre compte.');
  }
}

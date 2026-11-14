import { randomUUID } from 'node:crypto';
import { assert, safeError, UserError } from '../utils/errors.js';
export class Sanctions {
  constructor(store, permissions, gateway, audit, config) { Object.assign(this, { store, permissions, gateway, audit, config }); }
  validate(guild, actor, state, type) {
    const level = this.permissions.require(type, guild, actor);
    this.permissions.target(guild, actor, state.target);
    if (type === 'hakai') return { level, reason: 'Hakai — bannissement définitif', seconds: null };
    const reason = this.config.reasons[type].find(r => r.id === state.reasonId);
    const duration = this.config.durations.find(d => d.id === state.durationId);
    assert(reason && reason.min <= level, 'Sélectionnez une raison autorisée.');
    assert(duration && duration.min <= level, 'Sélectionnez une durée autorisée.');
    const description = reason.id === 'personal' ? state.personal?.trim() : reason.label;
    assert(description && description.length <= 500, 'Le motif doit contenir entre 1 et 500 caractères.');
    return { level, reason: state.alternate ? `${description} (double compte déclaré : ${state.alternate})` : description, seconds: duration.seconds };
  }
  async apply(guild, actor, state, type, requestId) {
    const { level, reason, seconds } = this.validate(guild, actor, state, type);
    await this.gateway.checkTarget(guild, actor, state.target);
    const user = await this.gateway.user(state.target);
    const table = this.store.table(type);
    const previous = this.store.get(`SELECT * FROM ${table} WHERE request_id=?`, requestId);
    if (previous) { assert(previous.status === 'active', 'Ce dossier a déjà été traité. Consultez son historique.'); return previous; }
    assert(!this.store.get(`SELECT id FROM ${table} WHERE guild_id=? AND target_id=? AND status IN ('pending','active')`, guild, state.target), 'Cette sanction est déjà active ou en cours pour cette cible.');
    // Les protections sont revérifiées après les lectures Discord et avant la réservation durable.
    this.validate(guild, actor, state, type);
    const now = Date.now();
    const row = {
      id: `${type.toUpperCase()}-${randomUUID().toUpperCase()}`, guild_id: guild,
      target_id: state.target, username: user.username, moderator_id: actor, moderator_grade: level,
      reason, duration: seconds, started_at: now, expires_at: seconds === null ? null : now + seconds * 1000,
      status: 'pending', type, requires_ban: type === 'bl' && !this.config.blacklistBan ? 0 : 1, request_id: requestId,
    };
    this.store.transaction(() => {
      this.store.insertSanction(row);
      this.store.run('INSERT INTO users VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,updated_at=excluded.updated_at', user.id, user.username, now);
    });
    return this.executePending(row);
  }
  async executePending(row) {
    try {
      // Un crash peut se produire après l'appel Discord et avant le commit local.
      // Si le marqueur exact est déjà présent, constater le résultat sans rejouer le ban/Hakai.
      const recovered = row.requires_ban ? await this.gateway.banInfo(row.guild_id, row.target_id) : null;
      if (recovered?.reason?.startsWith(`[DSB:${row.id}]`)) {
        this.store.patch(row.type, row.id, { status: 'active', last_error: null });
        await this.audit.write(row.guild_id, 'SANCTION_RECOVERED', { target: row.target_id, actor: row.moderator_id, grade: row.moderator_grade, case: row.id, result: 'Bannissement déjà présent ; registre réconcilié sans rejouer la suppression de messages.' });
        return this.store.sanction(row.type, row.id);
      }
      // Une promotion pendant une panne interdit une nouvelle tentative automatique.
      this.permissions.require(row.type, row.guild_id, row.moderator_id);
      this.permissions.target(row.guild_id, row.moderator_id, row.target_id);
      await this.gateway.checkTarget(row.guild_id, row.moderator_id, row.target_id);
      if (row.requires_ban) {
        const existing = await this.gateway.banInfo(row.guild_id, row.target_id);
        // Ne pas remplacer le motif d'un ban externe : sa levée ne relève pas de DSB.
        if (!existing || row.type === 'hakai') {
          const reason = existing && !/^\[DSB:/.test(existing.reason || '')
            ? (existing.reason || 'Bannissement externe conservé') : `[DSB:${row.id}] ${row.reason}`;
          await this.gateway.ban(row.guild_id, row.target_id, reason, row.type === 'hakai' ? 604800 : 0);
        }
      }
      this.store.patch(row.type, row.id, { status: 'active', last_error: null });
      await this.audit.write(row.guild_id, row.type.toUpperCase(), { target: row.target_id, actor: row.moderator_id, grade: row.moderator_grade, reason: row.reason, duration: row.duration, case: row.id });
      return this.store.sanction(row.type, row.id);
    } catch (error) {
      // Une erreur réseau peut suivre un ban réellement exécuté : ne jamais annoncer un échec certain.
      // Le dossier reste pending pour réconciliation, les erreurs Discord définitives sont failed.
      const definitive = error instanceof UserError || [10007, 10013, 50001, 50013, 50035].includes(error.code);
      this.store.patch(row.type, row.id, { status: definitive ? 'failed' : 'pending', last_error: safeError(error) });
      await this.audit.write(row.guild_id, 'SANCTION_FAILED', { target: row.target_id, actor: row.moderator_id, grade: row.moderator_grade, case: row.id, result: definitive ? safeError(error) : 'Résultat incertain ; réconciliation automatique en attente.' });
      throw new UserError(definitive ? safeError(error) : `Résultat Discord incertain pour ${row.id}. Le dossier est en attente de réconciliation ; ne répétez pas l’action.`);
    }
  }
  eligible(type, guild, actor, own = false) {
    return this.store.sanctions(type, guild, { active: true, ...(own ? { actor } : {}) }).filter(row => {
      try { this.permissions.removable(guild, actor, row); return true; } catch { return false; }
    });
  }
  async revoke(type, id, guild, actor, expired = false) {
    const row = this.store.sanction(type, id);
    assert(row && row.guild_id === guild && row.status === 'active', 'Ce dossier n’est plus actif.');
    if (!expired) this.permissions.removable(guild, actor, row);
    // Fermer le registre AVANT l'appel unban. La reprise traite release_pending.
    this.store.transaction(() => {
      this.store.patch(type, id, { status: expired ? 'expired' : 'revoked', revoked_at: Date.now(), revoked_by: actor || 'scheduler', release_pending: row.requires_ban });
      this.store.log(guild, expired ? 'EXPIRE_REQUEST' : 'REVOKE_REQUEST', { case: id, actor });
    });
    const result = await this.release(this.store.sanction(type, id));
    await this.audit.write(guild, expired ? 'EXPIRATION' : `UN${type.toUpperCase()}`, { target: row.target_id, actor, grade: actor ? this.permissions.level(guild, actor) : 0, case: id, result });
    return result;
  }
  async release(row) {
    if (!row.requires_ban) return 'Registre clos ; aucun bannissement requis.';
    if (this.store.blockers(row.guild_id, row.target_id).length) {
      this.store.patch(row.type, row.id, { release_pending: 0, last_error: null });
      return 'Registre clos ; bannissement maintenu par une autre sanction DSB.';
    }
    try {
      const ban = await this.gateway.banInfo(row.guild_id, row.target_id);
      // Un bannissement externe ne doit jamais être supprimé par un nettoyage DSB.
      if (ban && /^\[DSB:[A-Z]+-[A-F0-9-]+\]/.test(ban.reason || '')) {
        await this.gateway.unban(row.guild_id, row.target_id, `DSB : clôture ${row.id}`);
      } else if (ban) {
        this.store.patch(row.type, row.id, { release_pending: 0, last_error: 'Bannissement externe conservé.' });
        return 'Registre clos ; bannissement externe conservé (retrait manuel nécessaire).';
      }
      this.store.patch(row.type, row.id, { release_pending: 0, last_error: null });
      return ban ? 'Réussite : bannissement DSB levé.' : 'Réussite : aucun bannissement restant.';
    } catch (error) {
      this.store.patch(row.type, row.id, { release_pending: 1, last_error: safeError(error) });
      await this.audit.write(row.guild_id, 'UNBAN_FAILED', { target: row.target_id, case: row.id, result: safeError(error) });
      return 'Registre clos ; débannissement échoué, nouvelle tentative automatique prévue.';
    }
  }
  async enforceWipe(guild, target, incident = false) {
    const rows = this.store.all("SELECT * FROM wipes WHERE guild_id=? AND target_id=? AND status='active'", guild, target);
    const row = rows.find(r => r.expires_at === null || r.expires_at > Date.now());
    if (!row) return;
    try {
      if (!await this.gateway.banInfo(guild, target)) {
        // Protection DSB reste prioritaire sur les sanctions, même lors d'une promotion ultérieure.
        if (this.permissions.level(guild, target) >= 4) {
          await this.audit.write(guild, 'WIPE_PROTECTED_TARGET', { target, case: row.id, result: 'Cible promue Dev/Super Dev : intervention du propriétaire requise.' });
          return;
        }
        await this.gateway.ban(guild, target, `[DSB:${row.id}] Wipe actif : ${row.reason}`);
        await this.audit.write(guild, incident ? 'MANUAL_UNBAN_RESTORED' : 'WIPE_RESTORED', { target, case: row.id });
      }
    } catch (error) {
      await this.audit.write(guild, 'WIPE_ENFORCEMENT_FAILED', { target, case: row.id, result: safeError(error) });
    }
  }
  async reconcileGuild(guild) {
    for (const type of ['bl', 'wipe', 'hakai']) {
      const rows = this.store.all(`SELECT * FROM ${this.store.table(type)} WHERE guild_id=? AND (status IN ('pending','active') OR release_pending=1)`, guild);
      for (let row of rows) {
        try {
          if (row.status === 'pending') {
            if (row.expires_at && row.expires_at <= Date.now()) {
              this.store.patch(type, row.id, { status: 'expired', revoked_at: Date.now(), revoked_by: 'scheduler', release_pending: row.requires_ban });
              await this.release(this.store.sanction(type, row.id));
            } else await this.executePending(row);
          } else if (row.status === 'active' && row.expires_at && row.expires_at <= Date.now()) {
            await this.revoke(type, row.id, guild, null, true);
          } else if (row.release_pending) await this.release(row);
        } catch (error) { console.error('Réconciliation dossier', row.id, error.code || 'voir audit'); }
      }
    }
    const targets = this.store.all("SELECT DISTINCT target_id FROM wipes WHERE guild_id=? AND status='active'", guild);
    for (const row of targets) await this.enforceWipe(guild, row.target_id);
  }
}

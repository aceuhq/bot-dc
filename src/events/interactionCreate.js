import { ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { panel, row, cid } from '../components/base.js';
import { render, listPanel } from '../components/panels.js';
import { assert, safeError } from '../utils/errors.js';
import { text, date } from '../utils/format.js';
function modal(s, action, title, label, value = '', max = 500) {
  return new ModalBuilder().setCustomId(cid(s, action)).setTitle(title).addComponents(row(
    new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(max > 100 ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setMaxLength(max).setRequired(true).setValue(value.slice(0, max)),
  ));
}
function authorized(s, i, ctx) {
  assert(s && s.guild_id === i.guildId && s.owner_id === i.user.id, '⛔ Permission insuffisante\nCe panel appartient à un autre modérateur.');
  assert(!s.done, 'Ce panel a déjà été traité.');
  assert(s.expires_at > Date.now(), 'Ce panel a expiré. Relancez la commande.');
  ctx.permissions.require(s.command, s.guild_id, i.user.id);
  if (s.state.target && ['bl', 'wipe', 'hakai'].includes(s.command)) ctx.permissions.target(s.guild_id, i.user.id, s.state.target);
  if (s.command.startsWith('un')) {
    const r = ctx.store.sanction(s.state.type, s.state.caseId);
    assert(r && r.status === 'active', 'Ce dossier n’est plus actif.');
    ctx.permissions.removable(s.guild_id, i.user.id, r);
  }
}
async function defer(i) { if (!i.deferred && !i.replied) await i.deferUpdate(); }
async function edit(i, payload) {
  // L'édition via le token du bot continue de fonctionner après 15 minutes pour les gros lots.
  if (i.message) return i.message.edit(payload);
  return i.editReply(payload);
}
function finish(s, ctx) { s.done = 1; ctx.store.saveSession(s); }
export async function interactionCreate(i, ctx) {
  if (!(i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) || !i.customId?.startsWith('dsb:')) return;
  try {
    // Répondre dans les trois secondes, même si un autre modérateur effectue un lot.
    const [, preId, preAction] = i.customId.split(':');
    const pre = ctx.store.session(preId);
    authorized(pre, i, ctx);
    const preList = !!pre.state.type && !pre.command.startsWith('un') && !pre.command.startsWith('clear');
    if (i.isButton() && preList && preAction === 'search') return i.showModal(modal(pre, 'searchSubmit', 'Rechercher un dossier', 'ID, pseudo, motif ou * pour tout afficher', '', 100));
    if (['bl', 'wipe'].includes(pre.command) && !preList) {
      if (i.isButton() && preAction === 'alternate') return i.showModal(modal(pre, 'alternateSubmit', 'Double compte déclaré', 'ID du compte principal ou aucun', pre.state.alternate || '', 100));
      if (i.isStringSelectMenu() && preAction === 'reason' && i.values[0] === 'personal') {
        assert(ctx.permissions.level(pre.guild_id, pre.owner_id) >= (ctx.config.reasons[pre.command].find(r => r.id === 'personal')?.min ?? 6), 'Motif personnel non autorisé.');
        return i.showModal(modal(pre, 'personalSubmit', 'Raison personnelle', 'Motif de la sanction', pre.state.personal || ''));
      }
    }
    if (i.isButton() && preAction === 'confirm' && (pre.command === 'hakai' || pre.command.startsWith('clear'))) {
      pre.state.confirmReady = true; ctx.store.saveSession(pre);
      return pre.command === 'hakai'
        ? i.showModal(modal(pre, 'execute', 'Seconde confirmation Hakai', 'Saisissez HAKAI pour confirmer', '', 30))
        : i.showModal(modal(pre, 'execute', 'Confirmation du nettoyage', `Saisissez CONFIRMER ${pre.state.ids.length}`, '', 50));
    }
    await defer(i);
    await ctx.queue.run(i.guildId || 'dm', async () => {
      const [, id, action] = i.customId.split(':');
      const s = ctx.store.session(id);
      authorized(s, i, ctx);
      const isModal = i.isModalSubmit();
      const input = () => i.fields.getTextInputValue('value').trim();
      const list = !!s.state.type && !s.command.startsWith('un') && !s.command.startsWith('clear');
      if (action === 'cancel' && i.isButton()) {
        await defer(i); finish(s, ctx);
        return edit(i, panel('❌ Opération annulée', ['Aucune sanction n’a été appliquée par ce panel.']));
      }
      if (s.command === 'help') {
        assert(action === 'category' && i.isStringSelectMenu() && ['bl', 'wipe', 'grade', 'hakai', 'general'].includes(i.values[0]), 'Catégorie invalide.');
        s.state.category = i.values[0];
      } else if (list) {
        if (action === 'searchSubmit' && isModal) { s.state.search = input() === '*' ? '' : input(); s.state.page = 0; }
        else if (action === 'previous' && i.isButton()) s.state.page = Math.max(0, s.state.page - 1);
        else if (action === 'nextpage' && i.isButton()) s.state.page += 1;
        else assert(action === 'refresh' && i.isButton(), 'Action de liste invalide.');
      } else if (['bl', 'wipe'].includes(s.command)) {
        if (action === 'reason' && i.isStringSelectMenu()) {
          const reason = ctx.config.reasons[s.command].find(r => r.id === i.values[0]);
          assert(reason && reason.min <= ctx.permissions.level(s.guild_id, s.owner_id), 'Raison non autorisée.');
          s.state.reasonId = reason.id;
        } else if (action === 'duration' && i.isStringSelectMenu()) {
          const d = ctx.config.durations.find(d => d.id === i.values[0]);
          assert(d && d.min <= ctx.permissions.level(s.guild_id, s.owner_id), 'Durée non autorisée.'); s.state.durationId = d.id;
        } else if (action === 'personalSubmit' && isModal) {
          assert(ctx.permissions.level(s.guild_id, s.owner_id) >= (ctx.config.reasons[s.command].find(r => r.id === 'personal')?.min ?? 6) && input().length > 0, 'Motif personnel non autorisé ou vide.');
          s.state.reasonId = 'personal'; s.state.personal = input();
        } else if (action === 'alternateSubmit' && isModal) {
          assert(input() === 'aucun' || /^\d{17,20}$/.test(input()), 'Indiquez un ID Discord ou « aucun ».');
          s.state.alternate = input() === 'aucun' ? '' : input();
        } else if (action === 'confirm' && i.isButton()) {
          ctx.sanctions.validate(s.guild_id, s.owner_id, s.state, s.command);
          await defer(i);
          const state = { ...s.state };
          const result = await ctx.sanctions.apply(s.guild_id, s.owner_id, state, s.command, s.id);
          finish(s, ctx);
          return edit(i, panel('✅ Sanction appliquée', [`**Dossier :** ${result.id}\n**Cible :** <@${result.target_id}>\n**Raison :** ${text(result.reason)}\n**Expiration :** ${result.expires_at ? date(result.expires_at) : 'Permanente'}\n**Résultat :** ${result.requires_ban ? 'Bannissement confirmé par Discord.' : 'Inscription au registre confirmée (BL sans ban configurée).'}`]));
        } else throw new Error('Invalid sanction interaction');
      } else if (s.command === 'grade') {
        if (action === 'next' && i.isStringSelectMenu()) {
          const next = Number(i.values[0]); ctx.permissions.assignable(s.guild_id, s.owner_id, s.state.target, next); s.state.next = next;
        } else if (action === 'reset' && i.isButton()) {
          ctx.permissions.assignable(s.guild_id, s.owner_id, s.state.target, 1); s.state.next = 1;
        } else if (action === 'confirm' && i.isButton()) {
          await defer(i);
          await ctx.gradeService.assign(s.guild_id, s.owner_id, s.state.target, s.state.next);
          finish(s, ctx);
          return edit(i, panel('✅ Grade mis à jour', [`<@${s.state.target}> possède désormais le grade **${s.state.next}**. La modification et son historique sont enregistrés.`]));
        } else throw new Error('Invalid grade interaction');
      } else if (s.command === 'hakai') {
        assert(action === 'execute' && isModal && s.state.confirmReady && input() === 'HAKAI', 'Confirmation Hakai incorrecte.');
        await defer(i);
        const result = await ctx.sanctions.apply(s.guild_id, s.owner_id, s.state, 'hakai', s.id);
        finish(s, ctx);
        return edit(i, panel('💜 HAKAI EXÉCUTÉ', [`**La cible a été bannie.**\n**ID :** ${result.target_id}\n**Dossier :** ${result.id}\n**Auteur :** <@${s.owner_id}>\n**Date :** ${date(result.started_at)}`, '**Portée :** Discord a accepté le bannissement avec `deleteMessageSeconds: 604800`. La demande couvre les sept derniers jours ; le nombre de messages réellement supprimés n’est pas fourni par Discord.'], [], { color: 0x7d268c }));
      } else if (s.command.startsWith('un')) {
        assert(action === 'confirm' && i.isButton(), 'Confirmation invalide.');
        await defer(i);
        const result = await ctx.sanctions.revoke(s.state.type, s.state.caseId, s.guild_id, s.owner_id);
        finish(s, ctx);
        return edit(i, panel('🔓 Dossier clos', [result]));
      } else if (s.command.startsWith('clear')) {
        const phrase = `CONFIRMER ${s.state.ids.length}`;
        assert(action === 'execute' && isModal && s.state.confirmReady && input() === phrase, 'Phrase de confirmation incorrecte.');
        await defer(i); finish(s, ctx);
        let success = 0, failed = 0, skipped = 0, pending = 0;
        await ctx.audit.write(s.guild_id, 'CLEAR_START', { actor: s.owner_id, grade: ctx.permissions.level(s.guild_id, s.owner_id), reason: `${s.command} : ${s.state.ids.length} dossiers confirmés` });
        for (const caseId of s.state.ids) {
          try {
            ctx.permissions.require(s.command, s.guild_id, s.owner_id);
            const r = ctx.store.sanction(s.state.type, caseId);
            if (!r || r.status !== 'active') { skipped++; continue; }
            const result = await ctx.sanctions.revoke(s.state.type, caseId, s.guild_id, s.owner_id);
            if (result.includes('échoué')) pending++; else success++;
          } catch (error) {
            failed++;
            await ctx.audit.write(s.guild_id, 'CLEAR_ITEM_FAILED', { actor: s.owner_id, case: caseId, result: safeError(error) });
          }
        }
        const result = `${success} réussis · ${pending} clos avec débannissement à reprendre · ${failed} échecs · ${skipped} déjà clos. Détails dans les journaux par dossier.`;
        await ctx.audit.write(s.guild_id, 'CLEAR_END', { actor: s.owner_id, grade: ctx.permissions.level(s.guild_id, s.owner_id), result });
        return edit(i, panel('🧹 Nettoyage terminé', [result]));
      } else throw new Error('Unknown session command');
      await defer(i);
      const payload = list ? listPanel(s, ctx) : render(s, ctx);
      ctx.store.saveSession(s);
      await edit(i, payload);
    });
  } catch (error) {
    const payload = { ...panel('⚠️ Action impossible', [safeError(error)]), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
    try {
      if (i.deferred || i.replied) await i.followUp(payload); else await i.reply(payload);
    } catch (replyError) { console.error('Réponse interaction impossible', replyError.code || 'interne'); }
    if (i.guildId) await ctx.audit.write(i.guildId, 'INTERACTION_DENIED_OR_FAILED', { actor: i.user.id, grade: ctx.permissions.level(i.guildId, i.user.id), result: safeError(error) });
  }
}

import { ButtonStyle } from 'discord.js';
import { panel, row, button, select } from './base.js';
import { emojis as e } from '../../config/emojis.js';
import { gradeLabel, minimums, grades } from '../../config/permissions.js';
import { text, date, remaining } from '../utils/format.js';
const specs = {
  bl: ['Blacklist', '&bl @utilisateur', 'Ouvrir le panel ou la liste des BL.'],
  unbl: ['Unblacklist', '&unbl BL-XXXXXXXX', 'Lever un dossier autorisé.'],
  mybl: ['Historique BL', '&mybl', 'Consulter vos dossiers et leurs statuts.'],
  clearmybl: ['Nettoyer mes BL', '&clearmybl', 'Clore vos dossiers encore autorisés.'],
  clearbl: ['Nettoyage global BL', '&clearbl', 'Clore les BL du serveur avec confirmation renforcée.'],
  wipe: ['Wipe', '&wipe @utilisateur', 'Bannissement avec registre et protection contre le débannissement.'],
  unwipe: ['Unwipe', '&unwipe WIPE-XXXXXXXX', 'Clore le registre avant de lever le bannissement.'],
  mywipe: ['Historique Wipe', '&mywipe', 'Consulter vos dossiers Wipe.'],
  clearmywipe: ['Nettoyer mes Wipes', '&clearmywipe', 'Clore vos Wipes autorisés.'],
  clearwipe: ['Nettoyage global Wipe', '&clearwipe', 'Double confirmation avant levée des protections.'],
  grade: ['Grades', '&grade @utilisateur', 'Attribuer un grade autorisé ou revenir à Friends.'],
  hakai: ['Hakai', '&hakai @utilisateur', 'Ban définitif ; demande de suppression des messages des sept derniers jours. Double confirmation.'],
  help: ['Aide', '&help', 'Afficher les catégories de commandes.'],
};
const categories = {
  bl: ['bl', 'unbl', 'clearbl', 'mybl', 'clearmybl'],
  wipe: ['wipe', 'unwipe', 'clearwipe', 'mywipe', 'clearmywipe'],
  grade: ['grade'], hakai: ['hakai'], general: Object.keys(specs),
};
export function helpPanel(s, ctx) {
  const level = ctx.permissions.level(s.guild_id, s.owner_id);
  const category = s.state.category || 'general';
  const body = categories[category].map(key => {
    const [name, usage, description] = specs[key];
    return `**${level >= minimums[key] ? '✅' : '🔒'} ${name}** · ${gradeLabel(minimums[key])}\n\`${usage}\`\n> ${description}`;
  });
  return panel('🔵 Modération', [
    `**DSB** · Préfixe \`&\`\n**Votre grade :** ${gradeLabel(level)}`,
    ...body.reduce((groups, line, index) => { if (index % 5 === 0) groups.push(line); else groups[groups.length - 1] += '\n\n' + line; return groups; }, []),
    ...(category === 'grade' ? ['**Hiérarchie**\n' + [5, 4, 3, 2, 1].map(gradeLabel).join(' → ')] : []),
  ], [row(select(s, 'category', 'Sélectionne une catégorie', [
    { label: 'Blacklist', value: 'bl', emoji: e.bl }, { label: 'Wipe', value: 'wipe', emoji: e.wipe },
    { label: 'Grades', value: 'grade', emoji: e.grade }, { label: 'Hakai', value: 'hakai', emoji: e.hakai },
    { label: 'Général', value: 'general', emoji: e.system },
  ], category))]);
}
export function sanctionPanel(s, ctx) {
  const type = s.command, state = s.state, level = ctx.permissions.level(s.guild_id, s.owner_id);
  const reason = ctx.config.reasons[type].find(r => r.id === state.reasonId);
  const duration = ctx.config.durations.find(d => d.id === state.durationId);
  return panel(`${e[type]} ${type === 'bl' ? 'BlackList • raisons' : 'Wipe • sanctions'}`, [
    `**Cible :** <@${state.target}>\n\`(${state.target})\`\n**Pseudo :** ${text(state.username)}\n**Grade :** ${gradeLabel(ctx.permissions.level(s.guild_id, state.target))}\n**Durée :** ${duration?.label || 'À choisir'}`,
    `**Raison sélectionnée :** ${text(reason?.id === 'personal' ? state.personal || 'À saisir' : reason?.label || 'Aucune')}\n**Double compte de :** ${text(state.alternate || 'Aucun')}\n**Type :** ${type === 'bl' ? (ctx.config.blacklistBan ? 'Blacklist avec bannissement' : 'Registre BL sans bannissement') : 'Wipe avec bannissement maintenu'}\n**Auteur :** <@${s.owner_id}> · ${gradeLabel(level)}`,
  ], [
    row(select(s, 'reason', 'Choisis une raison', ctx.config.reasons[type].filter(r => r.min <= level).map(r => ({ label: r.label, value: r.id, emoji: r.emoji })), state.reasonId)),
    row(select(s, 'duration', 'Choisis la durée', ctx.config.durations.filter(d => d.min <= level).map(d => ({ label: d.label, value: d.id })), state.durationId)),
    row(button(s, 'confirm', 'Confirmer', ButtonStyle.Success, !state.reasonId || !state.durationId || (state.reasonId === 'personal' && !state.personal), e.confirm), button(s, 'cancel', 'Annuler', ButtonStyle.Secondary, false, e.cancel), button(s, 'alternate', 'Double compte')),
  ], { color: type === 'bl' ? 0x202225 : 0x820d20, thumbnail: ctx.config.thumbnails[type] });
}
export function gradePanel(s, ctx) {
  const level = ctx.permissions.level(s.guild_id, s.owner_id);
  const allowed = [5, 4, 3, 2, 1].filter(n => n < level || (n === 5 && s.owner_id === ctx.config.ownerId));
  return panel(`${e.grade} Gestion des grades`, [
    `**Utilisateur :** <@${s.state.target}>\n**ID :** ${s.state.target}\n**Grade actuel :** ${gradeLabel(ctx.permissions.level(s.guild_id, s.state.target))}\n**Nouveau grade :** ${s.state.next ? gradeLabel(s.state.next) : 'À sélectionner'}`,
  ], [row(select(s, 'next', 'Sélectionne un grade', allowed.map(n => ({ label: grades[n].name, emoji: grades[n].emoji, value: String(n) })), String(s.state.next))),
    row(button(s, 'confirm', 'Confirmer', ButtonStyle.Success, !s.state.next, e.confirm), button(s, 'reset', 'Remettre Friends'), button(s, 'cancel', 'Annuler', ButtonStyle.Secondary, false, e.cancel))], { color: 0xb88a27 });
}
export function hakaiPanel(s, ctx) {
  return panel(`${e.hakai} HAKAI • Destruction`, [
    `⚡ **Le jugement de destruction approche.**\n**Cible :** <@${s.state.target}>\n**Identifiant :** ${s.state.target}\n**Exécutant :** <@${s.owner_id}> · ${gradeLabel(5)}`,
    '**Action :** Bannissement définitif\n**Messages :** Suppression maximale demandée à Discord : sept derniers jours\n**Statut :** En attente de confirmation\n🔥 Les messages plus anciens ne seront pas supprimés par cette action.',
  ], [row(button(s, 'confirm', 'Exécuter le Hakai', ButtonStyle.Danger, false, e.hakai), button(s, 'cancel', 'Annuler', ButtonStyle.Secondary, false, e.cancel))], { color: 0x7d268c, thumbnail: ctx.config.thumbnails.hakai });
}
export function listPanel(s, ctx) {
  const { type, own, search = '' } = s.state;
  const records = ctx.store.sanctions(type, s.guild_id, { ...(own ? { actor: s.owner_id } : {}), active: !own, search });
  const pages = Math.max(1, Math.ceil(records.length / ctx.config.pageSize));
  const page = Math.min(Math.max(s.state.page || 0, 0), pages - 1); s.state.page = page;
  const current = records.slice(page * ctx.config.pageSize, (page + 1) * ctx.config.pageSize);
  return panel(`${e[type]} ${own ? 'Mes historiques' : 'Registre actif'} • ${type.toUpperCase()}`, [
    `**${records.length} dossiers** · ${records.filter(r => r.status === 'active').length} actifs · ${records.filter(r => r.status === 'expired').length} expirés\n**Page ${page + 1}/${pages}**${search ? ` · Recherche : ${text(search)}` : ''}`,
    ...current.map(r => `**${r.id}** · <@${r.target_id}>\n**ID :** \`${r.target_id}\` · ${text(r.username)}\n**Raison :** ${text(r.reason)}\n**Durée :** ${r.duration === null ? 'Permanente' : `${r.duration / 3600} h`} · **Échéance :** ${remaining(r)}\n**Auteur :** <@${r.moderator_id}> · ${gradeLabel(r.moderator_grade)}\n**Application :** ${date(r.started_at)}\n**Statut :** ${r.status}${r.last_error ? ` · ${text(r.last_error)}` : ''}`),
    ...(!current.length ? ['Aucun dossier correspondant.'] : []),
  ], [row(button(s, 'previous', 'Précédent', ButtonStyle.Secondary, page === 0), button(s, 'nextpage', 'Suivant', ButtonStyle.Secondary, page >= pages - 1), button(s, 'search', 'Rechercher'), button(s, 'refresh', 'Actualiser'))], { color: type === 'wipe' ? 0x820d20 : 0x313338 });
}
export function clearPanel(s, ctx) {
  const rows = ctx.sanctions.eligible(s.state.type, s.guild_id, s.owner_id, s.state.own);
  // Figer les dossiers explicitement affichés : aucune nouvelle sanction ne rejoint le lot.
  if (!s.state.ids) s.state.ids = rows.map(r => r.id);
  const selected = rows.filter(r => s.state.ids.includes(r.id));
  return panel(`${e[s.state.type === 'bl' ? 'clearbl' : 'clearwipe']} Nettoyage ${s.state.type.toUpperCase()}`, [
    `**Dossiers autorisés concernés : ${selected.length}**\n**Permanents :** ${selected.filter(r => r.duration === null).length}\n**Temporaires :** ${selected.filter(r => r.duration !== null).length}`,
    'Les dossiers seront clos sans supprimer leurs audits. Les bannissements DSB seront levés seulement si aucune autre sanction ne les exige. Les bannissements externes seront conservés. Chaque échec sera comptabilisé.',
    s.state.type === 'wipe' && !s.state.own ? '**Étape 1/2 :** confirmer ici, puis saisir la phrase dans le formulaire.' : '**Confirmation :** saisir la phrase demandée dans le formulaire.',
  ], [row(button(s, 'confirm', 'Confirmer le nettoyage', ButtonStyle.Danger, selected.length === 0), button(s, 'cancel', 'Annuler', ButtonStyle.Secondary, false, e.cancel))], { color: 0x992d22 });
}
export function revokePanel(s, ctx) {
  const r = ctx.store.sanction(s.state.type, s.state.caseId);
  return panel(`${e[s.state.type === 'bl' ? 'unbl' : 'unwipe']} Lever une sanction`, [
    `**Dossier :** ${r.id}\n**Cible :** <@${r.target_id}>\n**Raison :** ${text(r.reason)}\n**Auteur :** <@${r.moderator_id}> · ${gradeLabel(r.moderator_grade)}\n**Durée :** ${remaining(r)}`,
    'Le registre sera clos. Le bannissement sera conservé si une autre sanction active le nécessite ou s’il est externe à DSB.',
  ], [row(button(s, 'confirm', 'Confirmer le retrait', ButtonStyle.Danger), button(s, 'cancel', 'Annuler', ButtonStyle.Secondary, false, e.cancel))]);
}
export function render(s, ctx) {
  if (s.done) return panel('Panel clos', ['Cette session a déjà été traitée. Consultez le registre ou les journaux.']);
  if (s.command === 'help') return helpPanel(s, ctx);
  if (s.command === 'grade') return gradePanel(s, ctx);
  if (s.command === 'hakai') return hakaiPanel(s, ctx);
  if (['bl', 'wipe'].includes(s.command)) return sanctionPanel(s, ctx);
  if (s.command.startsWith('clear')) return clearPanel(s, ctx);
  if (s.command.startsWith('un')) return revokePanel(s, ctx);
  return listPanel(s, ctx);
}

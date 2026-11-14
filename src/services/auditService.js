import { panel } from '../components/base.js';
import { gradeLabel } from '../../config/permissions.js';
import { text, date } from '../utils/format.js';
export class Audit {
  constructor(store, client, config) { Object.assign(this, { store, client, config }); }
  async write(guildId, event, data = {}) {
    this.store.log(guildId, event, data);
    const channelId = this.store.settings(guildId).logChannelId || this.config.logChannelId;
    if (!channelId) return;
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased() || channel.guildId !== guildId) throw new Error('Invalid log channel');
      await channel.send(panel('📋 Journal de modération', [
        `**Type :** ${text(event)}\n**Cible :** ${data.target ? `<@${data.target}> (${data.target})` : '—'}\n**Modérateur :** ${data.actor ? `<@${data.actor}>` : 'Automatique'}\n**Grade :** ${gradeLabel(data.grade || 0)}`,
        `**Dossier :** ${text(data.case || '—')}\n**Raison :** ${text(data.reason || '—')}\n**Durée :** ${data.duration === null ? 'Permanente' : text(data.duration ?? '—')}\n**Résultat :** ${text(data.result || 'Réussite')}\n**Date :** ${date(Date.now())}`,
      ]));
    } catch (error) {
      this.store.log(guildId, 'LOG_DELIVERY_FAILED', { event, code: error.code || 'channel' });
      console.error('Échec envoi journal Discord', guildId, error.code || 'channel');
    }
  }
}

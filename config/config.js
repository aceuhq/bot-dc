import 'dotenv/config';
export const config = {
  prefix: '&', ownerId: process.env.OWNER_ID || '',
  databasePath: process.env.DATABASE_PATH || './data/dsb.sqlite',
  logChannelId: process.env.LOG_CHANNEL_ID || '',
  sessionMinutes: 30, schedulerMs: 30_000, pageSize: 4,
  // Une configuration par serveur peut remplacer ces valeurs via guild_settings.
  syncRoles: false,
  roleIds: { 1: '', 2: '', 3: '', 4: '', 5: '' },
  // BL et Wipe bannissent réellement. Une désactivation BL conserve le registre seulement.
  blacklistBan: true,
  thumbnails: { bl: '', wipe: '', hakai: '' }, // URL HTTPS d'une image, facultative.
  durations: [
    { id: '12h', label: '12 heures', seconds: 43200, min: 2 },
    { id: '7d', label: '7 jours', seconds: 604800, min: 3 },
    { id: '14d', label: '2 semaines', seconds: 1209600, min: 4 },
    { id: 'permanent', label: 'Permanente', seconds: null, min: 5 },
  ],
  reasons: {
    bl: [
      { id: 'gluant', label: 'Gluant', emoji: '🟢', min: 2 },
      { id: 'glouton', label: 'Glouton', emoji: '🍔', min: 2 },
      { id: 'personal', label: 'Raison personnelle', emoji: '📝', min: 3 },
      { id: 'none', label: 'Pas de raison spécifique', emoji: '⚫', min: 5 },
    ],
    wipe: [
      { id: 'serious', label: 'Infraction grave', emoji: '💀', min: 3 },
      { id: 'repeat', label: 'Récidive', emoji: '⚠️', min: 3 },
      { id: 'personal', label: 'Raison personnelle', emoji: '📝', min: 3 },
      { id: 'none', label: 'Pas de raison spécifique', emoji: '⚫', min: 5 },
    ],
  },
};

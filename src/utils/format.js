import { escapeMarkdown } from 'discord.js';
export const text = value => escapeMarkdown(String(value ?? '')).replaceAll('@', '@\u200b').slice(0, 1200);
export const date = ms => ms ? `<t:${Math.floor(ms / 1000)}:f>` : '—';
export const remaining = row => row.expires_at ? `<t:${Math.floor(row.expires_at / 1000)}:R>` : 'Permanente';
export function userId(input) { return input?.match(/^(?:<@!?)?(\d{17,20})>?$/)?.[1] || null; }

import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SectionBuilder, ThumbnailBuilder, StringSelectMenuBuilder } from 'discord.js';
export const cid = (s, action) => `dsb:${s.id}:${action}`;
export const row = (...components) => new ActionRowBuilder().addComponents(...components);
export function button(s, action, label, style = ButtonStyle.Secondary, disabled = false, emoji) {
  const b = new ButtonBuilder().setCustomId(cid(s, action)).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}
export function select(s, action, placeholder, options, value) {
  return new StringSelectMenuBuilder().setCustomId(cid(s, action)).setPlaceholder(placeholder).addOptions(options.map(o => ({ ...o, default: o.value === value })));
}
export function panel(title, sections = [], rows = [], { color = 0x313338, thumbnail } = {}) {
  const c = new ContainerBuilder().setAccentColor(color);
  if (thumbnail) c.addSectionComponents(new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail)));
  else c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
  for (const section of sections) c.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(new TextDisplayBuilder().setContent(section || '—'));
  if (rows.length) c.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(...rows);
  return { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

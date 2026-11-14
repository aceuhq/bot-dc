import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/database/database.js';
import { Permissions } from '../src/services/permissionService.js';
import { Sanctions } from '../src/services/sanctionService.js';
import { GradeService } from '../src/services/gradeService.js';
import { Queue } from '../src/services/queue.js';
import { config } from '../config/config.js';
import { minimums } from '../config/permissions.js';
import { render, listPanel } from '../src/components/panels.js';
import { interactionCreate } from '../src/events/interactionCreate.js';
import { openCommand } from '../src/commands/index.js';
const guild = '100000000000000001', owner = '100000000000000002', trusted = '100000000000000003', system = '100000000000000004', dev = '100000000000000005', target = '100000000000000006';
function setup(path = ':memory:') {
  const store = new Store(path), cfg = { ...config, ownerId: owner, syncRoles: false };
  for (const [id, n] of [[trusted, 2], [system, 3], [dev, 4]]) store.run('INSERT OR REPLACE INTO grades VALUES (?,?,?)', guild, id, n);
  const permissions = new Permissions(store, cfg), bans = new Map(), calls = [], logs = [];
  const gateway = {
    async checkTarget() {}, async user(id) { return { id, username: 'test-user' }; },
    async ban(g, id, reason, seconds) { calls.push({ op: 'ban', id, reason, seconds }); bans.set(id, { reason }); },
    async banInfo(g, id) { return bans.get(id) || null; },
    async unban(g, id) { calls.push({ op: 'unban', id }); bans.delete(id); },
  };
  const audit = { async write(g, event, data) { logs.push({ g, event, data }); store.log(g, event, data); } };
  const sanctions = new Sanctions(store, permissions, gateway, audit, cfg);
  const gradeService = new GradeService(store, permissions, gateway, audit, cfg);
  return { store, config: cfg, permissions, gateway, audit, sanctions, gradeService, queue: new Queue(), bans, calls, logs };
}
const state = (id = target) => ({ target: id, username: 'target', reasonId: 'gluant', durationId: '12h' });
function session(ctx, command, actor = trusted, data = state()) { return ctx.store.createSession(guild, actor, command, data, 30); }
function interaction(s, action, type = 'button', value, actor = s.owner_id) {
  const i = { guildId: guild, user: { id: actor }, customId: `dsb:${s.id}:${action}`, values: [value], deferred: false, replied: false,
    isButton: () => type === 'button', isStringSelectMenu: () => type === 'select', isModalSubmit: () => type === 'modal',
    fields: { getTextInputValue: () => value },
    message: { async edit(p) { i.updated = p; } },
    async deferUpdate() { i.deferred = true; }, async reply(p) { i.error = p; i.replied = true; },
    async followUp(p) { i.error = p; }, async showModal(p) { i.modal = p; i.replied = true; },
  }; return i;
}
const serialize = p => p.components.map(c => c.toJSON());
test('matrice des commandes et protections hiérarchiques', () => {
  const c = setup();
  for (const cmd of Object.keys(minimums)) assert.doesNotThrow(() => c.permissions.require(cmd, guild, owner));
  assert.doesNotThrow(() => c.permissions.require('bl', guild, trusted));
  assert.throws(() => c.permissions.require('wipe', guild, trusted));
  assert.doesNotThrow(() => c.permissions.require('wipe', guild, system));
  for (const id of [owner, dev, trusted]) assert.throws(() => c.permissions.target(guild, trusted, id));
  assert.throws(() => c.permissions.target(guild, owner, dev));
  c.store.close();
});
test('durées et raisons vérifiées côté serveur ; motif personnel System', () => {
  const c = setup();
  assert.equal(c.sanctions.validate(guild, trusted, state(), 'bl').seconds, 43200);
  assert.throws(() => c.sanctions.validate(guild, trusted, { ...state(), durationId: 'permanent' }, 'bl'));
  assert.throws(() => c.sanctions.validate(guild, trusted, { ...state(), reasonId: 'personal', personal: 'test' }, 'bl'));
  assert.equal(c.sanctions.validate(guild, system, { ...state(), reasonId: 'personal', personal: 'motif' }, 'bl').reason, 'motif');
  c.store.close();
});
test('Trusted applique un vrai appel de ban via adaptateur ; double validation idempotente', async () => {
  const c = setup(), row = await c.sanctions.apply(guild, trusted, state(), 'bl', 'req1');
  assert.equal(row.status, 'active'); assert.equal(c.calls.length, 1);
  const same = await c.sanctions.apply(guild, trusted, state(), 'bl', 'req1'); assert.equal(same.id, row.id);
  assert.equal(c.calls.length, 1);
  await assert.rejects(c.sanctions.apply(guild, trusted, state(), 'bl', 'req2'));
  c.store.close();
});
test('Dev attribue Trusted et System ; auto-promotion Super Dev interdite', async () => {
  const c = setup();
  await c.gradeService.assign(guild, dev, target, 2); assert.equal(c.permissions.level(guild, target), 2);
  await c.gradeService.assign(guild, dev, target, 3); assert.equal(c.permissions.level(guild, target), 3);
  await assert.rejects(c.gradeService.assign(guild, dev, dev, 5));
  await assert.rejects(c.gradeService.assign(guild, dev, target, 4));
  await c.gradeService.assign(guild, owner, target, 5); assert.equal(c.permissions.level(guild, target), 5);
  assert.equal(c.store.all('SELECT * FROM grade_history').length, 3); c.store.close();
});
test('BL : menus mettent à jour le panel et annuler ne bannit pas', async () => {
  const c = setup(), s = session(c, 'bl');
  let i = interaction(s, 'reason', 'select', 'glouton'); await interactionCreate(i, c);
  assert.equal(c.store.session(s.id).state.reasonId, 'glouton'); assert.ok(JSON.stringify(serialize(i.updated)).includes('Glouton'));
  i = interaction(s, 'duration', 'select', '12h'); await interactionCreate(i, c); assert.equal(c.store.session(s.id).state.durationId, '12h');
  i = interaction(s, 'cancel'); await interactionCreate(i, c); assert.equal(c.store.session(s.id).done, 1); assert.equal(c.calls.length, 0);
  c.store.close();
});
test('raison personnelle : modal réel et soumission', async () => {
  const c = setup(), s = session(c, 'wipe', system, { target, username: 'test' });
  let i = interaction(s, 'reason', 'select', 'personal'); await interactionCreate(i, c); assert.ok(i.modal.toJSON().components);
  i = interaction(s, 'personalSubmit', 'modal', 'motif personnel'); await interactionCreate(i, c);
  assert.equal(c.store.session(s.id).state.personal, 'motif personnel'); assert.ok(i.updated); c.store.close();
});
test('grade revérifié à chaque clic, panel réservé à son propriétaire', async () => {
  const c = setup(), s = session(c, 'bl');
  const outsider = interaction(s, 'confirm', 'button', undefined, system); await interactionCreate(outsider, c); assert.ok(outsider.error); assert.equal(c.calls.length, 0);
  c.store.run('UPDATE grades SET level=1 WHERE guild_id=? AND user_id=?', guild, trusted);
  const denied = interaction(s, 'confirm'); await interactionCreate(denied, c); assert.ok(denied.error); assert.equal(c.calls.length, 0); c.store.close();
});
test('Wipe rétablit le ban manuel et Unwipe ferme avant unban', async () => {
  const c = setup(); const r = await c.sanctions.apply(guild, system, { ...state(), reasonId: 'serious' }, 'wipe', 'wipe1');
  c.bans.delete(target); await c.sanctions.enforceWipe(guild, target, true); assert.ok(c.bans.has(target));
  c.gateway.unban = async (g, id) => { assert.equal(c.store.sanction('wipe', r.id).status, 'revoked'); c.bans.delete(id); };
  await c.sanctions.revoke('wipe', r.id, guild, system); assert.ok(!c.bans.has(target));
  await c.sanctions.enforceWipe(guild, target); assert.ok(!c.bans.has(target)); c.store.close();
});
test('Wipe : perte de permissions journalisée sans fausse réussite', async () => {
  const c = setup(); await c.sanctions.apply(guild, system, { ...state(), reasonId: 'serious' }, 'wipe', 'wipe2'); c.bans.delete(target);
  c.gateway.ban = async () => { throw Object.assign(new Error(), { code: 50013 }); };
  await c.sanctions.enforceWipe(guild, target, true);
  assert.ok(c.logs.some(l => l.event === 'WIPE_ENFORCEMENT_FAILED')); assert.ok(!c.bans.has(target)); c.store.close();
});
test('une autre sanction interdit le débannissement ; expiration automatique', async () => {
  const c = setup(); const bl = await c.sanctions.apply(guild, system, state(), 'bl', 'bl1');
  const wipe = await c.sanctions.apply(guild, system, { ...state(), reasonId: 'serious' }, 'wipe', 'wipe3');
  await c.sanctions.revoke('bl', bl.id, guild, system); assert.ok(c.bans.has(target));
  c.store.patch('wipe', wipe.id, { expires_at: Date.now() - 1 }); await c.sanctions.reconcileGuild(guild);
  assert.equal(c.store.sanction('wipe', wipe.id).status, 'expired'); assert.ok(!c.bans.has(target)); c.store.close();
});
test('permanent ne s’expire pas et sanction Super Dev non retirable par System', async () => {
  const c = setup(); const r = await c.sanctions.apply(guild, owner, { ...state(), reasonId: 'serious', durationId: 'permanent' }, 'wipe', 'perm');
  await c.sanctions.reconcileGuild(guild); assert.equal(c.store.sanction('wipe', r.id).status, 'active');
  await assert.rejects(c.sanctions.revoke('wipe', r.id, guild, system)); c.store.close();
});
test('les bans externes conservent leur motif et ne sont pas levés', async () => {
  const c = setup(); c.bans.set(target, { reason: 'Décision extérieure' });
  const r = await c.sanctions.apply(guild, trusted, state(), 'bl', 'external'); assert.equal(c.calls.length, 0);
  await c.sanctions.revoke('bl', r.id, guild, trusted); assert.equal(c.bans.get(target).reason, 'Décision extérieure'); c.store.close();
});
test('échec unban : dossier clos, reprise durable puis réussite', async () => {
  const c = setup(); const r = await c.sanctions.apply(guild, trusted, state(), 'bl', 'release');
  c.gateway.unban = async () => { throw Object.assign(new Error(), { code: 50013 }); };
  await c.sanctions.revoke('bl', r.id, guild, trusted); assert.equal(c.store.sanction('bl', r.id).release_pending, 1);
  c.gateway.unban = async (g, id) => c.bans.delete(id); await c.sanctions.reconcileGuild(guild);
  assert.equal(c.store.sanction('bl', r.id).release_pending, 0); assert.ok(!c.bans.has(target)); c.store.close();
});
test('sanction réseau incertaine reste pending et reprend sans doublon', async () => {
  const c = setup(), original = c.gateway.ban;
  c.gateway.ban = async (...args) => { await original(...args); throw new Error('network'); };
  await assert.rejects(c.sanctions.apply(guild, trusted, state(), 'bl', 'network'));
  assert.equal(c.store.sanctions('bl', guild)[0].status, 'pending');
  c.gateway.ban = original; await c.sanctions.reconcileGuild(guild);
  assert.equal(c.store.sanctions('bl', guild)[0].status, 'active'); assert.equal(c.calls.length, 1); c.store.close();
});
test('historiques personnels, pagination et recherche', async () => {
  const c = setup();
  for (let n = 0; n < 6; n++) await c.sanctions.apply(guild, trusted, state(String(BigInt(target) + BigInt(n))), 'bl', `list-${n}`);
  await c.sanctions.apply(guild, system, state('100000000000000099'), 'bl', 'other');
  const s = session(c, 'mybl', trusted, { type: 'bl', own: true, page: 0 });
  let p = JSON.stringify(serialize(listPanel(s, c))); assert.ok(p.includes('6 dossiers')); assert.ok(p.includes('Page 1/2'));
  const i = interaction(s, 'nextpage'); await interactionCreate(i, c); p = JSON.stringify(serialize(i.updated)); assert.ok(p.includes('Page 2/2')); assert.equal(c.store.session(s.id).state.page, 1); c.store.close();
});
test('Clear exige bouton puis modal exact ; conserve les audits', async () => {
  const c = setup(); await c.sanctions.apply(guild, trusted, state(), 'bl', 'clear');
  const s = session(c, 'clearbl', owner, { type: 'bl', own: false }); render(s, c); c.store.saveSession(s);
  const first = interaction(s, 'confirm'); await interactionCreate(first, c); assert.ok(first.modal); assert.ok(c.bans.has(target));
  const bad = interaction(s, 'execute', 'modal', 'oui'); await interactionCreate(bad, c); assert.ok(bad.error); assert.ok(c.bans.has(target));
  const ok = interaction(s, 'execute', 'modal', 'CONFIRMER 1'); await interactionCreate(ok, c);
  assert.ok(!c.bans.has(target)); assert.equal(c.store.sanctions('bl', guild).length, 1); assert.ok(c.logs.some(l => l.event === 'CLEAR_END')); c.store.close();
});
test('Hakai double confirmation et option Discord exacte', async () => {
  const c = setup(), s = session(c, 'hakai', owner);
  const first = interaction(s, 'confirm'); await interactionCreate(first, c); assert.ok(first.modal); assert.equal(c.calls.length, 0);
  const execute = interaction(s, 'execute', 'modal', 'HAKAI'); await interactionCreate(execute, c);
  assert.equal(c.calls[0].seconds, 604800); assert.equal(c.store.sanctions('hakai', guild)[0].status, 'active'); assert.equal(c.store.sanctions('bl', guild).length, 0); c.store.close();
});
test('SQLite et sessions survivent à la fermeture/réouverture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsb-')); const path = join(dir, 'dsb.sqlite');
  try {
    let c = setup(path); const r = await c.sanctions.apply(guild, trusted, state(), 'bl', 'persist'); const s = session(c, 'help', trusted, { category: 'bl' }); c.store.close();
    c = setup(path); assert.equal(c.store.sanction('bl', r.id).status, 'active'); assert.equal(c.store.session(s.id).state.category, 'bl'); assert.equal(c.permissions.level(guild, trusted), 2); c.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('deux modérateurs : sessions isolées et validation concurrente sérialisée', async () => {
  const c = setup(), s1 = session(c, 'bl'), s2 = session(c, 'bl', system);
  const i1 = interaction(s1, 'confirm'), i2 = interaction(s2, 'confirm'); await Promise.all([interactionCreate(i1, c), interactionCreate(i2, c)]);
  assert.equal(c.calls.length, 1); assert.equal(c.store.sanctions('bl', guild).length, 1); assert.ok(i2.error); c.store.close();
});
test('toutes les commandes ouvrent un panel sérialisable Components V2', async () => {
  const c = setup(); const bl = await c.sanctions.apply(guild, owner, state(), 'bl', 'route-bl');
  const wipe = await c.sanctions.apply(guild, owner, { ...state(), reasonId: 'serious' }, 'wipe', 'route-wipe');
  for (const command of Object.keys(minimums)) {
    const args = command === 'unbl' ? bl.id : command === 'unwipe' ? wipe.id : ['grade', 'hakai'].includes(command) ? '100000000000000088' : '';
    const message = { guild: { id: guild }, author: { id: owner, bot: false }, content: `&${command} ${args}`, async reply(p) { assert.ok(p.flags & 32768); serialize(p); } };
    await openCommand(message, c);
  }
  const s = session(c, 'bl', owner); serialize(render(s, c)); c.store.close();
});

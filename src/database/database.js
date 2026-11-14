import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
const sanctionColumns = `
 id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, target_id TEXT NOT NULL, username TEXT NOT NULL,
 moderator_id TEXT NOT NULL, moderator_grade INTEGER NOT NULL, reason TEXT NOT NULL,
 duration INTEGER, started_at INTEGER NOT NULL, expires_at INTEGER,
 status TEXT NOT NULL CHECK(status IN ('pending','active','revoked','expired','failed')),
 revoked_at INTEGER, revoked_by TEXT, type TEXT NOT NULL,
 requires_ban INTEGER NOT NULL DEFAULT 1, release_pending INTEGER NOT NULL DEFAULT 0,
 last_error TEXT, request_id TEXT UNIQUE NOT NULL`;
export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS grades (guild_id TEXT, user_id TEXT, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5), PRIMARY KEY(guild_id,user_id));
      CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, settings TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS moderation_logs (id INTEGER PRIMARY KEY, guild_id TEXT, event TEXT, data TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS grade_history (id INTEGER PRIMARY KEY, guild_id TEXT, user_id TEXT, actor_id TEXT, old_level INTEGER, new_level INTEGER, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, guild_id TEXT, owner_id TEXT, command TEXT, state TEXT, expires_at INTEGER, done INTEGER DEFAULT 0);
    `);
    for (const table of ['blacklists', 'wipes', 'hakai_history']) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (${sanctionColumns});
        CREATE UNIQUE INDEX IF NOT EXISTS ${table}_active ON ${table}(guild_id,target_id) WHERE status IN ('pending','active');
        CREATE INDEX IF NOT EXISTS ${table}_expiry ON ${table}(status,expires_at);`);
    }
  }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  table(type) {
    const table = { bl: 'blacklists', wipe: 'wipes', hakai: 'hakai_history' }[type];
    if (!table) throw new Error('Type de sanction invalide.');
    return table;
  }
  level(guild, user) { return this.get('SELECT level FROM grades WHERE guild_id=? AND user_id=?', guild, user)?.level || 0; }
  settings(guild) { const row = this.get('SELECT settings FROM guild_settings WHERE guild_id=?', guild); return row ? JSON.parse(row.settings) : {}; }
  sanctions(type, guild, { actor, active = false, search = '' } = {}) {
    return this.all(`SELECT * FROM ${this.table(type)} WHERE guild_id=?${actor ? ' AND moderator_id=?' : ''}${active ? " AND status='active'" : ''} ORDER BY started_at DESC`, ...[guild, ...(actor ? [actor] : [])])
      .filter(r => !search || [r.id, r.target_id, r.username, r.reason].some(v => v.toLowerCase().includes(search.toLowerCase())));
  }
  sanction(type, id) { return this.get(`SELECT * FROM ${this.table(type)} WHERE id=?`, id); }
  blockers(guild, user) {
    return ['bl', 'wipe', 'hakai'].flatMap(type => this.all(`SELECT * FROM ${this.table(type)} WHERE guild_id=? AND target_id=? AND requires_ban=1 AND status IN ('pending','active')`, guild, user));
  }
  insertSanction(row) {
    const keys = Object.keys(row);
    this.run(`INSERT INTO ${this.table(row.type)} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row));
  }
  patch(type, id, values) {
    const keys = Object.keys(values);
    this.run(`UPDATE ${this.table(type)} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`, ...Object.values(values), id);
  }
  log(guild, event, data) { this.run('INSERT INTO moderation_logs(guild_id,event,data,created_at) VALUES (?,?,?,?)', guild, event, JSON.stringify(data), Date.now()); }
  createSession(guild, owner, command, state, minutes) {
    const session = { id: randomUUID(), guild_id: guild, owner_id: owner, command, state, expires_at: Date.now() + minutes * 60000, done: 0 };
    this.run('INSERT INTO sessions VALUES (?,?,?,?,?,?,0)', session.id, guild, owner, command, JSON.stringify(state), session.expires_at);
    return session;
  }
  session(id) { const row = this.get('SELECT * FROM sessions WHERE id=?', id); return row && { ...row, state: JSON.parse(row.state) }; }
  saveSession(s) { this.run('UPDATE sessions SET state=?,done=? WHERE id=?', JSON.stringify(s.state), s.done, s.id); }
  close() { this.db.close(); }
}

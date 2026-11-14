import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function files(path) { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : e.name.endsWith('.js') ? [join(path, e.name)] : []); }
for (const file of ['src', 'config', 'test', 'scripts'].flatMap(files)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
console.log('Syntaxe JavaScript vérifiée.');

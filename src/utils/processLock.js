import { openSync, readFileSync, writeFileSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// SQLite n'est pas une file de tâches multi-processus : interdire deux instances sur la même base.
export function acquireLock(databasePath) {
  const path = `${resolve(databasePath)}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeFileSync(fd, String(process.pid)); closeSync(fd);
      return () => { try { if (readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); } catch {} };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(path, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Verrou invalide : vérifiez les instances DSB avant de supprimer le fichier .lock.');
      try { process.kill(pid, 0); }
      catch (check) { if (check.code === 'ESRCH') { unlinkSync(path); continue; } }
      throw new Error('Une instance DSB utilise déjà cette base.');
    }
  }
  throw new Error('Impossible de verrouiller la base.');
}

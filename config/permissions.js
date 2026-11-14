import { emojis as e } from './emojis.js';
export const grades = {
  0: { name: 'Aucun', emoji: '▫️' }, 1: { name: 'Friends', emoji: e.friends },
  2: { name: 'Trusted', emoji: e.trusted }, 3: { name: 'System', emoji: e.system },
  4: { name: 'Dev', emoji: e.dev }, 5: { name: 'Super Dev', emoji: e.superdev },
};
export const minimums = {
  help: 0, bl: 2, unbl: 2, mybl: 2, clearmybl: 2,
  wipe: 3, unwipe: 3, mywipe: 3, clearmywipe: 3,
  grade: 4, clearbl: 5, clearwipe: 5, hakai: 5,
};
export const gradeLabel = level => `${grades[level]?.emoji || '▫️'} ${grades[level]?.name || 'Aucun'}`;

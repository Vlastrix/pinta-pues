import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';

test('ranking: top 10, acumulación, empates, apodo actual e invitados excluidos', () => {
  const store = new Store(':memory:');
  try {
    assert.deepEqual(store.leaderboard(), []);
    for (let i = 0; i < 12; i++) {
      const id = `user-${i.toString().padStart(2, '0')}`;
      store.db.prepare('INSERT INTO users(id, email, password_hash) VALUES (?, ?, ?)').run(id, `${id}@example.com`, 'hash');
      store.saveResult('ABC123', [{ userId: id, name: `Jugador ${i}`, score: i * 100, avatar: 'pinta-pues-2' }, { name: 'Invitado', score: 99999 }]);
    }
    store.saveResult('ABC124', [
      { userId: 'user-00', name: 'Nuevo apodo', avatar: 'pinta-pues-5', score: 1100 },
      { userId: 'user-01', name: 'Empatado', score: 1100 },
    ]);
    const entries = store.leaderboard('user-00');
    assert.equal(entries.length, 10);
    assert.deepEqual(entries.map(entry => entry.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(entries[0].name, 'Empatado'); assert.equal(entries[0].points, 1200);
    assert.equal(entries[1].name, 'Nuevo apodo'); assert.equal(entries[1].points, 1100);
    assert.equal(entries[1].avatar, 'pinta-pues-5'); assert.equal(entries[1].games, 2); assert.equal(entries[1].wins, 1); assert.equal(entries[1].isYou, true);
    assert.equal(entries[2].name, 'Jugador 11'); assert.equal(entries[2].wins, 0);
    assert.equal(entries.filter(entry => entry.isYou).length, 1);
    assert.ok(!JSON.stringify(entries).includes('example.com')); assert.ok(!JSON.stringify(entries).includes('user-'));
    store.saveResult('ABC125', [{ userId: 'user-00', name: 'Nuevo apodo', score: 0 }]);
    assert.equal(store.leaderboard().find(entry => entry.name === 'Nuevo apodo')!.wins, 1);
  } finally { store.close(); }
});

test('ranking y resultados se guardan en una sola transacción', () => {
  const store = new Store(':memory:');
  try {
    store.db.exec("CREATE TRIGGER fail_ranking BEFORE INSERT ON leaderboard BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
    assert.throws(() => store.saveResult('ABC123', [{ userId: 'user', name: 'Jugador', score: 100 }]));
    assert.equal((store.db.prepare('SELECT COUNT(*) AS count FROM results').get() as { count: number }).count, 0);
    assert.deepEqual(store.leaderboard(), []);
  } finally { store.close(); }
});

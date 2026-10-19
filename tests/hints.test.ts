import test from 'node:test';
import assert from 'node:assert/strict';
import { hintSteps, maskWord } from '../server/hints.js';

test('pistas progresivas: posiciones correctas, acumulativas, sin revelar la respuesta completa', () => {
  for (const word of ['sol', 'gato', 'conejo', 'marraqueta', 'electroencefalografista', 'salteña', 'api morado', 'base de datos', 'wifi', 'aa', 'x', 'C++', 'Pokébola', 'teórico-práctico', 'e\u0301poca', 'abc123']) {
    const normalized = Array.from(word.normalize('NFC'));
    const total = normalized.filter(character => /[\p{L}\p{N}]/u.test(character)).length;
    const steps = hintSteps(word);
    assert.equal(steps.length, Math.floor(total / 2));
    if (steps.length <= 3) assert.deepEqual(steps.map(step => step.progress), [0.35, 0.6, 0.8].slice(0, steps.length));
    else {
      assert.equal(steps[0].progress, 0.35);
      assert.ok(Math.abs(steps.at(-1)!.progress - 0.8) < 0.000001);
      steps.forEach((step, index) => { if (index) assert.ok(step.progress > steps[index - 1].progress); });
    }
    let previous = Array.from(maskWord(word));
    for (const [index, step] of steps.entries()) {
      const hint = Array.from(step.hint);
      assert.equal(hint.length, normalized.length);
      let revealed = 0;
      hint.forEach((character, position) => {
        if (character !== '_') assert.equal(character, normalized[position]);
        if (previous[position] !== '_') assert.equal(character, previous[position]);
        if (/[\p{L}\p{N}]/u.test(character)) revealed++;
      });
      assert.equal(revealed, index + 1);
      assert.ok(revealed <= total / 2);
      assert.notEqual(step.hint, word.normalize('NFC'));
      previous = hint;
    }
  }
  assert.equal(maskWord('api morado'), '___ ______');
  assert.equal(maskWord('teórico-práctico'), '_______-________');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingParts, completedParts, personalHint } from '../server/partialGuesses.js';
import { maskWord } from '../server/hints.js';

test('partes: palabras completas, frases contiguas y normalización sin aceptar fragmentos ni texto ajeno', () => {
  assert.deepEqual(matchingParts('candado digital', 'CANDADO!'), ['candado']);
  assert.deepEqual(matchingParts('árbol de Navidad', 'ARBOL DE'), ['arbol', 'de']);
  assert.deepEqual(matchingParts('teórico-práctico', 'practico'), ['practico']);
  for (const text of ['cand', 'digi', 'un candado', 'candado desconocido digital', 'digital candado', '!!!']) {
    assert.deepEqual(matchingParts('candado digital', text), []);
  }
  assert.deepEqual(matchingParts('candado', 'cand'), []);
  assert.deepEqual(matchingParts('candado digital', 'candado digital'), []);
  assert.equal(completedParts('candado digital', new Set(['candado'])), false);
  assert.equal(completedParts('candado digital', new Set(['digital', 'candado'])), true);
  assert.equal(completedParts('muy muy lejos', new Set(['muy', 'lejos'])), true);
});

test('pista personal: conserva tildes, separadores y letras del reloj sin descubrir las otras partes', () => {
  assert.equal(personalHint('candado digital', '_______ _______', new Set(['candado'])), 'candado _______');
  assert.equal(personalHint('candado digital', '_a_____ d____a_', new Set(['candado'])), 'candado d____a_');
  assert.equal(personalHint('árbol de Navidad', maskWord('árbol de Navidad'), new Set(['arbol', 'de'])), 'árbol de _______');
  assert.equal(personalHint('teórico-práctico', maskWord('teórico-práctico'), new Set(['practico'])), '_______-práctico');
  assert.equal(personalHint('e\u0301poca digital', maskWord('época digital'), new Set(['epoca'])), 'época _______');
  assert.equal(personalHint('candado digital', '_______ _______'), '_______ _______');
});

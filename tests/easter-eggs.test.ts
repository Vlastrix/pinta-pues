import test from 'node:test';
import assert from 'node:assert/strict';
import { chatEasterEgg, creatorPrank, startEasterEgg } from '../server/easterEggs.js';
import { motdMessages } from '../shared/motd.js';
import { normalize } from '../server/store.js';

test('broma al creador: tres frases, mayúsculas, espacios y límites de palabra', () => {
  for (const text of ['Vladi fresco', 'VLADI GRAN PVTA', 'vladi puto', 'jaja VlAdI   FrEsCo!', 'Vladi gran  pvta']) assert.equal(creatorPrank(text), true, text);
  for (const text of ['hola Vladi', 'Vladi frescor', 'Vladi putoso', 'otrovladi fresco', 'Vladi gran persona']) assert.equal(creatorPrank(text), false, text);
});

test('easter eggs de chat: comandos, frase, variantes y vocabulario del MOTD', () => {
  assert.equal(chatEasterEgg('Es un ERROR de CAPA 8, pues'), 'Se detectó un problema entre la silla y la pantalla');
  assert.equal(chatEasterEgg('error de capa 80'), null);
  assert.equal(chatEasterEgg('hola tropa'), null);
  assert.equal(chatEasterEgg('/momazos extra'), null);
  assert.equal(chatEasterEgg(' /MOMAZOS ', undefined, () => 0), `Momazos Diego · ${motdMessages[0]}`);
  assert.equal(chatEasterEgg('/momazos', undefined, () => .999), `Momazos Diego · ${motdMessages.at(-1)}`);
});

test('easter eggs no revelan la respuesta a través de sus mensajes', () => {
  assert.equal(chatEasterEgg('error de capa 8', 'silla'), null);
  assert.equal(chatEasterEgg('/protocolo3', 'tropa'), null);
  assert.equal(chatEasterEgg('/momazos', 'Diego'), null);
  for (const random of [() => 0, () => .5, () => .999]) {
    const message = chatEasterEgg('/momazos', 'dibujo', random);
    assert.ok(message); assert.ok(!normalize(message).includes('dibujo'));
  }
});

test('inicio filosófico: probabilidad del 20% sin cambiar el juego', () => {
  assert.equal(startEasterEgg(() => 0), 'Compilando talento… no se encontraron dependencias');
  assert.ok(startEasterEgg(() => .199));
  assert.equal(startEasterEgg(() => .2), null);
  assert.equal(startEasterEgg(() => .999), null);
});

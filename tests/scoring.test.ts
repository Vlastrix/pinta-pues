import test from 'node:test';
import assert from 'node:assert/strict';
import { finalGuessWindow, firstGuessPoints, followingGuessPoints, painterPoints } from '../server/scoring.js';

test('ventana final: 50% de la duración original, sin añadir tiempo', () => {
  for (const seconds of [30, 60, 100, 120, 180]) {
    assert.equal(finalGuessWindow(seconds * 1000, seconds * 1000), seconds * 500);
    assert.equal(finalGuessWindow(seconds * 1000, 2000), 2000);
  }
  assert.equal(finalGuessWindow(100000, -1), 0);
});

test('aciertos posteriores: 10–50 puntos según la ventana real, independientes de su duración', () => {
  for (const window of [1000, 9000, 30000, 54000]) {
    assert.equal(followingGuessPoints(window, window), 50);
    assert.equal(followingGuessPoints(window * .75, window), 40);
    assert.equal(followingGuessPoints(window * .5, window), 30);
    assert.equal(followingGuessPoints(window * .25, window), 20);
    assert.equal(followingGuessPoints(0, window), 10);
    assert.equal(followingGuessPoints(window * 2, window), 50);
  }
  assert.equal(followingGuessPoints(0, 0), 10);
});

test('pintor: máximo 60, proporción de aciertos y sin castigo si nadie acierta', () => {
  for (const players of [1, 2, 3, 6, 11]) {
    assert.equal(painterPoints(players, players), 60);
    assert.equal(painterPoints(0, players), 0);
  }
  assert.equal(painterPoints(1, 2), 30);
  assert.equal(painterPoints(1, 3), 20);
  assert.equal(painterPoints(2, 3), 40);
  assert.equal(painterPoints(0, 0), 0);
});

test('duelo: rapidez del adivinador 30–60 y pintor hasta 30, sin alterar grupos', () => {
  for (const duration of [30000, 60000, 100000, 180000]) {
    assert.equal(firstGuessPoints(duration, duration, true), 60);
    assert.equal(firstGuessPoints(duration * .75, duration, true), 53);
    assert.equal(firstGuessPoints(duration * .5, duration, true), 45);
    assert.equal(firstGuessPoints(0, duration, true), 30);
    assert.equal(firstGuessPoints(duration * 2, duration, true), 60);
    assert.equal(firstGuessPoints(0, duration, false), 60);
  }
  assert.equal(painterPoints(1, 1, true), 30);
  assert.equal(painterPoints(0, 1, true), 0);
  assert.equal(painterPoints(1, 1, false), 60);
});

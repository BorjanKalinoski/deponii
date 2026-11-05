import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWaste, isUnstated, MATERIALS } from '../assets/lib/materials.js';

test('unstated values: empty, a slash, a dash or a question mark', () => {
  for (const v of ['', '  ', '/', '//', '-', '–', '—', '?', ' / ', null, undefined]) {
    assert.equal(isUnstated(v), true, JSON.stringify(v));
  }
  for (const v of ['0', 'x', 'Комунален', '/a']) assert.equal(isUnstated(v), false, v);
});

test('an unstated description is unknown waste: no materials, not other, not mixed', () => {
  for (const v of ['', '/', '-', null]) {
    assert.deepEqual(classifyWaste(v), { unknown: true, other: false, mixed: false, materials: [], icon: 'unknown' });
  }
});

test('each material is recognised from the source wording, in any case or ending', () => {
  const cases = {
    municipal: ['Комунален отпад', 'КОМУНАЛЕН'],
    construction: ['Градежен', 'Градежен шут', 'шут'],
    bulky: ['Кабаст отпад'],
    industrial: ['Индустриски'],
    bio: ['Био-отпад', 'биоразградлив'],
    agricultural: ['Земјоделски'],
    packaging: ['Пакување', 'Амбалажа'],
  };
  for (const [m, texts] of Object.entries(cases)) {
    for (const text of texts) {
      const w = classifyWaste(text);
      assert.deepEqual(w.materials, [m], text);
      assert.equal(w.icon, m, text);
      assert.equal(w.mixed, false, text);
      assert.equal(w.other, false, text);
      assert.equal(w.unknown, false, text);
    }
  }
  assert.deepEqual(MATERIALS, ['municipal', 'construction', 'bulky', 'industrial', 'bio', 'agricultural', 'packaging']);
});

test('two or more materials are mixed, whatever the word order', () => {
  const a = classifyWaste('Комунален и градежен');
  const b = classifyWaste('Градежен и комунален');
  assert.deepEqual(a.materials, b.materials);
  assert.deepEqual(a.materials, ['municipal', 'construction']);
  assert.equal(a.icon, 'mixed');
  assert.equal(a.mixed, true);
  const three = classifyWaste('Комунален, градежен и кабаст');
  assert.deepEqual(three.materials, ['municipal', 'construction', 'bulky']);
  assert.equal(three.icon, 'mixed');
});

test('a description that calls itself mixed is mixed, keeping what it names', () => {
  const w = classifyWaste('Мешан комунален');
  assert.equal(w.icon, 'mixed');
  assert.equal(w.mixed, true);
  assert.deepEqual(w.materials, ['municipal']);
  const vague = classifyWaste('Мешан отпад');
  assert.equal(vague.icon, 'mixed');
  assert.deepEqual(vague.materials, []);
  assert.equal(vague.other, true, 'no named material, so it also counts as other');
});

test('stated but unrecognised wording is other, never guessed', () => {
  const w = classifyWaste('Опасен отпад');
  assert.deepEqual(w, { unknown: false, other: true, mixed: false, materials: [], icon: 'other' });
  assert.equal(classifyWaste('гуми').icon, 'other');
});

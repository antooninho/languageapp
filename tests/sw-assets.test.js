import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const src = readFileSync('sw.js', 'utf8');
const assets = JSON.parse(src.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const listFiles = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

test('chaque fichier du précache existe', () => {
  for (const a of assets.filter(a => a !== './')) assert.ok(existsSync(a), `manquant : ${a}`);
});
test('chaque fichier JS/CSS/données/icône est précaché', () => {
  const expected = ['js', 'css', 'data', 'icons'].flatMap(listFiles).map(f => './' + f)
    .concat(['./index.html', './manifest.webmanifest']);
  for (const f of expected) assert.ok(assets.includes(f), `non précaché : ${f}`);
});

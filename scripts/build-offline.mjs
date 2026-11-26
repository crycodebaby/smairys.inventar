import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const source = await readFile('src/app-worker.js', 'utf8');
const assets = (await readdir('dist/assets')).filter(name => /\.(?:js|css)$/.test(name)).sort();
const files = ['index.html', 'manifest.webmanifest', 'app-icon.svg', ...assets.map(name => 'assets/' + name)];
const manifest = await Promise.all(files.map(async file => ({
  url: '/' + file,
  hash: digest(await readFile(join('dist', file))),
})));
const version = digest(source + JSON.stringify(manifest)).slice(0, 20);
await writeFile('dist/sw.js', `const BUILD = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(manifest)};\n${source}`);
console.log(`Offline-Oberfläche ${version} · ${files.length} Dateien`);

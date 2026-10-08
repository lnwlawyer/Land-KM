// Prepare a project-site artifact without modifying production source files.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dir = resolve(process.argv[2] || '_site');
const prefix = '/Land-KM/';
const htmlPath = join(dir, 'index.html');
const manifestPath = join(dir, 'manifest.webmanifest');
let html = readFileSync(htmlPath, 'utf8');
for (const name of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png']) {
  html = html.replaceAll(`"/${name}"`, `"${prefix}${name}"`);
}
html = html.replaceAll("'/sw.js'", "'/Land-KM/sw.js'").replaceAll('"/sw.js"', '"/Land-KM/sw.js"');
if (!html.includes('src="/Land-KM/startup-recovery.js"')) {
  html = html.replace('</head>', '  <script defer src="/Land-KM/startup-recovery.js"></script>\n</head>');
}
writeFileSync(htmlPath, html);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.id = prefix;
manifest.start_url = prefix;
manifest.scope = prefix;
for (const icon of manifest.icons || []) {
  if (icon.src.startsWith('/')) icon.src = prefix + icon.src.slice(1);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('GitHub Pages artifact prepared for ' + prefix);

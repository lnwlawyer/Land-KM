// Prepare a project-site artifact without modifying production source files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';

const dir = resolve(process.argv[2] || '_site');
const prefix = '/Land-KM/';
const htmlPath = join(dir, 'index.html');
for (const required of ['index.html', 'manifest.webmanifest', 'sw.js', 'startup-recovery.js', 'home-navigation.js', 'home-navigation.css', 'search-shortcuts.js', 'search-shortcuts.css', 'search-results-readable.css', 'back-to-top.js', 'back-to-top.css', 'guides-title-search.js', 'guides-title-search.css', 'icons/icon-192.png', 'icons/apple-touch-icon.png']) {
  if (!existsSync(join(dir, required))) throw new Error('Missing Pages release asset: ' + required);
}
const manifestPath = join(dir, 'manifest.webmanifest');
let html = readFileSync(htmlPath, 'utf8');
for (const name of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png']) {
  html = html.replaceAll(`"/${name}"`, `"${prefix}${name}"`);
}
html = html.replaceAll("'/sw.js'", "'/Land-KM/sw.js'").replaceAll('"/sw.js"', '"/Land-KM/sw.js"');
if (!html.includes('href="/Land-KM/home-navigation.css"')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="/Land-KM/home-navigation.css">\n</head>');
}
if (!html.includes('src="/Land-KM/home-navigation.js"')) {
  html = html.replace('</head>', '  <script defer src="/Land-KM/home-navigation.js"></script>\n</head>');
}
if (!html.includes('href="/Land-KM/search-shortcuts.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/Land-KM/search-shortcuts.css">\n</head>');
if (!html.includes('src="/Land-KM/search-shortcuts.js"')) html = html.replace('</head>', '  <script defer src="/Land-KM/search-shortcuts.js"></script>\n</head>');
if (!html.includes('href="/Land-KM/search-results-readable.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/Land-KM/search-results-readable.css">\n</head>');
if (!html.includes('href="/Land-KM/back-to-top.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/Land-KM/back-to-top.css">\n</head>');
if (!html.includes('src="/Land-KM/back-to-top.js"')) html = html.replace('</head>', '  <script defer src="/Land-KM/back-to-top.js"></script>\n</head>');
if (!html.includes('href="/Land-KM/guides-title-search.css"')) html = html.replace('</head>', '  <link rel="stylesheet" href="/Land-KM/guides-title-search.css">\n</head>');
if (!html.includes('src="/Land-KM/guides-title-search.js"')) html = html.replace('</head>', '  <script defer src="/Land-KM/guides-title-search.js"></script>\n</head>');
if (!html.includes('src="/Land-KM/startup-recovery.js"')) {
  html = html.replace('</head>', '  <script defer src="/Land-KM/startup-recovery.js"></script>\n</head>');
}
if (!html.includes('src="/Land-KM/startup-recovery.js"')) throw new Error('Startup recovery script missing from release HTML');
writeFileSync(htmlPath, html);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.id = prefix;
manifest.start_url = prefix;
manifest.scope = prefix;
for (const icon of manifest.icons || []) {
  if (icon.src.startsWith('/') && !icon.src.startsWith(prefix)) icon.src = prefix + icon.src.slice(1);
}
for (const [field, value] of Object.entries({ id: manifest.id, start_url: manifest.start_url, scope: manifest.scope })) {
  if (value !== prefix) throw new Error('Invalid Pages manifest ' + field);
}
for (const icon of manifest.icons || []) {
  if (!icon.src.startsWith(prefix)) throw new Error('Icon outside Pages scope: ' + icon.src);
  const iconPath = resolve(dir, icon.src.slice(prefix.length));
  const relativeIconPath = relative(dir, iconPath);
  if (!relativeIconPath || relativeIconPath === '..' || relativeIconPath.startsWith('../') || relativeIconPath.startsWith('..\\\\') || isAbsolute(relativeIconPath)) throw new Error('Unsafe manifest icon path: ' + icon.src);
  if (!existsSync(iconPath)) throw new Error('Missing manifest icon: ' + icon.src);
}
if (html.includes('src="/startup-recovery.js"')) throw new Error('Unscoped recovery script URL');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('GitHub Pages artifact prepared for ' + prefix);

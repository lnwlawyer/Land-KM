#!/usr/bin/env node
// Offline development safety gate. No Firebase API requests are made.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8'));
const allowed = 'demo-land-km';
const vars = ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT', 'FIREBASE_PROJECT_ID'];

let unsafe = config.projects?.default !== allowed;
if (unsafe) console.error('BLOCKED: .firebaserc default must be demo-land-km on the development branch.');
for (const key of vars) {
  if (process.env[key] && process.env[key] !== allowed) {
    console.error(`BLOCKED: ${key} must be demo-land-km.`);
    unsafe = true;
  }
}
if (unsafe) process.exit(1);
console.log('PASS: development project settings are emulator-only (demo-land-km).');

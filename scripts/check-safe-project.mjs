#!/usr/bin/env node
// Safety gate for local/CI development. Never accesses Firebase services.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, '.firebaserc'), 'utf8'));
const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT || process.env.FIREBASE_PROJECT_ID || '';
const allowed = 'demo-land-km';

if (project && project !== allowed) {
  console.error('BLOCKED: Firebase project must be demo-land-km for development and CI.');
  process.exit(1);
}
if (config.projects?.default === allowed) {
  console.log('SAFE: default Firebase project is demo-land-km.');
} else {
  console.log('NOTICE: .firebaserc default is production; use --project demo-land-km explicitly.');
}
console.log('SAFE: no Firebase API calls or deployments performed.');

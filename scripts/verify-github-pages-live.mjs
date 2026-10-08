// Read-only post-deployment checks for the public GitHub Pages site.
// Uses no GitHub token, Firebase credentials, or production data.
export const SITE = 'https://lnwlawyer.github.io/Land-KM/';
export async function checkSite(fetchImpl = fetch) {
  const checks = [];
  for (const [path, type] of [['', 'html'], ['manifest.webmanifest', 'manifest'], ['sw.js', 'worker']]) {
    try {
      const response = await fetchImpl(SITE + path, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } });
      let ok = response.ok;
      if (ok && type === 'manifest') {
        const data = await response.json();
        ok = data.id === '/Land-KM/' && data.start_url === '/Land-KM/' && data.scope === '/Land-KM/';
      }
      checks.push({ path: '/' + path, status: response.status, ok });
    } catch { checks.push({ path: '/' + path, status: null, ok: false }); }
  }
  return { ok: checks.every(item => item.ok), checks };
}
export async function verify(fetchImpl = fetch, { attempts = 12, delayMs = 10000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await checkSite(fetchImpl);
    if (result.ok) return { ...result, attempts: attempt };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ...result, attempts };
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1].replace(/\\/g, '/')).href) {
  const result = await verify();
  const lines = ['### GitHub Pages post-deploy verification', '', '- Site: ' + SITE, '- Result: ' + (result.ok ? 'PASS' : 'FAIL'), '- Attempts: ' + result.attempts, ...result.checks.map(x => '- ' + x.path + ': ' + (x.ok ? 'PASS' : 'FAIL') + ' (HTTP ' + (x.status ?? 'unavailable') + ')')];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
  if (!result.ok) process.exitCode = 1;
}

// Standalone, dependency-free MCP stdio server for one approved GitHub Pages workflow.
// Secrets are read from the process environment, never from chat arguments.
import { createInterface } from 'node:readline';

export const OWNER = 'lnwlawyer';
export const REPO = 'Land-KM';
export const WORKFLOW = 'publish-pages.yml';
export const BRANCH = 'main';
const API = 'https://api.github.com';
const TOOLS = [
  { name: 'deploy_land_km', description: 'Manually dispatch the approved Land-KM GitHub Pages workflow on main. Only call after the user explicitly requests production deployment.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_deploy_status', description: 'Read the latest Land-KM GitHub Pages workflow runs and their status.', inputSchema: { type: 'object', properties: { run_id: { type: 'integer', minimum: 1 } }, additionalProperties: false } },
  { name: 'get_deploy_logs', description: 'Read failed step summaries and job annotations for a Land-KM deployment (no raw archive downloads).', inputSchema: { type: 'object', properties: { run_id: { type: 'integer', minimum: 1 } }, required: ['run_id'], additionalProperties: false } }
];
export async function github(path, { method = 'GET', body, token = process.env.LAND_KM_GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  if (!token) throw new Error('LAND_KM_GITHUB_TOKEN is not configured');
  if (!path.startsWith('/repos/lnwlawyer/Land-KM/') || path.includes('://') || path.includes('..')) throw new Error('GitHub API path outside allowed repository');
  const response = await fetchImpl(API + path, {
    method, redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'land-km-deploy-mcp', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error('GitHub API returned HTTP ' + response.status);
  if (response.status === 204) return null;
  return response.json();
}
const base = '/repos/' + OWNER + '/' + REPO;
export async function invoke(name, args = {}, api = github) {
  if (!TOOLS.some(tool => tool.name === name)) throw new Error('Unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments');
  const allowed = name === 'deploy_land_km' ? [] : ['run_id'];
  if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unexpected argument');
  if ('run_id' in args && (!Number.isSafeInteger(args.run_id) || args.run_id < 1)) throw new Error('Invalid run_id');
  if (name === 'deploy_land_km') {
    await api(base + '/actions/workflows/' + WORKFLOW + '/dispatches', { method: 'POST', body: { ref: BRANCH } });
    return { dispatched: true, repository: OWNER + '/' + REPO, workflow: WORKFLOW, branch: BRANCH, note: 'Dispatch accepted; use get_deploy_status to confirm outcome.' };
  }
  if (name === 'get_deploy_status') {
    if (args.run_id) {
      const run = await api(base + '/actions/runs/' + args.run_id);
      if (run.path && !run.path.endsWith('/' + WORKFLOW)) throw new Error('Run belongs to a different workflow');
      return { id: run.id, status: run.status, conclusion: run.conclusion, html_url: run.html_url, head_sha: run.head_sha, event: run.event, created_at: run.created_at };
    }
    const data = await api(base + '/actions/workflows/' + WORKFLOW + '/runs?branch=' + BRANCH + '&per_page=5');
    return (data.workflow_runs || []).map(run => ({ id: run.id, status: run.status, conclusion: run.conclusion, html_url: run.html_url, head_sha: run.head_sha, event: run.event, created_at: run.created_at }));
  }
  if (!args.run_id) throw new Error('run_id is required');
  const run = await api(base + '/actions/runs/' + args.run_id);
  if (run.path && !run.path.endsWith('/' + WORKFLOW)) throw new Error('Run belongs to a different workflow');
  const data = await api(base + '/actions/runs/' + args.run_id + '/jobs?per_page=100');
  return { run_id: args.run_id, jobs: (data.jobs || []).map(job => ({
    id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, html_url: job.html_url,
    steps: (job.steps || []).filter(step => step.conclusion === 'failure' || step.conclusion === 'cancelled').map(step => ({ name: step.name, conclusion: step.conclusion, number: step.number }))
  })) };
}
export async function handle(message, api = github) {
  if (message.jsonrpc !== '2.0' || !message.method) return { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32600, message: 'Invalid request' } };
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
  if (message.method === 'initialize') return { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'land-km-deploy', version: '1.0.0' } } };
  if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id, result: {} };
  if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } };
  if (message.method === 'tools/call') {
    try {
      const result = await invoke(message.params?.name, message.params?.arguments || {}, api);
      return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } catch (error) {
      return { jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: String(error.message).slice(0, 300) }] } };
    }
  }
  return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } };
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1].replaceAll('\\', '/')).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const message = JSON.parse(line);
      const response = await handle(message);
      if (response) process.stdout.write(JSON.stringify(response) + '\\n');
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\\n');
    }
  }
}

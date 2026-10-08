import test from 'node:test';
import assert from 'node:assert/strict';
import { invoke, handle, github } from '../tools/land-km-deploy-mcp.mjs';

test('MCP server exposes exactly three scoped tools', async () => {
  const response = await handle({ jsonrpc:'2.0', id:1, method:'tools/list' });
  assert.deepEqual(response.result.tools.map(tool => tool.name), ['deploy_land_km','get_deploy_status','get_deploy_logs']);
});
test('Deployment dispatch only targets approved workflow and main', async () => {
  const calls=[];
  const api=async (path, options) => { calls.push({path,options}); return null; };
  const result=await invoke('deploy_land_km',{},api);
  assert.equal(result.dispatched,true);
  assert.deepEqual(calls,[{path:'/repos/lnwlawyer/Land-KM/actions/workflows/publish-pages.yml/dispatches',options:{method:'POST',body:{ref:'main'}}}]);
  await assert.rejects(invoke('deploy_land_km',{ref:'other'},api),/Unexpected argument/);
});
test('Status and failure steps are read-only and validate run IDs', async () => {
  const calls=[];
  const api=async path=>{
    calls.push(path);
    if(path.endsWith('/jobs?per_page=100')) return {jobs:[{id:5,name:'publish',status:'completed',conclusion:'failure',steps:[{name:'Prepare',conclusion:'success'},{name:'Build',conclusion:'failure',number:3}]}]};
    if(path.endsWith('/runs/123')) return {id:123,path:'.github/workflows/publish-pages.yml',status:'completed',conclusion:'failure'};
    return {workflow_runs:[{id:123,status:'completed',conclusion:'failure'}]};
  };
  assert.equal((await invoke('get_deploy_status',{},api))[0].id,123);
  const result=await invoke('get_deploy_logs',{run_id:123},api);
  assert.deepEqual(result.jobs[0].steps,[{name:'Build',conclusion:'failure',number:3}]);
  assert.ok(calls.every(path=>path.startsWith('/repos/lnwlawyer/Land-KM/')));
  await assert.rejects(invoke('get_deploy_logs',{run_id:0},api),/Invalid run_id/);
  await assert.rejects(invoke('get_deploy_status',{run_id:123},async()=>({path:'.github/workflows/other.yml'})),/different workflow/);
});
test('API does not redirect, never embeds tokens in errors and enforces repo',async()=>{
  let request;
  const fakeFetch=async (url,options)=>{request={url,options};return {ok:false,status:403};};
  await assert.rejects(github('/repos/lnwlawyer/Land-KM/actions/runs',{token:'test-secret',fetchImpl:fakeFetch}),/HTTP 403/);
  assert.equal(request.options.redirect,'error');
  assert.equal(request.options.headers.Authorization,'Bearer test-secret');
  await assert.rejects(github('/repos/other/repo/actions/runs',{token:'test-secret',fetchImpl:fakeFetch}),/outside allowed repository/);
});
test('MCP errors are returned as tool errors without leaking details',async()=>{
  const result=await handle({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'deploy_land_km',arguments:{ref:'feature'}}},async()=>{throw new Error('should not dispatch')});
  assert.equal(result.result.isError,true);
  assert.match(result.result.content[0].text,/Unexpected argument/);
});

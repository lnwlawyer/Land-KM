import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/startup-recovery.js', import.meta.url), 'utf8');

function runScenario({ shellVisible, gateVisible }) {
  const listeners = new Map();
  const elements = new Map();
  const createElement = tag => ({
    tag, hidden:false, style:{}, children:[],
    setAttribute(){}, addEventListener(name, fn){this['on'+name]=fn;},
    append(...nodes){this.children.push(...nodes);},
    textContent:'', type:''
  });
  const body = createElement('body');
  const shell = createElement('div'); shell.hidden = !shellVisible;
  const gate = createElement('div'); gate.hidden = !gateVisible;
  elements.set('appShell',shell); elements.set('authGate',gate);
  const document = {
    body, createElement, getElementById:id=>elements.get(id),
    addEventListener(name, fn){listeners.set('document:'+name,fn);}
  };
  const window = {
    addEventListener(name,fn){listeners.set(name,fn);},
    setTimeout(fn){listeners.set('timeout',fn);},
    location:{reload(){listeners.set('reloaded',true);}}
  };
  runInNewContext(source,{document,window,getComputedStyle:()=>({display:'block'})});
  const panel = body.children.find(x=>x.id==='landKmStartupRecovery');
  assert.ok(panel);
  return {panel,listeners};
}

test('usable application does not display global recovery for background rejection',()=>{
  const {panel,listeners}=runScenario({shellVisible:true,gateVisible:false});
  listeners.get('unhandledrejection')();
  listeners.get('timeout')();
  assert.equal(panel.hidden,true);
});

test('visible sign-in gate does not trigger false startup failure',()=>{
  const {panel,listeners}=runScenario({shellVisible:false,gateVisible:true});
  listeners.get('timeout')();
  assert.equal(panel.hidden,true);
});

test('blank startup reveals accessible recovery and retry action',()=>{
  const {panel,listeners}=runScenario({shellVisible:false,gateVisible:false});
  listeners.get('timeout')();
  assert.equal(panel.hidden,false);
  assert.equal(panel.children[1].textContent,'ลองโหลดใหม่');
  panel.children[1].onclick();
  assert.equal(listeners.get('reloaded'),true);
});

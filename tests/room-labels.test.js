'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const L=require('../js/room-labels.js');
test('templates preserve authored order, prefixes, repeated tokens and alignment',()=>{
  const template={name:'宽盒',lines:['基因：{{gene}}','编号 {{ id }} / {{id}}','备注：{{note}}'],fontSize:16,align:'right'};
  const result=L.renderLabel({template,labels:[],values:{id:'H-001',gene:'Albino',note:'周三复称'}});
  assert.deepEqual(result.lines,['基因：Albino','编号 H-001 / H-001','备注：周三复称']);assert.equal(result.align,'right');assert.equal(result.fontSize,16);
});
test('HTML and expression inputs are data, never template code',()=>{
  const template={...L.defaultTemplate(),lines:['<b>{{note}}</b>']};
  const result=L.renderLabel({template,values:{note:'<img src=x onerror="alert(1)"> & {{id}}'}});
  assert.equal(result.lines[0],'<b><img src=x onerror="alert(1)"> & {{id}}</b>');assert(!result.escapedLines[0].includes('<'));assert(result.escapedLines[0].includes('&lt;img'));
  for(const token of ['constructor','__proto__','id.toUpperCase()','unknown'])assert.equal(L.validateTemplate({...template,lines:[`{{${token}}}`]}).valid,false);
});
test('malformed templates reject unknown fields, unclosed braces and oversized settings',()=>{
  const defaults=L.defaultTemplate();for(const patch of [{lines:['{{id']},{lines:['id}}']},{lines:[]},{lines:Array(7).fill('x')},{lines:['x'.repeat(161)]},{lines:['a\nb']},{fontSize:21},{fontSize:11},{fontSize:'12'},{align:'justify'},{name:''}])assert.equal(L.validateTemplate({...defaults,...patch}).valid,false,JSON.stringify(patch));
  assert.equal(L.validateTemplate(defaults).valid,true);
});
test('legacy labels remain opt-in without stray separators and invalid templates fall back safely',()=>{
  const values={id:'S-1',sex:'♀',gene:'Conda',weight:'35g',mouse:'3–4g',next:'周二 18:00'};
  assert.deepEqual(L.renderLabel({labels:['id','weight'],values}).lines,['S-1','35g']);
  const result=L.renderLabel({template:{...L.defaultTemplate(),lines:['{{bad}}']},labels:['id'],values});assert(result.errors.length);assert.deepEqual(result.lines,['S-1']);
});
test('compact layout always preserves identity and mouse weight while full notes remain accessible',()=>{
  const result=L.renderLabel({template:{...L.defaultTemplate(),lines:['{{note}}'],fontSize:12},compact:true,values:{id:'H001',mouse:'16–20g',note:'敏感个体，观察进食'}});
  assert.deepEqual(result.lines,['H001','16–20g']);assert.equal(result.fontSize,12);assert.equal(result.ariaLabel,'敏感个体，观察进食');assert.deepEqual(result.fullLines,['敏感个体，观察进食']);
});
test('all configuration and data arguments remain immutable',()=>{const template=L.defaultTemplate(),before=JSON.stringify(template),values={note:'a\nb'};L.renderLabel({template,values});assert.equal(JSON.stringify(template),before);assert.equal(values.note,'a\nb');});

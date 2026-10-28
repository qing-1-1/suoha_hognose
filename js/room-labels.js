(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SuohaRoomLabels=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const tokens=Object.freeze(['id','sex','gene','weight','mouse','next','note']);
  const escapeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function defaultTemplate(){return {name:'默认标签',lines:['{{id}}','{{sex}} · {{gene}} · {{weight}}','{{mouse}} · {{next}}','{{note}}'],fontSize:12,align:'left'};}
  function validateTemplate(template){
    const errors=[];
    if(!template||typeof template!=='object'||Array.isArray(template))return {valid:false,errors:['标签模板须为对象']};
    if(typeof template.name!=='string'||!template.name.trim()||template.name.length>80)errors.push('模板名称须为 1–80 个字符');
    if(!Array.isArray(template.lines)||template.lines.length<1||template.lines.length>6)errors.push('模板须含 1–6 行');
    else template.lines.forEach((line,index)=>{
      if(typeof line!=='string'||line.length>160||/[\r\n]/.test(line)){errors.push(`第 ${index+1} 行须为不超过 160 字符的单行文本`);return;}
      const rest=line.replace(/\{\{([^{}]*)\}\}/g,(_,token)=>{if(!tokens.includes(token.trim()))errors.push(`第 ${index+1} 行含未知字段：${token.trim()}`);return '';});
      if(/\{\{|\}\}/.test(rest))errors.push(`第 ${index+1} 行字段括号未闭合`);
    });
    if(typeof template.fontSize!=='number'||!Number.isInteger(template.fontSize)||template.fontSize<10||template.fontSize>20)errors.push('字号须为 10–20 的整数');
    if(!['left','center','right'].includes(template.align))errors.push('对齐方式须为 left、center 或 right');
    return {valid:!errors.length,errors};
  }
  function clean(value){return String(value??'').replace(/[\r\n]+/g,' ').replace(/\s*·(?:\s*·)+\s*/g,' · ').replace(/^\s*[·|／/]+\s*|\s*[·|／/]+\s*$/g,'').trim();}
  function renderLabel({template=null,labels=null,values={},compact=false}={}){
    let selected=template,errors=[];if(selected){const result=validateTemplate(selected);if(!result.valid){errors=result.errors;selected=null;}}
    const custom=!!selected;selected=selected||defaultTemplate();
    const enabled=key=>labels==null||(Array.isArray(labels)?labels.includes(key):labels[key]!==false);
    const safeValues=Object.fromEntries(tokens.map(key=>[key,String(values[key]??'').replace(/[\r\n]+/g,' ').trim()]));
    const expanded=selected.lines.map(line=>{const text=line.replace(/\{\{\s*([a-z]+)\s*\}\}/g,(_,key)=>(custom||enabled(key))?safeValues[key]: '');return custom?text.trim():clean(text);}).filter(Boolean);
    // Mobile prioritises physical identification and mouse preparation; the full
    // authored template remains in the accessible name and expanded box details.
    const lines=compact?[safeValues.id||'空盒',safeValues.mouse].filter(Boolean):expanded;
    return {lines,escapedLines:lines.map(escapeText),fontSize:Math.max(10,selected.fontSize),align:compact?'left':selected.align,ariaLabel:expanded.join('；'),fullLines:expanded,errors};
  }
  return {tokens,defaultTemplate,validateTemplate,renderLabel,escapeText};
});

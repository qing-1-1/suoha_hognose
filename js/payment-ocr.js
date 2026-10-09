(function(root){
 'use strict';
 function parseAmount(text){
  const normalized=String(text||'').normalize('NFKC').replace(/[−－﹣–—]/g,'-');
  const candidates=[];
  for(const line of normalized.split(/\r?\n/)){
   // Keep the decimal part; tolerate OCR-inserted spaces around separators/digits.
   const clean=line.replace(/(?<=\d)[ \t]+(?=[\d.,])/g,'').replace(/([.,])[ \t]+(?=\d)/g,'$1');
   const match=clean.match(/^\s*[-¥￥]\s*[-¥￥]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*(?:元)?\s*$/)||clean.match(/(?:支付金额|付款金额|实付金额|实付|金额)\s*[:：]?\s*[-¥￥]*\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)(?![\d.])/);
   if(match){const value=Number(match[1].replace(/,/g,''));if(value>0&&value<=9999999999.99)candidates.push(value.toFixed(2));}
  }
  const unique=[...new Set(candidates)];return unique.length===1?unique[0]:'';
 }
 function parse(text){
  const normalized=String(text||'').replace(/\r/g,'').replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g,'$1');
  const amount=parseAmount(normalized);
  // A merchant order number is not the payment platform's transaction number.
  const transaction=normalized.match(/(?<![\u4e00-\u9fff])(?:支付单号|交易单号|转账单号|订单号|交易号)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9 -]{7,99})/);
  const time=normalized.match(/20\d{2}[-/年.]\s*\d{1,2}[-/月.]\s*\d{1,2}日?\s+\d{1,2}:\d{2}(?::\d{2})?/);
  const payee=normalized.match(/(?:收款方全称|收款人|商户全称|商户名称|收款方(?!备注|服务))\s*[:：]?\s*([^\n]{1,100})/);
  return {amount,transaction:transaction?transaction[1].replace(/\s/g,''):'',time:time?.[0]||'',payee:payee?.[1]?.trim()||'',channel:/微信/.test(normalized)?'wechat':/支付宝/.test(normalized)?'alipay':''};
 }
 let library;
 function load(){return library||(library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/ocr/tesseract.min.js';s.onload=resolve;s.onerror=()=>{library=null;s.remove();reject(Error('OCR 组件下载失败，请重试'));};document.head.append(s);}));}
 async function recognize(image,progress=()=>{}){
  await load();let worker;
  try{worker=await root.Tesseract.createWorker(['chi_sim','eng'],1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/core',langPath:'/ocr/lang',logger:m=>progress(m.status==='recognizing text'?`识别中 ${Math.round(m.progress*100)}%`:'正在加载中文识别模型…')});
   const {data}=await worker.recognize(image);return {text:data.text,confidence:data.confidence,fields:parse(data.text)};
  }finally{if(worker)await worker.terminate();}
 }
 async function prepare(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('请选择不超过 12 MB 的 JPG、PNG 或 WebP 图片');
  const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>24000000)throw Error('图片尺寸过大，请裁剪后上传');const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',.92);if(result.length>4000000)throw Error('图片过大，请裁剪后上传');return result;}finally{bitmap.close();}
 }
 const api={parse,parseAmount,recognize,prepare};root.SuohaPaymentOCR=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

const path=require('node:path');
const {Worker}=require('node:worker_threads');
const {parseAmount}=require('../../../js/payment-ocr');
async function recognizeAmount(bytes,{timeoutMs=12000}={}){
 if(!bytes)return {amount:null,status:'no_image',text:'',confidence:null};
 let worker,timer;
 try{
  const result=await new Promise((resolve,reject)=>{
   worker=new Worker(path.resolve(process.cwd(),'netlify/functions/lib/payment-amount-worker.cjs'),{workerData:bytes});
   timer=setTimeout(()=>reject(Error('OCR_TIMEOUT')),timeoutMs);
   worker.once('message',resolve);worker.once('error',reject);
   worker.once('exit',()=>reject(Error('OCR_EXIT')));
  });
  if(result.failed)throw Error('OCR_FAILED');
  const amount=parseAmount(result.text);
  return {amount:amount?Number(amount):null,status:amount?'recognized':'not_detected',text:result.text,confidence:result.confidence};
 }catch{return {amount:null,status:'failed',text:'',confidence:null};}
 finally{clearTimeout(timer);if(worker)await worker.terminate();}
}
module.exports={recognizeAmount};

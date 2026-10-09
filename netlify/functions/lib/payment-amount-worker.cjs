// Runs in a disposable worker so OCR cannot keep the payment request alive forever.
const {parentPort,workerData}=require('node:worker_threads');
const {createWorker}=require('tesseract.js');
const {langPath}=require('@tesseract.js-data/eng');
(async()=>{
 let worker;
 try{
  worker=await createWorker('eng',1,{langPath,cacheMethod:'none',gzip:true,logger:()=>{},errorHandler:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  const {data}=await worker.recognize(Buffer.from(workerData));
  parentPort.postMessage({text:data.text.slice(0,20000),confidence:data.confidence});
 }catch{parentPort.postMessage({failed:true});}
 finally{if(worker)await worker.terminate();}
})();

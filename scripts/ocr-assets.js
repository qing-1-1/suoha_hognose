const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets={'ocr/tesseract.min.js':require.resolve('tesseract.js/dist/tesseract.min.js'),'ocr/worker.min.js':require.resolve('tesseract.js/dist/worker.min.js')};
for(const lang of ['chi_sim','eng'])assets[`ocr/lang/${lang}.traineddata.gz`]=path.join(root,'node_modules/@tesseract.js-data',lang,'4.0.0',`${lang}.traineddata.gz`);
const core=path.dirname(require.resolve('tesseract.js-core/package.json'));
for(const name of fs.readdirSync(core).filter(n=>/\.wasm(?:\.js)?$/.test(n)))assets['ocr/core/'+name]=path.join(core,name);
module.exports=assets;

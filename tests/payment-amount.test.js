const test=require('node:test'),assert=require('node:assert/strict');
const {parseAmount}=require('../js/payment-ocr');
const {recognizeAmount}=require('../netlify/functions/lib/payment-amount');
test('signed payment amounts are positive and ambiguous evidence stays unknown',()=>{
 for(const text of ['-1050.00','−1,050.00','￥1,050.00','付款金额 -1050.00','- 1 050.00'])assert.equal(parseAmount(text),'1050.00');
 for(const text of ['202610081234567890','-0.00','-10.00\n-20.00','order 1050.00'])assert.equal(parseAmount(text),'');
});
test('server OCR reads the actual image and handles optional evidence',async()=>{
 assert.equal((await recognizeAmount(null)).status,'no_image');
 const sharp=require('sharp');
 const bytes=await sharp(Buffer.from('<svg width="900" height="300"><rect width="900" height="300" fill="white"/><text x="80" y="190" font-family="Arial" font-size="100">-1050.00</text></svg>')).png().toBuffer();
 const result=await recognizeAmount(bytes,{timeoutMs:30000});
 assert.equal(result.status,'recognized',JSON.stringify(result));assert.equal(Number(result.amount),1050);
 assert.equal((await recognizeAmount(bytes,{timeoutMs:1})).status,'failed');
});

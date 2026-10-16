'use strict';
const fs=require('node:fs'),{parseEnv}=require('node:util');
if(fs.existsSync('.env')){for(const [key,value] of Object.entries(parseEnv(fs.readFileSync('.env','utf8')))){if(process.env[key]===undefined)process.env[key]=value;}}
const {createTuya,TuyaError}=require('../netlify/functions/lib/tuya-cloud.cjs');
createTuya().checkConnection().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(JSON.stringify({code:error instanceof TuyaError?error.code:'TUYA_CHECK_FAILED',message:error instanceof TuyaError?error.message:'验证失败，请检查服务端配置'},null,2));process.exitCode=1;});

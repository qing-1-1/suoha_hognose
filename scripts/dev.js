const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
// Local development reads .env without returning it to the browser.
if (fs.existsSync(path.join(root,'.env'))) process.loadEnvFile(path.join(root,'.env'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try {
    if(url.pathname.startsWith('/.netlify/functions/')){
      const name=url.pathname.split('/').pop();
      if(!['public-catalog','purchase-inquiry','specimen-media','specimen-page','ai-analyze','ai-analyze-background'].includes(name)){res.writeHead(404).end();return;}
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000){res.writeHead(413).end();return;}}
      const event={httpMethod:req.method,headers:{...req.headers,'x-nf-client-connection-ip':req.socket.remoteAddress},queryStringParameters:Object.fromEntries(url.searchParams),body};
      const result=await require(path.join(root,'netlify/functions',name+'.js')).handler(event);
      res.writeHead(result?.statusCode||202,result?.headers||{});res.end(result?.isBase64Encoded?Buffer.from(result.body,'base64'):result?.body||'');return;
    }
    let file=url.pathname==='/'||url.pathname==='/collection'||url.pathname.startsWith('/specimens/')?'index.html':url.pathname.startsWith('/admin')?'admin.html':decodeURIComponent(url.pathname).slice(1);
    if(!['index.html','admin.html','robots.txt'].includes(file)&&!file.startsWith('assets/')&&!file.startsWith('js/')){res.writeHead(404).end();return;}
    const absolute=path.resolve(root,file);
    if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute)||!fs.statSync(absolute).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(absolute).pipe(res);
  }catch(error){console.error(error.message);res.writeHead(500,{'content-type':'text/plain'}).end('Local server error');}
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Suoha preview: http://127.0.0.1:4173'));

/** TEST SERVER ONLY. Uses explicit offline doubles, never contacts real models or reads .env. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {ExperimentManager} from '../../dist/src/lab/manager.js';import {createLabHandler} from '../../server/lab/http.mjs';
import {access} from './incident-fixtures.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname),port=Number(process.env.PORT??4183);
const providers={ready:()=>true,backend:()=>({id:'OFFLINE-FAULT-INJECTION-NOT-JEV',kind:'mock',ask:async i=>{
 const p=i.state.evidence.packet,q=i.questions.choose;if(!q)throw Error('Test server supports direct only');let chosen='none';
 if(p.level==='parent'){const n=p.candidates.findIndex(c=>c.facts.contract==='access-open');if(n>=0)chosen='a'+n;}
 return {answers:{choose:{type:'choice',choice:chosen,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===chosen?1:0]))}},model:'OFFLINE-FAULT-INJECTION'};
 }}),generate:async()=>({output:access()})};
const manager=new ExperimentManager(providers),token='test-only-'+crypto.randomUUID(),base=`http://127.0.0.1:${port}`;
const handler=createLabHandler({manager,token,baseUrl:base});
const server=http.createServer(async(req,res)=>{
 if(req.url==='/api/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,jevReady:true,llmReady:true,fixture:true}));return;}
 const u=new URL(req.url,base);if(await handler(req,res,u))return;
 const name={'/lab':'lab.html','/lab.js':'lab.js','/lab.css':'lab.css','/':'index.html','/app.js':'app.js','/app.css':'app.css'}[u.pathname];
 if(!name){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(path.join(root,'public',name)));
});
server.listen(port,'127.0.0.1',()=>console.log('OFFLINE TEST SERVER ONLY '+base));
process.on('SIGTERM',()=>{manager.close();server.closeAllConnections();server.close(()=>process.exit());});

// Local synthetic streams only. No provider keys or live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readCompletion} from '../server/chat-stream.mjs';
const encoder=new TextEncoder();
const signal=()=>new AbortController().signal;
const event=(delta={},finish_reason=null,extra={})=>'data: '+JSON.stringify({model:'synthetic-stream-test',choices:[{index:0,delta,finish_reason}],...extra})+'\n\n';
const ending=event({content:'{"ok":true}'},'stop',{usage:{prompt_tokens:1,completion_tokens:2}})+'data: [DONE]\n\n';
function response(raw,width=4096,type='text/event-stream'){
 const bytes=encoder.encode(raw);let offset=0;
 return new Response(new ReadableStream({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(offset+width,bytes.length);c.enqueue(bytes.subarray(offset,end));offset=end;}}),{headers:{'content-type':type}});
}
const large=event({reasoning_content:'r'},null,{id:'x'.repeat(420)}).repeat(9000)+ending;
for(const width of [4096,Infinity])test(`056 accepts >4 MiB of valid SSE across TCP chunks of ${width}`,async()=>{
 const expectedBytes=encoder.encode(large).byteLength;assert.ok(expectedBytes>4*1024*1024);
 const result=await readCompletion(response(large,width),{signal:signal()});
 assert.equal(result.bytes,expectedBytes);assert.equal(result.reasoning,'r'.repeat(9000));assert.equal(result.content,'{"ok":true}');assert.equal(result.usage.outputTokens,2);
});
test('056 unlimited total heartbeats do not consume a frame buffer budget',async()=>{
 const raw=(': '+'h'.repeat(480)+'\r\n\r\n').repeat(9000)+ending;
 assert.ok(encoder.encode(raw).byteLength>4*1024*1024);
 const result=await readCompletion(response(raw),{signal:signal(),maxEventBytes:1024});assert.equal(result.content,'{"ok":true}');
});
test('056 byte-at-a-time Unicode and CRLF framing match aggregated input',async()=>{
 const raw=(': heartbeat\r\n\r\n'+event({reasoning_content:'中文🌿'}).replaceAll('\n','\r\n')).repeat(60)+ending.replaceAll('\n','\r\n');
 const options={signal:signal(),maxBytes:20,maxEventBytes:1024}; // maxBytes applies only to buffered responses.
 const split=await readCompletion(response(raw,1),options);const merged=await readCompletion(response(raw,Infinity),options);
 assert.deepEqual({...split,bytes:0},{...merged,bytes:0});assert.equal(split.bytes,encoder.encode(raw).byteLength-1);assert.equal(merged.bytes,encoder.encode(raw).byteLength);assert.equal(split.reasoning,'中文🌿'.repeat(60));
});
for(const suffix of ['', '\n\n'])test(`056 caps ${suffix?'complete':'unfinished'} SSE lines`,async()=>{
 await assert.rejects(readCompletion(response('data: '+'x'.repeat(30)+suffix,5),{signal:signal(),maxEventBytes:24}),/SSE line too large/);
});
test('056 line buffer limit counts UTF-8 bytes, not character count',async()=>{
 await assert.rejects(readCompletion(response('data: '+'🌿'.repeat(5),1),{signal:signal(),maxEventBytes:24}),/SSE line too large/);
});
test('056 caps an unterminated multiline event whose individual lines are small',async()=>{
 const raw=('data: '+'x'.repeat(12)+'\n').repeat(8);
 await assert.rejects(readCompletion(response(raw,7),{signal:signal(),maxEventBytes:40}),/SSE event too large/);
});
test('056 empty data lines count separating newlines toward the event bound',async()=>{
 await assert.rejects(readCompletion(response('data:\n'.repeat(16),2),{signal:signal(),maxEventBytes:8}),/SSE event too large/);
});
test('056 frame buffer resets between dispatched events',async()=>{
 const raw=event({reasoning_content:'r'}).repeat(100)+ending;
 const result=await readCompletion(response(raw,Infinity),{signal:signal(),maxEventBytes:240});assert.equal(result.reasoning,'r'.repeat(100));
});
test('056 trailing standalone CR dispatches the final DONE event',async()=>{
 const raw=ending.replaceAll('\n','\r');const result=await readCompletion(response(raw,1),{signal:signal()});assert.equal(result.content,'{"ok":true}');
});
test('056 buffered bodies still have a total byte bound',async()=>{
 await assert.rejects(readCompletion(response(' '.repeat(4*1024*1024+1),65536,'application/json'),{signal:signal()}),/G response too large/);
});
test('056 cancellation after >4 MiB still aborts pending reads and cancels transport',async()=>{
 let cancelled=false;const ac=new AbortController();let seen=false;
 const body=new ReadableStream({start(c){c.enqueue(encoder.encode(large.replace('data: [DONE]\n\n','')));},cancel(){cancelled=true;}});
 const task=readCompletion(new Response(body,{headers:{'content-type':'text/event-stream'}}),{signal:ac.signal,onText(channel){if(channel==='content'){seen=true;queueMicrotask(()=>ac.abort(Error('operator_cancel')));}}});
 await assert.rejects(task,/operator_cancel/);assert.equal(seen,true);assert.equal(cancelled,true);
});

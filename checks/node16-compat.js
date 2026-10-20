const assert=require('assert');
for(const key of ['DOMException','ReadableStream','WritableStream','TransformStream','structuredClone'])globalThis[key]=undefined;
require('../cloudfunctions/parseSchedule/node-compat');
const buffer=new ArrayBuffer(20),view=new Uint8Array(buffer,4,6);view.set([1,2,3,4,5,6]);
const input={buffer,view,map:new Map(),set:new Set([1,2])};input.self=input;input.map.set(input,view);
const result=structuredClone(input,{transfer:[buffer]});
assert(result!==input);assert(result.self===result);assert(result.view.buffer===result.buffer);assert.equal(result.view.byteOffset,4);assert.equal(result.view.byteLength,6);assert.deepEqual([...result.view],[1,2,3,4,5,6]);assert(result.map.get(result)===result.view);assert.equal(buffer.byteLength,20);assert.equal(new DOMException('cancel','AbortError').code,20);assert.equal(typeof ReadableStream,'function');assert.throws(()=>structuredClone(()=>{}),e=>e.name==='DataCloneError');
console.log('PASS: Node16 compatibility, binary view offsets, shared references, cycles, Map/Set and DOMException');

import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY,queueChange,acknowledge,mergeRemote,nextMutation } from '../public/store.js';
const record=(ml=250)=>({id:'water-1',type:'water',date:'2026-10-29',data:{ml},deleted:false,version:0});
test('unsent offline edits coalesce with the same expected cloud version',()=>{
  const s=EMPTY();queueChange(s,record());queueChange(s,record(500));
  assert.equal(s.queue.length,1);assert.equal(s.queue[0].expectedVersion,0);assert.equal(s.queue[0].record.data.ml,500);
});
test('edits during a request wait behind that request and rebase on its acknowledgement',()=>{
  const s=EMPTY();queueChange(s,record());const op=s.queue[0];op.sending=true;
  queueChange(s,record(500));assert.equal(s.queue.length,2);assert.equal(s.queue[1].expectedVersion,1);
  acknowledge(s,op.operationId,{version:1,current:{...record(),version:1}});
  assert.equal(s.records['water-1'].data.ml,500);assert.equal(s.queue.length,1);assert.equal(s.queue[0].expectedVersion,1);
});
test('cloud refresh never overwrites a locally queued change',()=>{
  const s=EMPTY();queueChange(s,record(750));mergeRemote(s,[{...record(250),version:2}]);
  assert.equal(s.records['water-1'].data.ml,750);
});
test('conflicting record cannot be silently edited or overwritten',()=>{
  const s=EMPTY();queueChange(s,record());s.queue[0].conflict={current:{...record(500),version:2}};
  assert.throws(()=>queueChange(s,record(1000)),/Resolve/);
});
test('final acknowledgement replaces local copy with authoritative server version',()=>{
  const s=EMPTY();queueChange(s,record());const id=s.queue[0].operationId;
  acknowledge(s,id,{version:1,current:{...record(),version:1,updatedAt:'server-time'}});
  assert.equal(s.queue.length,0);assert.equal(s.records['water-1'].updatedAt,'server-time');
});
test('later edits cannot bypass a conflict on the same record; other records can sync',()=>{
  const s=EMPTY();queueChange(s,record());s.queue[0].sending=true;queueChange(s,record(500));
  s.queue[0].conflict={current:{...record(750),version:1}};
  queueChange(s,{...record(100),id:'water-other'});
  assert.equal(nextMutation(s).record.id,'water-other');
  assert.throws(()=>queueChange(s,record(1000)),/Resolve/);
});

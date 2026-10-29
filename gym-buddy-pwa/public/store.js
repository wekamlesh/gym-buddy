import { validateRecord } from './domain.js';
export const uuid=()=>crypto.randomUUID();
export const EMPTY=()=>({records:{},queue:[],lastSync:null});
export function nextMutation(state) {
  return state.queue.find((q,i)=>!q.conflict&&!q.error&&!state.queue.slice(0,i).some(prior=>prior.record.id===q.record.id));
}
export function queueChange(state,record) {
  validateRecord(record);
  const prior=state.records[record.id];
  const pending=[...state.queue].reverse().find(q=>q.record.id===record.id);
  if(state.queue.some(q=>q.record.id===record.id&&q.conflict)) throw new Error('Resolve the conflicting version before editing this entry.');
  if(pending && !pending.sending) {
    pending.record={...record,version:prior?.version||0}; pending.operationId=uuid(); delete pending.error;
  } else state.queue.push({operationId:uuid(),expectedVersion:pending?pending.expectedVersion+1:(prior?.version||0),record:{...record}});
  state.records[record.id]={...record,version:prior?.version||0};
  return state;
}
export function acknowledge(state,operationId,response) {
  const op=state.queue.find(q=>q.operationId===operationId); if(!op)return state;
  state.queue=state.queue.filter(q=>q.operationId!==operationId);
  const next=state.queue.find(q=>q.record.id===op.record.id);
  if(next) {
    next.expectedVersion=response.version;
    state.records[op.record.id].version=response.version;
  } else if(response.current) state.records[op.record.id]=response.current;
  return state;
}
export function mergeRemote(state,records) {
  const dirty=new Set(state.queue.map(q=>q.record.id));
  for(const r of records) if(!dirty.has(r.id)) state.records[r.id]=r;
  return state;
}
export class DataStore extends EventTarget {
  constructor(email) { super(); this.email=email; this.syncing=false; this.state=EMPTY(); this.status='connecting'; }
  async open() {
    const req=indexedDB.open(`gym-buddy-v1:${this.email}`,1);
    this.db=await new Promise((resolve,reject)=>{req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Device storage is unavailable. Enable browser storage to keep offline entries.'));});
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(`gym-buddy:${this.email}`):null;
    this.channel=channel;
    if(channel) channel.onmessage=async()=>{await this.read();this.changed();};
    await this.read(); return this;
  }
  async read() {
    const tx=this.db.transaction('data','readonly'),req=tx.objectStore('data').get('state');
    this.state=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result||EMPTY());req.onerror=()=>rej(req.error);});return this.state;
  }
  async update(fn) {
    let result;
    const tx=this.db.transaction('data','readwrite'), store=tx.objectStore('data'), req=store.get('state');
    await new Promise((resolve,reject)=>{
      req.onsuccess=()=>{try{const state=req.result||EMPTY();fn(state);result=state;store.put(state,'state');}catch(e){reject(e);tx.abort();}};
      tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('Could not save on this device. Storage may be full.'));tx.onabort=()=>reject(new Error('Device save was cancelled.'));
    });
    this.state=result;this.channel?.postMessage('change');this.changed();return result;
  }
  changed() { this.dispatchEvent(new Event('change')); }
  async save(record) { await this.update(s=>queueChange(s,record)); void this.sync(); }
  async remove(id) { const record=this.state.records[id];if(record)await this.save({...record,deleted:true}); }
  async resolve(operationId,choice) {
    await this.update(s=>{
      const op=s.queue.find(q=>q.operationId===operationId);if(!op)return;
      const remote=op.conflict.current;
      if(choice==='cloud') {
        s.queue=s.queue.filter(q=>q.record.id!==op.record.id);
        if(remote)s.records[op.record.id]=remote;else delete s.records[op.record.id];
      } else {
        op.expectedVersion=remote?.version||0;op.operationId=uuid();delete op.conflict;delete op.sending;delete op.error;
      }
    });void this.sync();
  }
  async sync() {
    if(this.syncing)return;
    this.syncing=true;this.status=navigator.onLine?'syncing':'offline';this.changed();
    const run=async()=>{
      try {
        if(!navigator.onLine){this.status='offline';return;}
        // A previous tab may have closed with a request in flight. Replaying its
        // exact operation is safe because the server stores transactional receipts.
        await this.update(s=>s.queue.forEach(q=>{delete q.sending;}));
        while(true) {
          let op;
          await this.update(s=>{
            const candidate=nextMutation(s);
            if(candidate){candidate.sending=true;op=structuredClone(candidate);}
          });
          if(!op)break;
          let response;
          try {response=await fetch('/api/mutations',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId:op.operationId,expectedVersion:op.expectedVersion,record:op.record}),signal:AbortSignal.timeout(15000),redirect:'error'});}
          catch{throw new Error('Connection interrupted. Your entries are saved on this device.');}
          const body=await response.json().catch(()=>({error:'Sign in again to reconnect.'}));
          if(response.status===409 && body.conflict) {
            await this.update(s=>{
              const q=s.queue.find(q=>q.operationId===op.operationId);
              if(q){
                // Present the latest local intent if more edits arrived while
                // this request was in flight. Keep one blocked op per record.
                q.record=structuredClone(s.records[q.record.id]);
                s.queue=s.queue.filter(later=>later===q||later.record.id!==q.record.id);
                q.conflict={current:body.current};q.operationId=uuid();delete q.sending;
              }
            });continue;
          }
          if(response.status===400 || response.status===413) {
            await this.update(s=>{const q=s.queue.find(q=>q.operationId===op.operationId);if(q){q.error=body.error;delete q.sending;}});continue;
          }
          if(!response.ok)throw new Error(body.error||'Cloud sync is unavailable.');
          await this.update(s=>acknowledge(s,op.operationId,body));
        }
        const remote=[];let cursor='';
        do {
          const res=await fetch(`/api/records${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000),redirect:'error'});
          if(!res.ok)throw new Error(res.status===401?'Sign in again to sync.':'Could not read cloud records. Your local entries are safe.');
          const data=await res.json();remote.push(...data.records);cursor=data.nextCursor;
        }while(cursor);
        await this.update(s=>{mergeRemote(s,remote);s.lastSync=new Date().toISOString();});
        this.status=this.state.queue.some(q=>q.conflict||q.error)?'attention':this.state.queue.length?'pending':'saved';this.error=null;
      } catch(e){this.status=navigator.onLine?'error':'offline';this.error=e.message;}
      finally{this.syncing=false;this.changed();if(this.status==='pending')setTimeout(()=>this.sync(),0);}
    };
    try {
      if(navigator.locks)await navigator.locks.request(`gym-buddy-sync:${this.email}`,run);else await run();
    }catch(e){this.syncing=false;this.status='error';this.error=e.message;this.changed();}
  }
}

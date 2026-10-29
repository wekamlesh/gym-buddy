import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { filterExercises,plannedExercises,exerciseStatus } from '../public/exercises.js';
import { entryData,validateRecord,totals,workoutDone } from '../public/domain.js';
const catalog=JSON.parse(readFileSync(new URL('../public/exercises/catalog.json',import.meta.url)));
const exercise={source:'free-exercise-db',exerciseId:'Air_Bike',name:'Air Bike',completed:true,sets:2,reps:12,weight:0};
const record=exercises=>({id:'exercise-test',type:'activity',date:'2026-10-29',data:{kind:'Strength',minutes:20,time:'11:00',exercises}});
test('dashboard plans use real tutorials and keep prescriptions separate from actual logs',()=>{
  for(const type of ['Walk','Strength']){
    const rows=plannedExercises({type,minutes:15});
    assert.ok(rows.length);
    for(const {target,...e} of rows){
      assert.ok(target);assert.ok(catalog.find(item=>item.id===e.exerciseId)?.instructions.length);
      assert.equal(e.completed,false);assert.equal(e.sets,undefined);
      assert.doesNotThrow(()=>validateRecord(record([e])));
    }
  }
  assert.deepEqual(plannedExercises({type:'Recovery'}),[]);
  assert.deepEqual(plannedExercises({type:'Preparation'}),[]);
});
test('dashboard distinguishes missing, partial and corrected exercise logs',()=>{
  assert.equal(exerciseStatus(exercise.exerciseId,[]),'Not logged');
  const a={...record([exercise]),updatedAt:'2026-10-29T10:00:00Z'};
  const b={...record([{...exercise,completed:false}]),id:'later',updatedAt:'2026-10-29T11:00:00Z'};
  assert.equal(exerciseStatus(exercise.exerciseId,[a]),'Completed');
  assert.equal(exerciseStatus(exercise.exerciseId,[a,b]),'Not completed');
  assert.equal(workoutDone({type:'Strength'},totals([b],b.date)),false);
  assert.equal(workoutDone({type:'Strength'},totals([a],a.date)),true);
  assert.equal(workoutDone({type:'Strength'},totals([record(undefined)],a.date)),true);
});
test('catalog has unique valid identifiers, instructions and locally bundled media',()=>{
  assert.ok(catalog.length>800);assert.equal(new Set(catalog.map(e=>e.id)).size,catalog.length);
  for(const e of catalog){
    validateRecord(record([{source:'free-exercise-db',exerciseId:e.id,name:e.name,completed:false}]));
    assert.ok(Array.isArray(e.instructions));
    for(const img of e.images){assert.ok(!img.includes('..'));assert.ok(existsSync(new URL(`../public/exercises/images/${img}`,import.meta.url)));}
  }
});
test('search combines words, secondary muscles, equipment and difficulty',()=>{
  const e=catalog.find(e=>e.secondaryMuscles.length&&e.equipment);
  assert.ok(filterExercises(catalog,{query:e.name.toUpperCase(),muscle:e.secondaryMuscles[0],equipment:e.equipment,level:e.level}).some(x=>x.id===e.id));
  assert.equal(filterExercises(catalog,{query:'zzzznonexistent'}).length,0);
  assert.equal(filterExercises(catalog,{query:'   '}).length,catalog.length);
});
test('exercise logs survive normalization and JSON backups without duplicating minutes',()=>{
  const r=record([exercise,{...exercise,exerciseId:'Pushups',name:'Pushups',completed:false}]);
  r.data=entryData('activity',r.data);validateRecord(r);
  assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
  assert.equal(totals([r],r.date).minutes,20);
  assert.doesNotThrow(()=>validateRecord({...r,data:{kind:'Strength',minutes:20}}));
});
test('malformed exercise payloads are rejected',()=>{
  for(const change of [{sets:0},{reps:1.5},{weight:-1},{weight:NaN},{completed:'true'},{source:'unknown'},{exerciseId:'../bad'},{name:''},{extra:true}])assert.throws(()=>validateRecord(record([{...exercise,...change}])));
  assert.throws(()=>validateRecord(record([exercise,exercise])),/duplicate/);
  assert.throws(()=>validateRecord(record(Array(21).fill(exercise))),/20/);
  assert.throws(()=>validateRecord(record({})),/20/);
});

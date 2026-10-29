import test from 'node:test';
import assert from 'node:assert/strict';
import { entryData,activityFields,measurementKind,measurementFields,timeIST,validTime,validateRecord } from '../public/domain.js';
const record=(type,data)=>({id:'entry-test',type,date:'2026-10-29',data});
test('water captures quantity and an IST clock time, without unrelated fields',()=>{
  const data=entryData('water',{ml:123,time:'11:05',calories:500,notes:'Unrelated'});
  assert.deepEqual(data,{ml:123,time:'11:05'});validateRecord(record('water',data));
  assert.throws(()=>validateRecord(record('water',{ml:250,time:'25:00'})),/valid time/);
  assert.throws(()=>validateRecord(record('water',{ml:250,calories:500})),/not a field/);
});
test('event times use IST rather than device time and accept midnight',()=>{
  assert.equal(timeIST(new Date('2026-10-29T18:30:00Z')),'00:00');
  assert.equal(validTime('00:00'),true);assert.equal(validTime('11:05'),true);
  for(const value of ['24:00','11:60','9:30','11:30Z',123])assert.equal(validTime(value),false);
});
test('old entries may retain unknown time; an edit never invents it',()=>{
  validateRecord(record('water',{ml:250}));
  assert.deepEqual(entryData('water',{ml:300,time:''}),{ml:300});
});
test('saved meals store reusable nutrition only, not an eating date, meal category or time',()=>{
  const data=entryData('food',{name:'Dal',meal:'Lunch',time:'13:00',date:'2026-10-29',portion:'1 cup',calories:200,protein:12,notes:''});
  assert.deepEqual(data,{name:'Dal',portion:'1 cup',calories:200,protein:12});validateRecord(record('food',data));
  assert.throws(()=>validateRecord(record('food',{...data,time:'13:00'})),/not a field/);
});
test('only treadmill activities have treadmill settings; outdoor walking can have distance',()=>{
  for(const kind of ['Badminton','Strength','Other']){
    const data=entryData('activity',{kind,minutes:20,time:'11:00',distance:2,speed:5,incline:2,effort:null,feeling:''});
    assert.deepEqual(data,{kind,time:'11:00',minutes:20});validateRecord(record('activity',data));
    assert.equal(activityFields(kind).includes('distance'),false);
  }
  assert.equal(activityFields('Outdoor walk').includes('distance'),true);
  assert.equal(activityFields('Outdoor walk').includes('incline'),false);
  for(const kind of ['Treadmill walk','Walk–run'])assert.ok(['speed','incline','distance'].every(k=>activityFields(kind).includes(k)));
});
test('irrelevant populated workout data is rejected, but legacy empty fields remain readable',()=>{
  const data={kind:'Badminton',minutes:30,effort:3,feeling:'Good'};
  validateRecord(record('activity',{...data,distance:null,speed:null,incline:null}));
  assert.throws(()=>validateRecord(record('activity',{...data,incline:5})),/not a field/);
});
test('ordinary body measurements and DEXA values have distinct payloads',()=>{
  const body=entryData('measurement',{measurementKind:'body',weight:71,waist:88,bodyFat:30,leanMass:45,visceralFat:180});
  assert.deepEqual(body,{measurementKind:'body',weight:71,waist:88});validateRecord(record('measurement',body));
  const scan=entryData('measurement',{measurementKind:'dexa',weight:71,bodyFat:30,leanMass:45,waist:88,arm:32});
  assert.deepEqual(scan,{measurementKind:'dexa',weight:71,bodyFat:30,leanMass:45});validateRecord(record('measurement',scan));
  assert.throws(()=>validateRecord(record('measurement',{measurementKind:'body',time:'08:00',notes:'No values'})),/at least one/);
});
test('older mixed measurement entries keep all existing body and scan values when edited',()=>{
  const data={weight:71,waist:88,bodyFat:30,leanMass:45};
  assert.equal(measurementKind(data),'combined');
  assert.ok(measurementFields('combined').includes('waist'));assert.ok(measurementFields('combined').includes('bodyFat'));
  assert.deepEqual(entryData('measurement',data),data);validateRecord(record('measurement',data));
});
test('notes match their model limits and blank optional data is absent',()=>{
  const food={name:'Meal',meal:'Lunch',calories:0,protein:0,notes:'x'.repeat(500)};
  validateRecord(record('meal',food));assert.throws(()=>validateRecord(record('meal',{...food,notes:'x'.repeat(501)})),/notes/);
  const activity=entryData('activity',{kind:'Strength',minutes:20,time:'11:00',watchCalories:0,notes:'',heartRate:null});
  assert.deepEqual(activity,{kind:'Strength',time:'11:00',minutes:20,watchCalories:0});validateRecord(record('activity',activity));
});

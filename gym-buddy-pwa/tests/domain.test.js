import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE,updatePlan,dateIST,addDays,validDate,planFor,totals,analyze,workoutDone,trend,validateRecord,calorieEstimate,compositionProjection } from '../public/domain.js';
const profile={...DEFAULT_PROFILE,name:'Test',height:180,age:30,initialWeight:80,baselineDate:'2026-10-28'};
test('Tenzo can change daily goals while identity and report measurements stay configured',()=>{
  const updated=updatePlan(profile,{name:'Other',height:200,age:60,initialWeight:100,baselineDate:'2020-01-01',proteinTarget:130,waterTarget:2700});
  assert.equal(updated.name,'Tenzo');assert.equal(updated.proteinTarget,130);assert.equal(updated.waterTarget,2700);
  for(const key of ['height','age','initialWeight','baselineDate'])assert.equal(updated[key],profile[key]);
});
const meal=(id,date,calories=500,protein=25)=>({id,type:'meal',date,data:{name:'Meal',meal:'Lunch',calories,protein},deleted:false});
const activity=(kind,minutes,date='2026-11-01')=>({id:'activity',type:'activity',date,data:{kind,minutes,effort:3,feeling:'Good'}});
test('IST rolls over before UTC, with stable calendar arithmetic',()=>{
  assert.equal(dateIST(new Date('2026-10-31T18:29:59Z')),'2026-10-31');
  assert.equal(dateIST(new Date('2026-10-31T18:30:00Z')),'2026-11-01');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(validDate('2026-02-30'),false);
});
test('first November session is walking; progression and recovery are explicit',()=>{
  assert.equal(planFor('2026-10-31',profile).type,'Preparation');
  assert.equal(planFor('2026-11-01',profile).minutes,15);
  assert.equal(planFor('2026-11-08',profile).minutes,20);
  assert.equal(planFor('2026-11-15',profile).minutes,25);
  assert.equal(planFor('2026-11-22',profile).minutes,30);
  assert.equal(planFor('2026-11-02',profile).type,'Strength');
  assert.equal(planFor('2026-11-04',profile).type,'Recovery');
});
test('food averages exclude partial and unknown days rather than counting zero',()=>{
  const date='2026-10-28';
  const rs=[meal('a',date),meal('b','2026-10-27',200,10),{id:`checkin-${date}`,type:'checkin',date,data:{foodComplete:true,recoveryDone:false}}];
  const result=analyze(rs,profile,date,7);
  assert.equal(result.averageCalories,500);assert.equal(result.foodDays,1);assert.equal(result.averageProtein,25);
  assert.equal(analyze([],profile,date).averageCalories,null);
  assert.equal(result.exercisePlanned,0);
});
test('deleted meals do not count; zero calories are valid logged data',()=>{
  assert.equal(totals([{...meal('a','2026-10-28'),deleted:true}],'2026-10-28').calories,0);
  const result=totals([meal('a','2026-10-28',0,0)],'2026-10-28');
  assert.equal(result.meals.length,1);assert.equal(result.calories,0);
});
test('badminton can fulfill walking, but unrelated activity cannot fulfill strength',()=>{
  assert.equal(workoutDone(planFor('2026-11-01',profile),totals([activity('Badminton',20)],'2026-11-01')),true);
  assert.equal(workoutDone(planFor('2026-11-01',profile),totals([activity('Treadmill walk',10)],'2026-11-01')),false);
  assert.equal(workoutDone(planFor('2026-11-02',profile),totals([activity('Badminton',60,'2026-11-02')],'2026-11-02')),false);
});
test('invalid measurements and account-independent identity fields are rejected',()=>{
  assert.throws(()=>validateRecord({id:'x',type:'water',date:'2026-02-30',data:{ml:250}}));
  assert.throws(()=>validateRecord({id:'x',type:'measurement',date:'2026-10-28',data:{weight:-5}}));
  assert.throws(()=>validateRecord({id:'x',type:'measurement',date:'2026-10-28',data:{}}));
  assert.throws(()=>validateRecord({id:'x',type:'water',date:'2026-10-28',data:{ml:'250'}}));
  assert.throws(()=>validateRecord({id:'profile',type:'profile',date:'2026-10-28',data:{...profile,strengthDays:[0]}}));
});
test('weight graph deduplicates dates and excludes deleted records',()=>{
  const points=trend([{id:'000',type:'measurement',date:'2026-10-28',data:{weight:71}},{id:'deleted',type:'measurement',date:'2026-10-29',data:{weight:55},deleted:true}],profile);
  assert.equal(points.length,1);assert.equal(points[0].weight,71);
});
test('calorie calculation is an estimate and needs a complete profile',()=>{
  assert.equal(calorieEstimate({},80),null);
  assert.equal(calorieEstimate(profile,80,1.2,250).bmr,1780);
});
test('body-composition scenario preserves fat-free mass and rejects invalid goals',()=>{
  const r=compositionProjection(80,30,25);
  assert.equal(r.fatFree,56);assert.ok(Math.abs(r.targetWeight-74.6666666667)<.000001);
  assert.equal(compositionProjection(80,30,35),null);
  assert.equal(compositionProjection(80,30,2),null);
});

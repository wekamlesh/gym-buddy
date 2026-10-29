export const TYPES = ['profile','meal','water','activity','measurement','checkin','food'];
export const OWNER_NAME = 'Tenzo';
export const DEFAULT_PROFILE = {
  name: OWNER_NAME, height: null, age: null, sex: 'male', startDate: '2026-11-01', workoutTime: '11:00',
  waterTarget: 2500, proteinTarget: 120, calorieTarget: null, goalWeight: null,
  initialWeight: null, baselineDate: '', bodyFat: null, visceralFat: null, leanMass: null,
  exerciseDays: [0,2,4], strengthDays: [1,5], timezone: 'Asia/Kolkata'
};
export function updatePlan(profile,settings) {
  const next={...profile,name:OWNER_NAME};
  for(const key of ['goalWeight','waterTarget','proteinTarget','calorieTarget','startDate','workoutTime','exerciseDays','strengthDays']) {
    if(Object.hasOwn(settings,key))next[key]=settings[key];
  }
  return next;
}
export function dateIST(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  const get = k => parts.find(p => p.type === k).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function timeIST(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
}
export function validTime(value) { return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export const ACTIVITY_KINDS=['Treadmill walk','Walk–run','Badminton','Strength','Outdoor walk','Other'];
const BODY_FIELDS=['weight','waist','chest','hips','arm'];
const SCAN_FIELDS=['weight','bodyFat','leanMass','visceralFat'];
export function measurementKind(data={}) {
  if(['body','dexa','combined'].includes(data.measurementKind))return data.measurementKind;
  const scan=SCAN_FIELDS.slice(1).some(k=>data[k]!==null&&data[k]!==undefined&&data[k]!=='');
  const body=BODY_FIELDS.slice(1).some(k=>data[k]!==null&&data[k]!==undefined&&data[k]!=='');
  return scan?(body?'combined':'dexa'):'body';
}
export function measurementFields(kind) { return kind==='dexa'?SCAN_FIELDS:kind==='combined'?[...BODY_FIELDS,...SCAN_FIELDS.slice(1)]:BODY_FIELDS; }
export function activityFields(kind) {
  const fields=['kind','time','minutes','effort','feeling','heartRate','watchCalories','notes','exercises'];
  if(['Treadmill walk','Walk–run','Outdoor walk'].includes(kind))fields.push('distance');
  if(['Treadmill walk','Walk–run'].includes(kind))fields.push('speed','incline');
  return fields;
}
export function entryFields(type,data={}) {
  if(type==='water')return ['ml','time'];
  if(type==='meal')return ['name','meal','portion','calories','protein','time','notes'];
  if(type==='food')return ['name','portion','calories','protein','notes'];
  if(type==='activity')return activityFields(data.kind);
  if(type==='measurement')return ['measurementKind','time',...measurementFields(measurementKind(data)),'notes'];
  if(type==='checkin')return ['foodComplete','recoveryDone','steps','sleep','notes'];
  return null;
}
export function entryData(type,data) {
  const fields=entryFields(type,data);
  if(!fields)return {...data};
  return Object.fromEntries(fields.filter(k=>Object.hasOwn(data,k)&&data[k]!==null&&data[k]!==undefined&&data[k]!=='').map(k=>[k,data[k]]));
}
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);
}
export function dayDiff(a,b) { return Math.round((Date.parse(`${a}T12:00:00Z`)-Date.parse(`${b}T12:00:00Z`))/86400000); }
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0,10) === s; }
const bounded = (v, min, max, label, optional=false) => {
  if (optional && (v === null || v === undefined || v === '')) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${label} must be between ${min} and ${max}.`);
};
const text = (v, max, label, required=false) => {
  if (v === undefined && !required) return;
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error(`Enter a valid ${label} (${max} characters maximum).`);
};
export function validateRecord(record) {
  if (!record || !TYPES.includes(record.type) || typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(record.id) || !validDate(record.date)) throw new Error('Invalid record identity or date.');
  if (!record.data || Array.isArray(record.data) || typeof record.data !== 'object' || JSON.stringify(record.data).length > 12000) throw new Error('Invalid record data.');
  if(['__proto__','constructor','prototype'].includes(record.id))throw new Error('Reserved record ID.');
  if(record.id==='profile'&&record.type!=='profile')throw new Error('The profile ID is reserved for your profile.');
  if(record.id.startsWith('checkin-')&&record.type!=='checkin')throw new Error('Check-in IDs are reserved for daily check-ins.');
  if(record.deleted!==undefined&&typeof record.deleted!=='boolean')throw new Error('Invalid deletion flag.');
  const d = record.data;
  const fields=entryFields(record.type,d);
  if(fields){
    // Earlier versions stored blank treadmill/scan fields for other entry kinds.
    // Accept those legacy blanks, while rejecting unrelated populated values.
    const legacy=record.type==='activity'?['distance','speed','incline']:record.type==='measurement'?[...BODY_FIELDS,...SCAN_FIELDS]:[];
    for(const key of Object.keys(d))if(!fields.includes(key)&&!(legacy.includes(key)&&(d[key]===null||d[key]==='')))throw new Error(`${key} is not a field for this ${record.type} entry.`);
    if(d.time!==undefined&&d.time!==null&&d.time!==''&&!validTime(d.time))throw new Error('Enter a valid time in IST (HH:MM).');
  }
  if (record.type === 'profile') {
    if(record.id !== 'profile') throw new Error('Invalid profile ID.');
    text(d.name,60,'name',true); bounded(d.height,100,240,'Height'); bounded(d.age,18,100,'Age');
    if(!['male','female'].includes(d.sex)) throw new Error('Choose the calculation sex.');
    bounded(d.initialWeight,30,350,'Starting weight'); bounded(d.goalWeight,30,350,'Goal weight',true);
    bounded(d.waterTarget,500,6000,'Water target'); bounded(d.proteinTarget,30,250,'Protein target'); bounded(d.calorieTarget,1200,5000,'Calorie target',true);
    bounded(d.bodyFat,3,65,'Body fat',true); bounded(d.visceralFat,0,1000,'Visceral fat',true); bounded(d.leanMass,10,200,'Lean tissue',true);
    if(!validDate(d.startDate) || !validDate(d.baselineDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.workoutTime)) throw new Error('Check your plan and baseline dates and workout time.');
    for(const key of ['exerciseDays','strengthDays']) if(!Array.isArray(d[key]) || d[key].length > 7 || d[key].some(n=>!Number.isInteger(n)||n<0||n>6) || new Set(d[key]).size !== d[key].length) throw new Error('Invalid workout days.');
    if(d.exerciseDays.some(n=>d.strengthDays.includes(n))) throw new Error('Choose separate walking and strength days.');
  }
  if (record.type === 'meal' || record.type === 'food') {
    text(d.name,100,'food name',true); bounded(d.calories,0,5000,'Calories'); bounded(d.protein,0,300,'Protein');
    text(d.portion,100,'portion'); text(d.notes,500,'notes');
    if(record.type==='meal' && !['Breakfast','Lunch','Dinner','Snack'].includes(d.meal)) throw new Error('Choose a meal.');
  }
  if (record.type === 'water') bounded(d.ml,1,3000,'Water (ml)');
  if (record.type === 'activity') {
    if(!ACTIVITY_KINDS.includes(d.kind)) throw new Error('Choose an activity.');
    bounded(d.minutes,1,480,'Duration'); bounded(d.distance,0,100,'Distance',true); bounded(d.speed,0,30,'Speed',true); bounded(d.incline,0,30,'Incline',true);
    bounded(d.effort,1,10,'Effort',true); bounded(d.heartRate,30,240,'Average heart rate',true); bounded(d.watchCalories,0,5000,'Watch calories',true);
    if(d.feeling!==undefined&&d.feeling!==null&&d.feeling!==''&&!['Good','Okay','Hard'].includes(d.feeling)) throw new Error('Choose how the session felt.');
    if(d.exercises!==undefined){
      if(!Array.isArray(d.exercises)||d.exercises.length>20)throw new Error('Choose up to 20 exercises per workout.');
      const ids=new Set();
      for(const e of d.exercises){
        if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['source','exerciseId','name','completed','sets','reps','weight'].includes(k)))throw new Error('Invalid exercise entry.');
        if(e.source!=='free-exercise-db'||typeof e.exerciseId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(e.exerciseId)||ids.has(e.exerciseId))throw new Error('Invalid or duplicate exercise identity.');
        ids.add(e.exerciseId);text(e.name,150,'exercise name',true);
        if(typeof e.completed!=='boolean')throw new Error('Mark exercise completion explicitly.');
        for(const [key,max] of [['sets',100],['reps',1000]])if(e[key]!==undefined&&(!Number.isInteger(e[key])||e[key]<1||e[key]>max))throw new Error(`${key} must be a positive whole number up to ${max}.`);
        if(e.weight!==undefined)bounded(e.weight,0,1000,'Exercise weight');
      }
    }
    text(d.notes,1000,'notes');
  }
  if (record.type === 'measurement') {
    if(d.measurementKind!==undefined&&!['body','dexa','combined'].includes(d.measurementKind))throw new Error('Choose body measurements or a DEXA scan.');
    const ranges = {weight:[30,350],waist:[30,250],chest:[30,250],hips:[30,250],arm:[10,100],bodyFat:[3,65],leanMass:[10,200],visceralFat:[0,1000]};
    if(!Object.keys(ranges).some(k=>d[k]!==null && d[k]!==undefined && d[k]!=='')) throw new Error('Add at least one measurement.');
    for(const [k,[min,max]] of Object.entries(ranges)) bounded(d[k],min,max,k,true);
    text(d.notes,500,'notes');
  }
  if (record.type === 'checkin') {
    if(record.id !== `checkin-${record.date}`) throw new Error('Invalid check-in ID.');
    for(const k of ['foodComplete','recoveryDone']) if(typeof d[k] !== 'boolean') throw new Error('Invalid daily checklist.');
    bounded(d.steps,0,150000,'Steps',true); bounded(d.sleep,0,24,'Sleep',true); text(d.notes,1000,'notes');
  }
  return record;
}
export function planFor(date, profile) {
  if (date < profile.startDate) return {type:'Preparation',minutes:0,week:0,title:'Get ready for your first session',detail:'Set your goals, try a comfortable walk, and prepare your shoes and water.'};
  const week = Math.floor(dayDiff(date,profile.startDate)/7)+1;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if(profile.exerciseDays.includes(day)) {
    const minutes = week<=1?15:week===2?20:week===3?25:30;
    return {type:'Walk',minutes,week,title:`${minutes}-minute treadmill walk`,detail:'Include 3–5 easy minutes at the start and end. Choose a pace where you can speak in full sentences. Running is optional later.'};
  }
  if(profile.strengthDays.includes(day)) return {type:'Strength',minutes:20,week,title:'Beginner full-body strength',detail:'Start with 1–2 comfortable sets: chair squats, wall push-ups, supported rows, glute bridges and a gentle carry. Ask a trainer to show you the movements.'};
  return {type:'Recovery',minutes:0,week,title:'Recovery & easy movement',detail:'Rest or take a relaxed walk. Badminton is optional; record the effort and give yourself recovery time.'};
}
export function totals(records, date) {
  const list=records.filter(r=>!r.deleted && r.date===date);
  const meals=list.filter(r=>r.type==='meal'), activities=list.filter(r=>r.type==='activity');
  const sum=(xs,k)=>xs.reduce((s,r)=>s+(Number(r.data[k])||0),0);
  return {water:sum(list.filter(r=>r.type==='water'),'ml'),calories:sum(meals,'calories'),protein:sum(meals,'protein'),minutes:sum(activities,'minutes'),meals,activities,checkin:list.find(r=>r.type==='checkin')?.data||{foodComplete:false,recoveryDone:false}, measurements:list.filter(r=>r.type==='measurement')};
}
export function workoutDone(plan, total) {
  if(plan.type==='Walk') return total.activities.some(a=>['Treadmill walk','Walk–run','Outdoor walk','Badminton'].includes(a.data.kind)) && total.activities.filter(a=>['Treadmill walk','Walk–run','Outdoor walk','Badminton'].includes(a.data.kind)).reduce((s,a)=>s+a.data.minutes,0)>=plan.minutes;
  if(plan.type==='Strength') return total.activities.some(a=>a.data.kind==='Strength'&&(!a.data.exercises?.length||a.data.exercises.every(e=>e.completed)));
  if(plan.type==='Recovery') return !!total.checkin.recoveryDone;
  return false;
}
export function calorieEstimate(profile, weight, factor=1.375, deficit=300) {
  if(!profile.height || !profile.age || !weight) return null;
  const bmr=10*weight+6.25*profile.height-5*profile.age+(profile.sex==='male'?5:-161);
  return {bmr:Math.round(bmr),maintenance:Math.round(bmr*factor),target:Math.round((bmr*factor-deficit)/50)*50};
}
export function compositionProjection(weight,bodyFat,targetBodyFat) {
  if(!Number.isFinite(weight)||weight<30||weight>350||!Number.isFinite(bodyFat)||bodyFat<3||bodyFat>65||!Number.isFinite(targetBodyFat)||targetBodyFat<10||targetBodyFat>=bodyFat)return null;
  const fatFree=weight*(1-bodyFat/100),targetWeight=fatFree/(1-targetBodyFat/100);
  return {fatFree,targetWeight,weightChange:weight-targetWeight};
}
export function trend(records, profile) {
  const measured=records.filter(r=>!r.deleted && r.type==='measurement' && r.data.weight).map(r=>({date:r.date,weight:r.data.weight,id:r.id,updatedAt:r.updatedAt||''}));
  if(profile.initialWeight && profile.baselineDate) measured.push({date:profile.baselineDate,weight:profile.initialWeight,id:'baseline'});
  measured.sort((a,b)=>a.date.localeCompare(b.date)||(a.id==='baseline'?-1:b.id==='baseline'?1:0)||(a.updatedAt||'').localeCompare(b.updatedAt||'')||a.id.localeCompare(b.id));
  const byDate=new Map(); for(const p of measured) byDate.set(p.date,p);
  return [...byDate.values()];
}
export function analyze(records, profile, endDate, days=7) {
  const start=addDays(endDate,-days+1), dates=Array.from({length:days},(_,i)=>addDays(start,i));
  const available=dates.filter(d=>d>=profile.startDate && d<=dateIST());
  const exerciseDates=available.filter(d=>['Walk','Strength'].includes(planFor(d,profile).type));
  const completed=exerciseDates.filter(d=>workoutDone(planFor(d,profile),totals(records,d))).length;
  const foodDays=dates.filter(d=>totals(records,d).checkin.foodComplete);
  const waterDays=dates.filter(d=>totals(records,d).water>0);
  const avg=(ds,key)=>ds.length?Math.round(ds.reduce((s,d)=>s+totals(records,d)[key],0)/ds.length):null;
  return {dates,exercisePlanned:exerciseDates.length,exerciseCompleted:completed,foodDays:foodDays.length,waterDays:waterDays.length,averageCalories:avg(foodDays,'calories'),averageProtein:avg(foodDays,'protein'),averageWater:avg(waterDays,'water'),minutes:dates.reduce((s,d)=>s+totals(records,d).minutes,0),proteinDays:foodDays.filter(d=>totals(records,d).protein>=profile.proteinTarget).length};
}

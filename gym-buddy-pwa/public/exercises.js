// Catalog browsing stays inside the workout form so unsaved inputs survive.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog;
// Keep the dashboard and its prefilled session log on the same exercise list.
export function plannedExercises(plan){
  const rows=plan.type==='Walk'?[['Walking_Treadmill','Walking, Treadmill',`${plan.minutes} minutes total · Easy start and finish`]]:plan.type==='Strength'?[
    ['Bodyweight_Squat','Bodyweight Squat','1–2 sets · 8–12 controlled reps'],
    ['Incline_Push-Up','Incline Push-Up','1–2 sets · 8–12 controlled reps'],
    ['One-Arm_Dumbbell_Row','One-Arm Dumbbell Row','1–2 sets · 8–12 reps per side'],
    ['Butt_Lift_Bridge','Glute bridge','1–2 sets · 8–12 controlled reps'],
    ['Farmers_Walk',"Farmer’s Walk",'Gentle carry · Light weights, comfortable distance']
  ]:[];
  return rows.map(([exerciseId,name,target])=>({source:'free-exercise-db',exerciseId,name,target,completed:false}));
}
export function exerciseStatus(id,activities){
  const latest=[...activities].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')||b.id.localeCompare(a.id)).find(r=>r.data.exercises?.some(e=>e.exerciseId===id));
  const exercise=latest?.data.exercises.find(e=>e.exerciseId===id);
  return exercise?(exercise.completed?'Completed':'Not completed'):'Not logged';
}
export async function loadExercises(){
  if(!catalog)catalog=fetch('/exercises/catalog.json').then(r=>{if(!r.ok)throw new Error('The exercise library could not load. Reconnect and try again.');return r.json();}).catch(e=>{catalog=null;throw e;});
  return catalog;
}
export function filterExercises(items,{query='',muscle='',equipment='',level=''}={}){
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(e=>words.every(w=>e.name.toLowerCase().includes(w))&&(!muscle||e.primaryMuscles.includes(muscle)||e.secondaryMuscles.includes(muscle))&&(!equipment||e.equipment===equipment)&&(!level||e.level===level));
}
export function exerciseRowsHTML(rows=[]){return rows.map(e=>`<div class="workout-exercise" data-exercise-row data-source="${esc(e.source)}" data-id="${esc(e.exerciseId)}" data-name="${esc(e.name)}"><div class="row between"><strong>${esc(e.name)}</strong><button type="button" class="text-button" data-remove-exercise>Remove</button></div><label class="checkbox"><input type="checkbox" data-completed ${e.completed?'checked':''}> Completed</label><div class="exercise-values">${[['sets','Sets',1,100,1],['reps','Reps',1,1000,1],['weight','Weight · kg',0,1000,.1]].map(([k,label,min,max,step])=>`<label>${label}<input aria-label="${label} for ${esc(e.name)}" type="number" data-value="${k}" value="${esc(e[k]??'')}" min="${min}" max="${max}" step="${step}" placeholder="Optional"></label>`).join('')}</div><button type="button" class="text-button" data-guide="${esc(e.exerciseId)}">How to do it</button></div>`).join('');}
export function readExerciseRows(root){return [...root.querySelectorAll('[data-exercise-row]')].map(row=>{
  const e={source:row.dataset.source,exerciseId:row.dataset.id,name:row.dataset.name,completed:row.querySelector('[data-completed]').checked};
  for(const input of row.querySelectorAll('[data-value]'))if(input.value!=='')e[input.dataset.value]=Number(input.value);
  return e;
});}
export function workoutExercisesHTML(rows=[]){return `<section class="full workout-exercises"><h3>Exercises</h3><p class="small muted">Mark what you completed. Sets, reps and weight are optional totals per exercise; workout duration is recorded once above.</p><div id="workout-exercise-rows">${exerciseRowsHTML(rows)}</div><button type="button" class="btn mt" data-browse-exercises>Add exercises</button><div id="exercise-browser" hidden></div></section>`;}
export async function mountExerciseBrowser(root,onChoose){
  root.hidden=false;
  root.innerHTML='<p role="status">Loading exercises…</p>';
  try{
    const items=await loadExercises();
    if(!root.isConnected)return;
    const options=(values)=>'<option value="">All</option>'+[...new Set(values.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    root.innerHTML=`<div class="exercise-browser"><div class="row between"><h3>Exercise library</h3><button type="button" class="text-button" data-hide-library>Close library</button></div><div class="exercise-filters"><label>Search exercises<input type="search" data-filter="query" placeholder="e.g. dumbbell curl"></label><label>Muscle<select data-filter="muscle">${options(items.flatMap(e=>[...e.primaryMuscles,...e.secondaryMuscles]))}</select></label><label>Equipment<select data-filter="equipment">${options(items.map(e=>e.equipment))}</select></label><label>Difficulty<select data-filter="level">${options(items.map(e=>e.level))}</select></label></div><p class="small muted" data-count role="status"></p><div data-results class="exercise-results"></div><div data-guide-panel></div><p class="small muted mt">Source: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">Free Exercise DB</a>. Photos remain available offline after viewing.</p></div>`;
    let limit=30;
    const render=()=>{
      const filters=Object.fromEntries([...root.querySelectorAll('[data-filter]')].map(el=>[el.dataset.filter,el.value]));
      const matches=filterExercises(items,filters);
      root.querySelector('[data-count]').textContent=`${matches.length} exercises found`;
      root.querySelector('[data-results]').innerHTML=matches.slice(0,limit).map(e=>`<article class="exercise-result"><div><strong>${esc(e.name)}</strong><p class="small muted">${esc(e.primaryMuscles.join(', '))} · ${esc(e.equipment||'Equipment not specified')} · ${esc(e.level)}</p></div><div class="button-group"><button type="button" class="btn" data-guide="${esc(e.id)}">How to do it</button><button type="button" class="btn primary" data-choose="${esc(e.id)}">Add to workout</button></div></article>`).join('')||( '<p>No exercises match. Try another search or clear a filter.</p>');
      if(matches.length>limit)root.querySelector('[data-results]').insertAdjacentHTML('beforeend','<button type="button" class="btn" data-more-exercises>Show more</button>');
    };
    root.oninput=()=>{limit=30;render();};
    root.onclick=async event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-more-exercises')){limit+=30;render();}
      if(button.hasAttribute('data-hide-library')){root.hidden=true;root.parentElement.querySelector('[data-browse-exercises]')?.focus();}
      if(button.dataset.choose)onChoose(items.find(e=>e.id===button.dataset.choose));
      // Guide clicks are handled by the shared dialog listener.
    };
    render();root.querySelector('input').focus();
  }catch(e){root.innerHTML=`<p role="alert">${esc(e.message)}</p><button type="button" class="btn" data-retry-library>Retry library</button>`;root.onclick=()=>mountExerciseBrowser(root,onChoose);}
}
export async function showExerciseGuide(root,id){
  let panel=root.querySelector(':scope > [data-guide-panel]');
  if(!panel){panel=document.createElement('div');panel.dataset.guidePanel='';root.append(panel);}
  panel.hidden=false;panel.innerHTML='<p role="status">Loading instructions…</p>';
  try{
    const e=(await loadExercises()).find(e=>e.id===id);
    if(!e)throw new Error('Instructions for this exercise are unavailable. Your workout entry is preserved.');
    panel.innerHTML=`<section class="exercise-guide" tabindex="-1"><div class="row between"><h3>${esc(e.name)}</h3><button type="button" class="text-button" data-close-guide>Close instructions</button></div><p class="small muted">Primary: ${esc(e.primaryMuscles.join(', '))}${e.secondaryMuscles.length?` · Secondary: ${esc(e.secondaryMuscles.join(', '))}`:''}</p><div class="exercise-photos">${e.images.map((path,i)=>`<figure><img src="/exercises/images/${esc(path)}" alt="${esc(e.name)} demonstration photo ${i+1}"><figcaption>Position ${i+1}</figcaption></figure>`).join('')}</div><p class="small muted" data-photo-error ${e.images.length?'hidden':''}>Photo unavailable. Follow the written instructions below.</p>${e.instructions.length?`<ol>${e.instructions.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:'<p>Written instructions are unavailable for this exercise.</p>'}</section>`;
    for(const img of panel.querySelectorAll('img'))img.onerror=()=>{img.closest('figure').hidden=true;panel.querySelector('[data-photo-error]').hidden=false;};
    panel.querySelector('[data-close-guide]').onclick=()=>{panel.hidden=true;root.querySelector(`[data-guide="${CSS.escape(id)}"]`)?.focus();};
    panel.querySelector('section').focus();
  }catch(e){panel.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
}

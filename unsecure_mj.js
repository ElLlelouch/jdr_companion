import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, onSnapshot, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB73e3kgzwX3R7d8dE1Avwf28V_HVBvGXg",
  authDomain: "jdr-companion.firebaseapp.com",
  projectId: "jdr-companion",
  storageBucket: "jdr-companion.firebasestorage.app",
  messagingSenderId: "728047149353",
  appId: "1:728047149353:web:287b417f875c876c87d738"
};

const MJ_PASSWORD = "Centurio";
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Désactiver molette sur inputs number
document.addEventListener('wheel', () => {
  if (document.activeElement?.type === 'number') document.activeElement.blur();
}, { passive: true });

// =====================
// MOT DE PASSE
// =====================
const lockEl  = document.getElementById('mj-lock');
const mainEl  = document.getElementById('mj-main');
const pwInput = document.getElementById('mj-password');
const pwBtn   = document.getElementById('mj-unlock');
const pwError = document.getElementById('mj-pw-error');

function unlock() {
  if (pwInput.value === MJ_PASSWORD) {
    lockEl.classList.add('hidden');
    mainEl.classList.remove('hidden');
    init();
  } else {
    pwError.classList.remove('hidden');
    pwInput.value = '';
    pwInput.focus();
  }
}
pwBtn.addEventListener('click', unlock);
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });
pwInput.focus();

// =====================
// ONGLETS
// =====================
document.querySelectorAll('.mj-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mj-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mj-tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.remove('hidden');
  });
});

// =====================
// FORMULE DÉGÂTS
// =====================
function calcDegats(atk, def, multi=1) {
  if (atk<=0) return 0;
  return Math.round(((atk/2)/Math.pow(1+1/atk,1.1*def))*multi);
}

// =====================
// CHRONO
// =====================
function initChrono() {
  const display=document.getElementById('chrono-display');
  let interval=null, seconds=0, running=false, countdown=false;
  function fmt(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  document.getElementById('chrono-start').addEventListener('click',()=>{
    if(running) return; running=true;
    interval=setInterval(()=>{
      seconds+=countdown?-1:1;
      if(seconds<=0&&countdown){seconds=0;clearInterval(interval);running=false;display.style.color='#e74c3c';}
      display.textContent=fmt(Math.abs(seconds));
    },1000);
  });
  document.getElementById('chrono-stop').addEventListener('click',()=>{clearInterval(interval);running=false;});
  document.getElementById('chrono-reset').addEventListener('click',()=>{clearInterval(interval);running=false;countdown=false;seconds=0;display.textContent='00:00';display.style.color='';});
  document.querySelectorAll('.preset-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{clearInterval(interval);running=false;countdown=true;seconds=parseInt(btn.dataset.seconds);display.textContent=fmt(seconds);display.style.color='';});
  });
}

// =====================
// CALCULATEUR
// =====================
function initCalculateur() {
  document.getElementById('calc-btn').addEventListener('click',()=>{
    const atk     = parseFloat(document.getElementById('calc-atk').value)     || 0;
    const multAtk = parseFloat(document.getElementById('calc-mult-atk').value)|| 1;
    const def     = parseFloat(document.getElementById('calc-def').value)     || 0;
    const multDef = parseFloat(document.getElementById('calc-mult-def').value)|| 1;
    const mult    = parseFloat(document.getElementById('calc-mult').value)    || 1;
    const atkFinal = Math.round(atk * multAtk);
    const defFinal = Math.round(def * multDef);
    document.getElementById('calc-res-total').textContent = calcDegats(atkFinal, defFinal, mult) || '—';
  });
}

function loadIntoCalc(atkVal, defVal) {
  if (atkVal!==null) document.getElementById('calc-atk').value=atkVal;
  if (defVal!==null) document.getElementById('calc-def').value=defVal;
}

// =====================
// ÉTAT COMBAT
// =====================
let joueursData       = {};
let ennemis           = [];
let joueursHidden     = new Set();
let expTotal          = 0;
let racesDataMJ       = {};
let monstreTypes      = {};
let genCurrentMonster = null;
let genSkills         = [];
let favorisCache      = [];
let editingFavoriId   = null;
let statutsCacheMJ    = [];
let allSkills         = [];
let editingSkillId    = null;
let selectedClasses   = [];
let allClassesList    = [];

// =====================
// CALCUL STATS TOTALES JOUEUR
// =====================
function calcStatTotal(data, stat) {
  const STAT_MAP={ATK:'atk',DEF:'def',MAG:'mag',RESI:'res',AGI:'agi'};
  const key=STAT_MAP[stat];
  const flat    = parseFloat(data[`flat${stat}`]||0);
  const bonus   = parseFloat(data[`bonus${stat}`]||0);
  const percent = parseFloat(data[`percent${stat}`]||0);
  const slots   = ['main1Item','main2Item','helmetItem','armorItem','bootsItem','glovesItem','jewelItem'];
  let equip=0;
  slots.forEach(s=>{if(data[s]&&data[s][key]) equip+=parseInt(data[s][key])||0;});
  return Math.round((flat+equip+bonus)*(1+percent/100));
}

// =====================
// RENDER INITIATIVE
// =====================
function tranche(agi){ return Math.floor(agi/10)*10; }

function renderInitiative() {
  const container=document.getElementById('initiative-container');
  container.innerHTML='';
  const tous=[];

  Object.entries(joueursData).forEach(([id,data])=>{
    if (joueursHidden.has(id)) return;
    const agi=calcStatTotal(data,'AGI');
    tous.push({kind:'pj', id, nom:data.nom, hpCurrent:data.hpCurrent||0, hpMax:data.hpMax||0, agi, data, statuts:data.statuts||[]});
  });

  ennemis.forEach(e=>{ tous.push({kind:e.type, ...e}); });

  const groupes={};
  tous.forEach(c=>{
    const t=tranche(c.agi);
    if(!groupes[t]) groupes[t]=[];
    groupes[t].push(c);
  });

  const tranches=Object.keys(groupes).map(Number).sort((a,b)=>b-a);
  if(!tranches.length){
    container.innerHTML='<p class="placeholder-text" style="padding:0.5rem">Aucun combattant.</p>';
    return;
  }

  tranches.forEach(t=>{
    const group=document.createElement('div');
    group.className='initiative-group';
    const header=document.createElement('div');
    header.className='initiative-group-header';
    header.textContent=`AGI ${t} – ${t+9}`;
    group.appendChild(header);

    const ordre={pj:0,ally:1,enemy:2};
    groupes[t].sort((a,b)=>(ordre[a.kind]||0)-(ordre[b.kind]||0));

    groupes[t].forEach(c=>{
      const row=document.createElement('div');
      row.className=`combattant-row combattant-row--${c.kind}`;
      const pct=c.hpMax>0?(c.hpCurrent/c.hpMax)*100:0;
      if(pct<=25&&c.hpMax>0) row.classList.add('combattant-row--critique');
      if(c.kind==='pj') renderJoueurRow(row,c);
      else renderCombattantRow(row,c);
      group.appendChild(row);
    });
    container.appendChild(group);
  });

  // Joueurs masqués — ligne compacte en bas avec bouton réafficher
  if (joueursHidden.size > 0) {
    const hiddenGroup = document.createElement('div');
    hiddenGroup.className = 'initiative-group';
    const hiddenHeader = document.createElement('div');
    hiddenHeader.className = 'initiative-group-header';
    hiddenHeader.textContent = 'Joueurs absents';
    hiddenGroup.appendChild(hiddenHeader);

    joueursHidden.forEach(id => {
      const data = joueursData[id];
      if (!data) return;
      const mini = document.createElement('div');
      mini.className = 'combattant-hidden-row';
      mini.innerHTML = `<span class="combattant-hidden-nom">${data.nom}</span><span class="combattant-hidden-label">absent</span>`;
      const showBtn = document.createElement('button');
      showBtn.className = 'combattant-delete';
      showBtn.textContent = '+';
      showBtn.title = 'Réintégrer au combat';
      showBtn.style.color = '#2ecc71';
      showBtn.style.borderColor = '#2ecc71';
      showBtn.addEventListener('click', () => { joueursHidden.delete(id); renderInitiative(); });
      mini.appendChild(showBtn);
      hiddenGroup.appendChild(mini);
    });
    container.appendChild(hiddenGroup);
  }
}

function renderJoueurRow(row, c) {
  const data=c.data;
  const STATS=['ATK','DEF','MAG','RESI','AGI'];

  const left=document.createElement('div');
  left.className='combattant-left';
  left.innerHTML=`<div class="combattant-nom">${c.nom}</div><div class="combattant-hp-text">${c.hpCurrent} / ${c.hpMax} PV</div>`;

  const historyEl=document.createElement('div');
  historyEl.className='hp-history-mj';
  const hpHist=(data.historique||[]).filter(e=>e.type==='hp').slice(0,5);
  renderHpHistory(historyEl, hpHist);
  
  const statsEl=document.createElement('div');
  statsEl.className='combattant-stats-row';
  STATS.forEach(stat=>{
    const flat=parseFloat(data[`flat${stat}`]||0);
    const total=calcStatTotal(data,stat);
    const badge=document.createElement('span');
    badge.className='combattant-stat-badge combattant-stat-badge--clickable';
    badge.textContent=`${stat} ${flat}/${total}`;
    badge.addEventListener('click',()=>{
      if(stat==='ATK'||stat==='MAG') loadIntoCalc(total,null);
      else if(stat==='DEF'||stat==='RESI') loadIntoCalc(null,total);
    });
    statsEl.appendChild(badge);
  });

  const statutsEl=document.createElement('div');
  statutsEl.className='combattant-statuts-display';
  (c.statuts||[]).forEach(s=>{
    if(!s.nom) return;
    const span=document.createElement('span');
    span.className='statut-badge';
    const checked=(s.checks||[]).filter(Boolean).length;
    span.textContent=checked>0?`${s.nom} (${checked})`:s.nom;
    statutsEl.appendChild(span);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'combattant-delete';
  delBtn.textContent = '✕';
  delBtn.title = 'Masquer ce joueur';
  delBtn.addEventListener('click', () => {
    joueursHidden.add(c.id);
    renderInitiative();
  });

  row.appendChild(left);
  row.appendChild(historyEl);
  row.appendChild(statsEl);
  row.appendChild(statutsEl);
  row.appendChild(delBtn);
}

function renderCombattantRow(row, c) {
  const nomEl=document.createElement('div');
  nomEl.className='combattant-nom';
  nomEl.textContent=c.nom;
  row.appendChild(nomEl);

  const hpBlock=document.createElement('div');
  hpBlock.className='combattant-hp-block';
  const btnM=document.createElement('button'); btnM.className='bar-btn bar-btn--sm'; btnM.textContent='−';
  const hpTxt=document.createElement('span');  hpTxt.className='combattant-hp-text'; hpTxt.textContent=`${c.hpCurrent}/${c.hpMax}`;
  const btnP=document.createElement('button'); btnP.className='bar-btn bar-btn--sm'; btnP.textContent='+';

  if(!c.hpHistory) c.hpHistory=[];
  const historyEl=document.createElement('div');
  historyEl.className='hp-history-mj';
  renderHpHistory(historyEl, c.hpHistory);

  let timer=null,isLong=false;
  function changeHp(d){
    const avant=c.hpCurrent;
    c.hpCurrent=Math.max(0,Math.min(c.hpMax,c.hpCurrent+d));
    hpTxt.textContent=`${c.hpCurrent}/${c.hpMax}`;
    const p=c.hpMax>0?(c.hpCurrent/c.hpMax)*100:0;
    row.classList.toggle('combattant-row--critique',p<=25&&c.hpMax>0);
    const delta=c.hpCurrent-avant;
    if(delta!==0){
      c.hpHistory.unshift({delta,after:c.hpCurrent,max:c.hpMax});
      if(c.hpHistory.length>5) c.hpHistory.pop();
      renderHpHistory(historyEl,c.hpHistory);
    }
  }
  function att(btn,dir){
    btn.addEventListener('click',()=>{if(!isLong)changeHp(dir);isLong=false;});
    btn.addEventListener('pointerdown',()=>{isLong=false;timer=setTimeout(()=>{isLong=true;changeHp(dir*5);},500);});
    btn.addEventListener('pointerup',()=>clearTimeout(timer));
    btn.addEventListener('pointerleave',()=>clearTimeout(timer));
  }
  att(btnM,-1); att(btnP,1);

  hpBlock.appendChild(btnM); hpBlock.appendChild(hpTxt); hpBlock.appendChild(btnP);
  row.appendChild(hpBlock);
  row.appendChild(historyEl);

  const statsEl=document.createElement('div');
  statsEl.className='combattant-stats-row';
  [['ATK',c.atk||0],['DEF',c.def||0],['MAG',c.mag||0],['RES',c.res||0],['AGI',c.agi||0]].forEach(([s,v])=>{
    if(!v) return;
    const badge=document.createElement('span');
    badge.className='combattant-stat-badge combattant-stat-badge--clickable';
    badge.textContent=`${s} ${v}`;
    badge.addEventListener('click',()=>{
      if(s==='ATK'||s==='MAG') loadIntoCalc(v,null);
      else if(s==='DEF'||s==='RES') loadIntoCalc(null,v);
    });
    statsEl.appendChild(badge);
  });
  row.appendChild(statsEl);

  const statutsWrap=document.createElement('div');
  statutsWrap.className='combattant-statuts-edit';
  renderCombattantStatuts(statutsWrap,c);
  row.appendChild(statutsWrap);

  const del=document.createElement('button');
  del.className='combattant-delete'; del.textContent='✕';
  del.addEventListener('click',()=>{ennemis=ennemis.filter(e=>e.id!==c.id);renderInitiative();});
  row.appendChild(del);
}

function renderHpHistory(el, history) {
  el.innerHTML='';
  if(!history||!history.length) return;
  history.forEach((e,i)=>{
    const sign=e.delta>0?'+':'';
    const cls=e.delta>0?'hist-pos':'hist-neg';
    const sep=i<history.length-1?'<span class="hist-sep"> · </span>':'';
    el.innerHTML+=`<span class="hist-entry ${cls}">${sign}${e.delta}</span>${sep}`;
  });
}

function renderCombattantStatuts(wrap, c) {
  wrap.innerHTML='';
  if(!c.statuts) c.statuts=[];
  const list=document.createElement('div'); list.className='statuts-list-mj';
  c.statuts.forEach((s,i)=>{
    const item=document.createElement('div'); item.className='statut-item';
    const inp=document.createElement('input'); inp.className='statut-nom-input'; inp.type='text'; inp.value=s.nom||''; inp.placeholder='Statut...';
    inp.addEventListener('blur',()=>{c.statuts[i].nom=inp.value;});
    const checks=document.createElement('div'); checks.className='statut-checks-group';
    for(let k=0;k<5;k++){
      if(k===3){const sep=document.createElement('div');sep.className='statut-sep';checks.appendChild(sep);}
      const cb=document.createElement('input'); cb.type='checkbox'; cb.className='statut-check'; cb.checked=s.checks?.[k]||false;
      cb.addEventListener('change',()=>{if(!c.statuts[i].checks)c.statuts[i].checks=[false,false,false,false,false];c.statuts[i].checks[k]=cb.checked;});
      checks.appendChild(cb);
    }
    const del=document.createElement('button'); del.className='statut-del'; del.textContent='✕';
    del.addEventListener('click',()=>{c.statuts.splice(i,1);renderCombattantStatuts(wrap,c);});
    item.appendChild(inp); item.appendChild(checks); item.appendChild(del);
    list.appendChild(item);
  });
  const addBtn=document.createElement('button'); addBtn.className='statut-add-btn'; addBtn.textContent='+ Statut';
  addBtn.addEventListener('click',()=>{c.statuts.push({nom:'',checks:[false,false,false,false,false]});renderCombattantStatuts(wrap,c);});
  wrap.appendChild(list); wrap.appendChild(addBtn);
}

// =====================
// MODALS ENNEMI / ALLIÉ
// =====================
function initModals() {
  const modal    =document.getElementById('modal-ennemi');
  const titleEl  =document.getElementById('modal-ennemi-title');
  const btnEnemy =document.getElementById('btn-add-ennemi');
  const btnAlly  =document.getElementById('btn-add-ally');
  const btnOk    =document.getElementById('ennemi-confirm');
  const btnCancel=document.getElementById('ennemi-cancel');
  let currentKind='enemy';

  btnEnemy.addEventListener('click',()=>{titleEl.textContent='Ajouter un ennemi';currentKind='enemy';modal.classList.remove('hidden');});
  btnAlly.addEventListener('click', ()=>{titleEl.textContent='Ajouter un allié'; currentKind='ally'; modal.classList.remove('hidden');});
  btnCancel.addEventListener('click',()=>modal.classList.add('hidden'));

  btnOk.addEventListener('click',()=>{
    const nom   =document.getElementById('ennemi-nom').value.trim()||'Inconnu';
    const hpMax =parseInt(document.getElementById('ennemi-hp-max').value)||50;
    const agi   =parseInt(document.getElementById('ennemi-agi').value)||50;
    const atk   =parseInt(document.getElementById('ennemi-atk').value)||0;
    const def   =parseInt(document.getElementById('ennemi-def').value)||0;
    const mag   =parseInt(document.getElementById('ennemi-mag').value)||0;
    const res   =parseInt(document.getElementById('ennemi-res').value)||0;
    ennemis.push({id:`${currentKind}_${Date.now()}`,type:currentKind,nom,hpMax,hpCurrent:hpMax,agi,atk,def,mag,res,statuts:[],hpHistory:[]});
    ['ennemi-nom','ennemi-atk','ennemi-def','ennemi-mag','ennemi-res'].forEach(id=>document.getElementById(id).value='');
    ['ennemi-hp-max','ennemi-agi'].forEach(id=>document.getElementById(id).value='50');
    modal.classList.add('hidden');
    renderInitiative();
  });
}

// =====================
// NOUVEAU COMBAT
// =====================
function initNouveauCombat() {
  document.getElementById('btn-nouveau-combat').addEventListener('click',()=>{
    if(!confirm('Réinitialiser le combat ? Les ennemis et alliés seront supprimés.')) return;
    ennemis=[];
    joueursHidden.clear();
    renderInitiative();
  });
}

// =====================
// ITEMS
// =====================
let allItems=[];
let editingItemId=null;
const SLOTS_KEYS=['main1Item','main2Item','helmetItem','armorItem','bootsItem','glovesItem','jewelItem'];

async function chargerItems() {
  const q=query(collection(db,'items'),orderBy('name'));
  const sn=await getDocs(q);
  allItems=[];
  sn.forEach(d=>allItems.push({id:d.id,...d.data()}));
  renderItems();
}

function renderItems(filter='',typeFilter='') {
  const tbody=document.getElementById('items-tbody'); tbody.innerHTML='';
  const filtered=allItems.filter(i=>i.name.toLowerCase().includes(filter.toLowerCase())&&(typeFilter?i.type===typeFilter:true));
  if(!filtered.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:1rem;font-style:italic;color:var(--text-dim)">Aucun item.</td></tr>';return;}
  filtered.forEach(item=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${item.name}</td><td>${item.type}</td><td>${item.atk||0}</td><td>${item.def||0}</td><td>${item.mag||0}</td><td>${item.res||0}</td><td>${item.agi||0}</td><td style="white-space:normal;word-break:break-word;font-style:italic;color:var(--text-dim)">${item.desc||''}</td><td><button class="item-edit-btn" data-id="${item.id}">✏️</button></td><td><button class="item-del-btn" data-id="${item.id}" data-name="${item.name}">🗑️</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.item-edit-btn').forEach(btn=>btn.addEventListener('click',()=>openItemModal(btn.dataset.id)));
  tbody.querySelectorAll('.item-del-btn').forEach(btn=>btn.addEventListener('click',()=>deleteItem(btn.dataset.id,btn.dataset.name)));
}

function openItemModal(id=null) {
  const modal=document.getElementById('modal-item');
  editingItemId=id;
  document.getElementById('modal-item-title').textContent=id?'Modifier l\'item':'Nouvel item';
  if(id){
    const item=allItems.find(i=>i.id===id);
    if(!item) return;
    document.getElementById('item-nom').value=item.name;
    document.getElementById('item-nom').readOnly=false;
    document.getElementById('item-nom').style.opacity='1';
    document.getElementById('item-nom').dataset.oldName=item.name;
    document.getElementById('item-type').value=item.type;
    document.getElementById('item-atk').value=item.atk||0;
    document.getElementById('item-def').value=item.def||0;
    document.getElementById('item-mag').value=item.mag||0;
    document.getElementById('item-resi').value=item.res||0;
    document.getElementById('item-agi').value=item.agi||0;
    document.getElementById('item-desc').value=item.desc||'';
  } else {
    document.getElementById('item-nom').readOnly=false;
    document.getElementById('item-nom').style.opacity='1';
    ['item-nom','item-desc'].forEach(id=>document.getElementById(id).value='');
    ['item-atk','item-def','item-mag','item-resi','item-agi'].forEach(id=>document.getElementById(id).value='0');
    document.getElementById('item-type').value='main';
  }
  modal.classList.remove('hidden');
}

function initModalItem() {
  document.getElementById('btn-new-item').addEventListener('click',()=>openItemModal(null));
  document.getElementById('item-cancel').addEventListener('click',()=>document.getElementById('modal-item').classList.add('hidden'));
  document.getElementById('item-confirm').addEventListener('click',async()=>{
    const nom=document.getElementById('item-nom').value.trim();
    if(!nom){alert('Nom requis.');return;}
    const itemData={
      name:nom, type:document.getElementById('item-type').value,
      atk:parseInt(document.getElementById('item-atk').value)||0,
      def:parseInt(document.getElementById('item-def').value)||0,
      mag:parseInt(document.getElementById('item-mag').value)||0,
      res:parseInt(document.getElementById('item-resi').value)||0,
      agi:parseInt(document.getElementById('item-agi').value)||0,
      desc:document.getElementById('item-desc').value.trim(),
    };
    try {
      if(editingItemId){
        const oldName=document.getElementById('item-nom').dataset.oldName||itemData.name;
        await updateDoc(doc(db,'items',editingItemId),itemData);
        const idx=allItems.findIndex(i=>i.id===editingItemId);
        if(idx!==-1) allItems[idx]={id:editingItemId,...itemData};
        await updateJoueursWithItem(itemData,oldName);
      } else {
        const allIds=allItems.map(i=>i.id).filter(id=>/^item_\d+$/.test(id)).map(id=>parseInt(id.replace('item_',''))).filter(n=>!isNaN(n));
        const nextNum=allIds.length>0?Math.max(...allIds)+1:1;
        const newId=`item_${String(nextNum).padStart(4,'0')}`;
        await setDoc(doc(db,'items',newId),itemData);
        allItems.push({id:newId,...itemData});
        allItems.sort((a,b)=>a.name.localeCompare(b.name));
      }
      document.getElementById('modal-item').classList.add('hidden');
      renderItems(document.getElementById('items-search').value,document.getElementById('items-filter-type').value);
    } catch(err){console.error(err);alert('Erreur sauvegarde.');}
  });
}

async function updateJoueursWithItem(itemData, oldName=null) {
  const searchName=oldName||itemData.name;
  const snapshot=await getDocs(collection(db,'joueurs'));
  const promises=[];
  snapshot.forEach(docSnap=>{
    const data=docSnap.data();
    const updates={};
    SLOTS_KEYS.forEach(slot=>{
      if(data[slot]&&data[slot].name===searchName){
        updates[slot]={name:itemData.name,type:itemData.type,atk:itemData.atk,def:itemData.def,mag:itemData.mag,res:itemData.res,agi:itemData.agi,desc:itemData.desc};
      }
    });
    if(Object.keys(updates).length>0) promises.push(updateDoc(doc(db,'joueurs',docSnap.id),updates));
  });
  await Promise.all(promises);
}

async function deleteItem(itemId, itemName) {
  const snapshot=await getDocs(collection(db,'joueurs'));
  let equippedBy=null;
  snapshot.forEach(docSnap=>{
    const data=docSnap.data();
    SLOTS_KEYS.forEach(slot=>{if(data[slot]&&data[slot].name===itemName) equippedBy=data.nom;});
  });
  if(equippedBy){alert(`Impossible de supprimer "${itemName}" : équipé chez ${equippedBy}.`);return;}
  if(!confirm(`Êtes-vous sûr de vouloir supprimer "${itemName}" ?`)) return;
  try {
    const {deleteDoc}=await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(doc(db,'items',itemId));
    allItems=allItems.filter(i=>i.id!==itemId);
    renderItems(document.getElementById('items-search').value,document.getElementById('items-filter-type').value);
  } catch(err){console.error(err);alert('Erreur suppression.');}
}

// =====================
// NOTES
// =====================
async function initNotes() {
  const noteRef=doc(db,'mj','notes');
  try {
    const snap=await getDoc(noteRef);
    const data=snap.exists()?snap.data():{};
    ['mj-notes-1','mj-notes-2','mj-notes-3'].forEach((id,i)=>{
      const el=document.getElementById(id);
      el.value=data[`notes${i+1}`]||'';
      el.addEventListener('blur',()=>{
        setDoc(noteRef,{notes1:document.getElementById('mj-notes-1').value,notes2:document.getElementById('mj-notes-2').value,notes3:document.getElementById('mj-notes-3').value},{merge:true});
      });
    });
  } catch(err){console.error(err);}
  const sharedRef=doc(db,'global_notes','global');
  onSnapshot(sharedRef,snap=>{if(snap.exists()) document.getElementById('shared-notes-view').value=snap.data().notes||'';});
}

// =====================
// MESSAGES
// =====================
async function initMessages() {
  const select=document.getElementById('msg-joueur-select');
  const snapshot=await getDocs(collection(db,'joueurs'));
  snapshot.forEach(docSnap=>{
    const opt=document.createElement('option');
    opt.value=docSnap.id;
    opt.textContent=docSnap.data().nom;
    select.appendChild(opt);
  });
  document.getElementById('msg-send').addEventListener('click',async()=>{
    const joueurId=select.value;
    const msg=document.getElementById('msg-content').value.trim();
    if(!joueurId||!msg){alert('Choisissez un joueur et écrivez un message.');return;}
    try {
      await updateDoc(doc(db,'joueurs',joueurId),{personal_message:msg});
      document.getElementById('msg-content').value='';
      const status=document.getElementById('msg-status');
      status.classList.remove('hidden');
      setTimeout(()=>status.classList.add('hidden'),2000);
    } catch(err){console.error(err);}
  });
}

// =====================
// INIT
// =====================
async function init() {
  initChrono();
  initCalculateur();
  initModals();
  initNouveauCombat();
  initModalItem();
  await chargerItems();
  await initNotes();
  await initMessages();
  document.getElementById('items-search').addEventListener('input',e=>renderItems(e.target.value,document.getElementById('items-filter-type').value));
  document.getElementById('items-filter-type').addEventListener('change',e=>renderItems(document.getElementById('items-search').value,e.target.value));
  onSnapshot(collection(db,'joueurs'),snapshot=>{
    snapshot.forEach(d=>{joueursData[d.id]={id:d.id,...d.data()};});
    renderInitiative();
  });
}

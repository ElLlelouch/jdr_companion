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
let joueursData   = {};
let ennemis       = [];
let joueursHidden = new Set();

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
    const typeClass = s.type==='pos' ? 'statut-badge--pos' : s.type==='neg' ? 'statut-badge--neg' : s.type ? 'statut-badge--oth' : '';
    span.className=`statut-badge${typeClass?' '+typeClass:''}`;
    const checked=(s.checks||[]).filter(Boolean).length;
    span.textContent=checked>0?`${s.nom} (${checked}/5)`:s.nom;
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

  if (!c.hpHistory) c.hpHistory = [];
  if (!c.hpPending) c.hpPending = 0;  // Accumulation du delta pendant le debounce
  const historyEl = document.createElement('div');
  historyEl.className = 'hp-history-mj';
  renderHpHistory(historyEl, c.hpHistory);

  let timer = null, isLong = false, histDebounce = null;

  function flushHpHistory() {
    if (c.hpPending === 0) return;
    c.hpHistory.unshift({ delta: c.hpPending, after: c.hpCurrent, max: c.hpMax });
    if (c.hpHistory.length > 5) c.hpHistory.pop();
    renderHpHistory(historyEl, c.hpHistory);
    c.hpPending = 0;
  }

  function changeHp(d) {
    const avant = c.hpCurrent;
    c.hpCurrent = Math.max(0, Math.min(c.hpMax, c.hpCurrent + d));
    hpTxt.textContent = `${c.hpCurrent}/${c.hpMax}`;
    const p = c.hpMax > 0 ? (c.hpCurrent / c.hpMax) * 100 : 0;
    row.classList.toggle('combattant-row--critique', p <= 25 && c.hpMax > 0);
    const delta = c.hpCurrent - avant;
    if (delta !== 0) {
      c.hpPending += delta;
      clearTimeout(histDebounce);
      histDebounce = setTimeout(flushHpHistory, 3000);
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

  // EXP si disponible
  if (c.exp) {
    const expEl = document.createElement('span');
    expEl.className   = 'combattant-stat-badge';
    expEl.textContent = `EXP ${c.exp}`;
    expEl.style.color = 'var(--gold)';
    const expWrap = document.createElement('div');
    expWrap.className = 'combattant-stats-row';
    expWrap.appendChild(expEl);
    row.appendChild(expWrap);
  }

  // Compétences du monstre (depuis le générateur)
  if (c.combatSkills && c.combatSkills.length) {
    const skillsWrap = document.createElement('div');
    skillsWrap.className = 'combattant-combat-skills';
    c.combatSkills.forEach((s, si) => {
      const sRow = document.createElement('div');
      sRow.className = 'combat-skill-row';
      const sHeader = document.createElement('div');
      sHeader.className = 'combat-skill-header';
      const sName = document.createElement('span');
      sName.className   = 'combat-skill-name';
      sName.textContent = s.nom;
      sHeader.appendChild(sName);
      sRow.appendChild(sHeader);
      if (s.desc) {
        const sDesc = document.createElement('div');
        sDesc.className   = 'combat-skill-desc';
        sDesc.textContent = s.desc;
        sRow.appendChild(sDesc);
      }
      skillsWrap.appendChild(sRow);
    });
    row.appendChild(skillsWrap);
  }

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


function renderStatutsPJ(wrap, c) {
  wrap.innerHTML = '';
  const statuts = c.statuts || [];
  if (!statuts.length) return;

  const list = document.createElement('div');
  list.className = 'statuts-list-mj';

  statuts.forEach((s, i) => {
    if (!s.nom) return;
    const item = document.createElement('div');
    const typeClass = s.type==='pos' ? 'statut-item--pos' : s.type==='neg' ? 'statut-item--neg' : s.type ? 'statut-item--other' : '';
    item.className = `statut-item${typeClass ? ' '+typeClass : ''}`;

    // Nom (lecture seule) + desc
    const nomWrap = document.createElement('div');
    nomWrap.className = 'statut-nom-wrap';
    const nomEl = document.createElement('span');
    nomEl.className   = 'statut-nom-input';
    nomEl.textContent = s.nom;
    nomWrap.appendChild(nomEl);
    const descText = s.desc || (statutsCacheMJ.find(sc => sc.nom === s.nom)?.desc) || '';
    if (descText) {
      const descEl = document.createElement('div');
      descEl.className   = 'statut-desc-inline';
      descEl.textContent = descText;
      nomWrap.appendChild(descEl);
    }
    item.appendChild(nomWrap);

    // Cases à cocher (affichage live, non sauvegardées côté MJ)
    const checks = document.createElement('div');
    checks.className = 'statut-checks-group';
    for (let k = 0; k < 5; k++) {
      if (k === 3) { const sep = document.createElement('div'); sep.className = 'statut-sep'; checks.appendChild(sep); }
      const cb = document.createElement('input');
      cb.type      = 'checkbox';
      cb.className = 'statut-check';
      cb.checked   = s.checks?.[k] || false;
      cb.disabled  = true; // lecture seule — les joueurs les gèrent eux-mêmes
      checks.appendChild(cb);
    }
    item.appendChild(checks);
    list.appendChild(item);
  });

  wrap.appendChild(list);
}

function renderCombattantStatuts(wrap, c) {
  wrap.innerHTML = '';
  if (!c.statuts) c.statuts = [];

  const list = document.createElement('div');
  list.className = 'statuts-list-mj';

  c.statuts.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'statut-item';

    const nomWrap = document.createElement('div');
    nomWrap.className = 'statut-nom-wrap';
    const inp = document.createElement('input');
    inp.className = 'statut-nom-input'; inp.type = 'text';
    inp.value = s.nom || ''; inp.placeholder = 'Statut...';
    inp.addEventListener('blur', () => { c.statuts[i].nom = inp.value; });
    nomWrap.appendChild(inp);
    if (s.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'statut-desc-inline'; descEl.textContent = s.desc;
      nomWrap.appendChild(descEl);
    }
    // Couleur selon type
    const typeClass = s.type==='pos' ? 'statut-item--pos' : s.type==='neg' ? 'statut-item--neg' : s.type ? 'statut-item--other' : '';
    if (typeClass) item.classList.add(typeClass);

    const checks = document.createElement('div');
    checks.className = 'statut-checks-group';
    for (let k = 0; k < 5; k++) {
      if (k === 3) { const sep = document.createElement('div'); sep.className = 'statut-sep'; checks.appendChild(sep); }
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'statut-check';
      cb.checked = s.checks?.[k] || false;
      cb.addEventListener('change', () => {
        if (!c.statuts[i].checks) c.statuts[i].checks = [false,false,false,false,false];
        c.statuts[i].checks[k] = cb.checked;
      });
      checks.appendChild(cb);
    }

    const del = document.createElement('button');
    del.className = 'statut-del'; del.textContent = '✕';
    del.addEventListener('click', () => { c.statuts.splice(i, 1); renderCombattantStatuts(wrap, c); });

    item.appendChild(nomWrap);
    item.appendChild(checks);
    item.appendChild(del);
    list.appendChild(item);
  });

  const addBtn = document.createElement('button');
  addBtn.className   = 'statut-add-btn';
  addBtn.textContent = '+ Statut';
  addBtn.addEventListener('click', () => showStatutMenuMJ(addBtn, c, wrap));

  wrap.appendChild(list);
  wrap.appendChild(addBtn);
}

function showStatutMenuMJ(anchor, c, wrap) {
  const old = document.getElementById('statut-menu-mj');
  if (old) { old.remove(); return; }

  const menu = document.createElement('div');
  menu.id = 'statut-menu-mj';
  menu.className = 'statut-menu-popup';

  const opts = [
    { label: '✏️ Manuel',            action: () => { c.statuts.push({ nom:'', desc:'', type:'', checks:[false,false,false,false,false] }); renderCombattantStatuts(wrap,c); menu.remove(); } },
    { label: '✦ Positif aléatoire',  cls: 'statut-menu-btn--pos', action: () => {
      const pool = statutsCacheMJ.filter(s => s.type==='pos');
      if (!pool.length) return;
      const s = pool[Math.floor(Math.random()*pool.length)];
      c.statuts.push({ nom:s.nom, desc:s.desc||'', type:s.type||'pos', checks:[false,false,false,false,false] });
      renderCombattantStatuts(wrap,c); menu.remove();
    }},
    { label: '✦ Négatif aléatoire',  cls: 'statut-menu-btn--neg', action: () => {
      const pool = statutsCacheMJ.filter(s => s.type==='neg');
      if (!pool.length) return;
      const s = pool[Math.floor(Math.random()*pool.length)];
      c.statuts.push({ nom:s.nom, desc:s.desc||'', type:s.type||'neg', checks:[false,false,false,false,false] });
      renderCombattantStatuts(wrap,c); menu.remove();
    }},
    { label: '📋 Depuis la liste',   action: () => { menu.remove(); showStatutListeMJ(c, wrap); } },
  ];

  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.className   = `statut-menu-btn${o.cls?' '+o.cls:''}`;
    btn.textContent = o.label;
    btn.addEventListener('click', o.action);
    menu.appendChild(btn);
  });

  const rect = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;z-index:9999`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function h(e) {
      if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('click', h); }
    });
  }, 50);
}

function showStatutListeMJ(c, wrap) {
  const overlay = document.createElement('div');
  overlay.className = 'statut-liste-overlay';

  const box = document.createElement('div');
  box.className = 'statut-liste-box';

  const title = document.createElement('div');
  title.className = 'statut-liste-title'; title.textContent = 'Choisir un statut';

  const searchInp = document.createElement('input');
  searchInp.className = 'statut-liste-search'; searchInp.type = 'text'; searchInp.placeholder = 'Rechercher...';

  const items = document.createElement('div');
  items.className = 'statut-liste-items';

  function renderListe(filter) {
    items.innerHTML = '';
    statutsCacheMJ.filter(s => s.nom.toLowerCase().includes(filter.toLowerCase())).forEach(s => {
      const row = document.createElement('div');
      row.className = `statut-liste-row statut-liste-row--${s.type}`;
      row.innerHTML = `<span class="statut-liste-nom">${s.nom}</span><span class="statut-liste-desc">${s.desc||''}</span>`;
      row.addEventListener('click', () => {
        c.statuts.push({ nom:s.nom, desc:s.desc||'', type:s.type||'', checks:[false,false,false,false,false] });
        renderCombattantStatuts(wrap, c);
        overlay.remove();
      });
      items.appendChild(row);
    });
  }

  searchInp.addEventListener('input', () => renderListe(searchInp.value));
  renderListe('');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'statut-liste-close'; closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());

  box.appendChild(title); box.appendChild(closeBtn);
  box.appendChild(searchInp); box.appendChild(items);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  searchInp.focus();
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

// Générateur
let racesDataMJ     = {};
let monstreTypes    = {};
let genCurrentMonster = null;
let genSkills       = [];

// Statuts
let statutsCacheMJ  = [];

// Skills MJ
let allSkills       = [];
let editingSkillId  = null;
let selectedClasses = [];
let allClassesList  = [];

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
// SKILLS MJ
// =====================
async function chargerSkills() {
  const q  = query(collection(db,'skills'), orderBy('name'));
  const sn = await getDocs(q);
  allSkills = [];
  sn.forEach(d => allSkills.push({ id: d.id, ...d.data() }));

  // Charger toutes les classes
  const racesSnap = await getDocs(collection(db,'races'));
  allClassesList = [{ nom:'Special', abr:'Spc.' }];
  racesSnap.forEach(d => {
    (d.data().classes||[]).forEach(c => {
      if (!allClassesList.find(x => x.nom === c.nom)) allClassesList.push(c);
    });
  });
  allClassesList.sort((a,b) => a.nom.localeCompare(b.nom));

  // Filtre par classe
  const filterSelect = document.getElementById('skills-filter-class');
  if (filterSelect) {
    // Vider sauf la première option
    while (filterSelect.options.length > 1) filterSelect.remove(1);
    allClassesList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nom;
      opt.textContent = `${c.nom} (${c.abr})`;
      filterSelect.appendChild(opt);
    });
  }

  renderSkills();
  initSkillsFilters();
  initModalSkill();

  // onSnapshot propagation vers joueurs
  onSnapshot(collection(db,'skills'), snapshot => {
    snapshot.docChanges().forEach(change => {
      const updated = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'modified') {
        const idx = allSkills.findIndex(s => s.id === updated.id);
        if (idx !== -1) allSkills[idx] = updated;
        propagateSkillToJoueurs(updated);
      } else if (change.type === 'added') {
        if (!allSkills.find(s => s.id === updated.id)) allSkills.push(updated);
      } else if (change.type === 'removed') {
        allSkills = allSkills.filter(s => s.id !== updated.id);
      }
    });
    renderSkills(
      document.getElementById('skills-search')?.value || '',
      document.getElementById('skills-filter-class')?.value || ''
    );
  });
}

async function propagateSkillToJoueurs(skill) {
  const snapshot = await getDocs(collection(db,'joueurs'));
  const promises = [];
  snapshot.forEach(docSnap => {
    const data  = docSnap.data();
    const comps = data.competences || [];
    let changed = false;
    const updated = comps.map(c => {
      if (c.nom === skill.name) {
        changed = true;
        return { ...c, desc: skill.desc||'', range: skill.range||'', pm: skill.pm||0, pc: skill.pc||0, pc_note: skill.pc_note||'' };
      }
      return c;
    });
    if (changed) promises.push(updateDoc(doc(db,'joueurs',docSnap.id), { competences: updated }));
  });
  await Promise.all(promises);
}

function renderSkills(filter='', classFilter='') {
  const tbody = document.getElementById('skills-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const filtered = allSkills.filter(s => {
    const matchName  = s.name.toLowerCase().includes(filter.toLowerCase());
    const matchClass = classFilter ? (s.classes||'').includes(classFilter) : true;
    return matchName && matchClass;
  });
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:1rem;font-style:italic;color:var(--text-dim)">Aucune compétence.</td></tr>';
    return;
  }
  filtered.forEach(skill => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${skill.name}</td>
      <td style="font-size:0.8rem;color:var(--text-dim);white-space:normal;word-break:break-word;max-width:150px">${skill.classes||''}</td>
      <td>${skill.range||''}</td>
      <td style="text-align:center">${skill.pm||0}</td>
      <td style="text-align:center">${skill.pc > 0 ? skill.pc : (skill.pc_note || 'Maitrise')}</td>
      <td style="white-space:normal;word-break:break-word;font-style:italic;color:var(--text-dim);max-width:200px">${skill.desc||''}</td>
      <td><button class="item-edit-btn" data-id="${skill.id}">✏️</button></td>
      <td><button class="item-del-btn" data-id="${skill.id}" data-name="${skill.name}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.item-edit-btn').forEach(btn => btn.addEventListener('click', () => openSkillModal(btn.dataset.id)));
  tbody.querySelectorAll('.item-del-btn').forEach(btn => btn.addEventListener('click', () => deleteSkill(btn.dataset.id, btn.dataset.name)));
}

function initSkillsFilters() {
  const search = document.getElementById('skills-search');
  const filter = document.getElementById('skills-filter-class');
  if (search) search.addEventListener('input', e => renderSkills(e.target.value, filter?.value||''));
  if (filter) filter.addEventListener('change', e => renderSkills(search?.value||'', e.target.value));
}

function renderSelectedClasses() {
  const container = document.getElementById('skill-class-selected');
  if (!container) return;
  container.innerHTML = '';
  selectedClasses.forEach((cls, i) => {
    const tag = document.createElement('span');
    tag.className   = 'class-tag';
    tag.textContent = `${cls} ✕`;
    tag.addEventListener('click', () => { selectedClasses.splice(i, 1); renderSelectedClasses(); });
    container.appendChild(tag);
  });
}

function openSkillModal(id=null) {
  const modal = document.getElementById('modal-skill');
  if (!modal) return;
  editingSkillId  = id;
  selectedClasses = [];
  document.getElementById('modal-skill-title').textContent = id ? "Modifier la compétence" : "Nouvelle compétence";
  if (id) {
    const skill = allSkills.find(s => s.id === id);
    if (!skill) return;
    document.getElementById('skill-nom').value     = skill.name;
    document.getElementById('skill-range').value   = skill.range   || '';
    document.getElementById('skill-pm').value      = skill.pm      || 0;
    document.getElementById('skill-pc').value      = skill.pc      || 0;
    document.getElementById('skill-pc-note').value = skill.pc_note || '';
    document.getElementById('skill-desc').value    = skill.desc    || '';
    selectedClasses = (skill.classes||'').split(' / ').map(s=>s.trim()).filter(Boolean);
  } else {
    ['skill-nom','skill-range','skill-pc-note','skill-desc'].forEach(id => document.getElementById(id).value = '');
    ['skill-pm','skill-pc'].forEach(id => document.getElementById(id).value = '0');
  }
  renderSelectedClasses();
  modal.classList.remove('hidden');
}

function initModalSkill() {
  const btnNew = document.getElementById('btn-new-skill');
  if (btnNew) btnNew.addEventListener('click', () => openSkillModal(null));

  const btnCancel = document.getElementById('skill-cancel');
  if (btnCancel) btnCancel.addEventListener('click', () => document.getElementById('modal-skill').classList.add('hidden'));

  const classInput    = document.getElementById('skill-class-input');
  const classDropdown = document.getElementById('skill-class-dropdown');
  if (!classInput || !classDropdown) return;

  function renderClassDD(filter) {
    classDropdown.innerHTML = '';
    allClassesList
      .filter(c => c.nom.toLowerCase().includes(filter.toLowerCase()) || c.abr.toLowerCase().includes(filter.toLowerCase()))
      .filter(c => !selectedClasses.includes(c.nom))
      .forEach(c => {
        const opt = document.createElement('div');
        opt.className   = 'equip-option';
        opt.textContent = `${c.nom} (${c.abr})`;
        opt.addEventListener('mousedown', () => {
          selectedClasses.push(c.nom);
          classInput.value = '';
          classDropdown.classList.add('hidden');
          renderSelectedClasses();
        });
        classDropdown.appendChild(opt);
      });
  }

  function posClassDD() {
    const rect = classInput.getBoundingClientRect();
    classDropdown.style.position  = 'fixed';
    classDropdown.style.top       = (rect.bottom + 2) + 'px';
    classDropdown.style.left      = rect.left + 'px';
    classDropdown.style.width     = Math.max(rect.width, 200) + 'px';
    classDropdown.style.zIndex    = '9999';
    classDropdown.style.maxHeight = Math.min(220, window.innerHeight - rect.bottom - 8) + 'px';
  }

  classInput.addEventListener('focus', () => { renderClassDD(classInput.value); posClassDD(); classDropdown.classList.remove('hidden'); });
  classInput.addEventListener('input', () => { renderClassDD(classInput.value); posClassDD(); });
  classInput.addEventListener('blur',  () => setTimeout(() => classDropdown.classList.add('hidden'), 150));

  const btnConfirm = document.getElementById('skill-confirm');
  if (!btnConfirm) return;
  btnConfirm.addEventListener('click', async () => {
    const nom = document.getElementById('skill-nom').value.trim();
    if (!nom) { alert('Nom requis.'); return; }
    const oldName = editingSkillId ? allSkills.find(s => s.id === editingSkillId)?.name : null;
    const skillData = {
      name:    nom,
      classes: selectedClasses.join(' / '),
      range:   document.getElementById('skill-range').value.trim(),
      pm:      parseInt(document.getElementById('skill-pm').value)     || 0,
      pc:      parseInt(document.getElementById('skill-pc').value)     || 0,
      pc_note: document.getElementById('skill-pc-note').value.trim(),
      desc:    document.getElementById('skill-desc').value.trim(),
    };
    try {
      if (editingSkillId) {
        await updateDoc(doc(db,'skills',editingSkillId), skillData);
        const idx = allSkills.findIndex(s => s.id === editingSkillId);
        if (idx !== -1) allSkills[idx] = { id: editingSkillId, ...skillData };
        if (oldName && oldName !== nom) await renameSkillInJoueurs(oldName, nom, skillData);
      } else {
        const allIds  = allSkills.map(s=>s.id).filter(id=>/^skill_\d+$/.test(id)).map(id=>parseInt(id.replace('skill_',''))).filter(n=>!isNaN(n));
        const nextNum = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
        const newId   = `skill_${String(nextNum).padStart(4,'0')}`;
        await setDoc(doc(db,'skills',newId), skillData);
        allSkills.push({ id: newId, ...skillData });
        allSkills.sort((a,b) => a.name.localeCompare(b.name));
      }
      document.getElementById('modal-skill').classList.add('hidden');
      renderSkills(document.getElementById('skills-search')?.value||'', document.getElementById('skills-filter-class')?.value||'');
    } catch(err) { console.error(err); alert('Erreur sauvegarde.'); }
  });
}

async function renameSkillInJoueurs(oldName, newName, skillData) {
  const snapshot = await getDocs(collection(db,'joueurs'));
  const promises = [];
  snapshot.forEach(docSnap => {
    const comps = docSnap.data().competences || [];
    let changed = false;
    const updated = comps.map(c => {
      if (c.nom === oldName) { changed = true; return { ...c, nom: newName, ...skillData }; }
      return c;
    });
    if (changed) promises.push(updateDoc(doc(db,'joueurs',docSnap.id), { competences: updated }));
  });
  await Promise.all(promises);
}

async function deleteSkill(skillId, skillName) {
  const snapshot = await getDocs(collection(db,'joueurs'));
  let usedBy = null;
  snapshot.forEach(docSnap => {
    if ((docSnap.data().competences||[]).find(c => c.nom === skillName)) usedBy = docSnap.data().nom;
  });
  if (usedBy) { alert(`Impossible de supprimer "${skillName}" : utilisée par ${usedBy}.`); return; }
  if (!confirm(`Êtes-vous sûr de vouloir supprimer "${skillName}" ?`)) return;
  try {
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(doc(db,'skills',skillId));
    allSkills = allSkills.filter(s => s.id !== skillId);
    renderSkills(document.getElementById('skills-search')?.value||'', document.getElementById('skills-filter-class')?.value||'');
  } catch(err) { console.error(err); alert('Erreur suppression.'); }
}


// =====================
// STATUTS MJ
// =====================
let editingStatutId = null;

async function chargerStatutsMJ() {
  renderStatutsMJ();
  initModalStatut();
  document.getElementById('statuts-search')?.addEventListener('input', e =>
    renderStatutsMJ(e.target.value, document.getElementById('statuts-filter-type')?.value||''));
  document.getElementById('statuts-filter-type')?.addEventListener('change', e =>
    renderStatutsMJ(document.getElementById('statuts-search')?.value||'', e.target.value));
}

function initStatutsMJ() {
  // Appelé dans init() pour attacher les listeners de l'onglet
}

function renderStatutsMJ(filter='', typeFilter='') {
  const tbody = document.getElementById('statuts-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const filtered = statutsCacheMJ.filter(s => {
    const matchNom  = s.nom.toLowerCase().includes(filter.toLowerCase());
    const matchType = typeFilter ? s.type === typeFilter : true;
    return matchNom && matchType;
  });
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem;font-style:italic;color:var(--text-dim)">Aucun statut.</td></tr>';
    return;
  }
  filtered.forEach(statut => {
    const tr = document.createElement('tr');
    const typeLabel = statut.type === 'pos' ? '✦ Positif' : statut.type === 'neg' ? '✦ Négatif' : statut.type;
    const typeColor = statut.type === 'pos' ? '#2ecc71' : statut.type === 'neg' ? '#e74c3c' : '#3498db';
    tr.innerHTML = `
      <td>${statut.nom}</td>
      <td style="font-style:italic;color:var(--text-dim);white-space:normal;word-break:break-word">${statut.desc||''}</td>
      <td style="color:${typeColor};font-family:'Cinzel',serif;font-size:0.75rem">${typeLabel}</td>
      <td><button class="item-edit-btn" data-id="${statut.id}">✏️</button></td>
      <td><button class="item-del-btn" data-id="${statut.id}" data-nom="${statut.nom}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.item-edit-btn').forEach(btn => btn.addEventListener('click', () => openStatutModal(btn.dataset.id)));
  tbody.querySelectorAll('.item-del-btn').forEach(btn => btn.addEventListener('click', () => deleteStatut(btn.dataset.id, btn.dataset.nom)));
}

function openStatutModal(id=null) {
  const modal = document.getElementById('modal-statut');
  editingStatutId = id;
  document.getElementById('modal-statut-title').textContent = id ? 'Modifier le statut' : 'Nouveau statut';
  if (id) {
    const s = statutsCacheMJ.find(s => s.id === id);
    if (!s) return;
    document.getElementById('statut-nom-input').value   = s.nom;
    document.getElementById('statut-desc-input').value  = s.desc  || '';
    document.getElementById('statut-type-input').value  = s.type  || 'pos';
  } else {
    document.getElementById('statut-nom-input').value   = '';
    document.getElementById('statut-desc-input').value  = '';
    document.getElementById('statut-type-input').value  = 'pos';
  }
  modal.classList.remove('hidden');
}

function initModalStatut() {
  document.getElementById('btn-new-statut')?.addEventListener('click', () => openStatutModal(null));
  document.getElementById('statut-cancel')?.addEventListener('click', () => document.getElementById('modal-statut').classList.add('hidden'));
  document.getElementById('statut-confirm')?.addEventListener('click', async () => {
    const nom  = document.getElementById('statut-nom-input').value.trim();
    if (!nom) { alert('Nom requis.'); return; }
    const oldNom = editingStatutId ? statutsCacheMJ.find(s => s.id === editingStatutId)?.nom : null;
    const data = {
      nom,
      desc: document.getElementById('statut-desc-input').value.trim(),
      type: document.getElementById('statut-type-input').value,
    };
    try {
      if (editingStatutId) {
        await updateDoc(doc(db,'statuts',editingStatutId), data);
        const idx = statutsCacheMJ.findIndex(s => s.id === editingStatutId);
        if (idx !== -1) statutsCacheMJ[idx] = { id: editingStatutId, ...data };
        if (oldNom && oldNom !== nom) await renameStatutInJoueurs(oldNom, nom, data);
      } else {
        const newId = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') + '_' + Date.now();
        await setDoc(doc(db,'statuts',newId), data);
        statutsCacheMJ.push({ id: newId, ...data });
        statutsCacheMJ.sort((a,b) => a.nom.localeCompare(b.nom));
      }
      document.getElementById('modal-statut').classList.add('hidden');
      renderStatutsMJ(document.getElementById('statuts-search')?.value||'', document.getElementById('statuts-filter-type')?.value||'');
    } catch(err) { console.error(err); alert('Erreur sauvegarde.'); }
  });
}

async function propagateStatutToJoueurs(statut) {
  const snapshot = await getDocs(collection(db,'joueurs'));
  const promises = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const stats = data.statuts || [];
    let changed = false;
    const updated = stats.map(s => {
      if (s.nom === statut.nom) {
        changed = true;
        return { ...s, desc: statut.desc||'', type: statut.type||'' };
      }
      return s;
    });
    if (changed) promises.push(updateDoc(doc(db,'joueurs',docSnap.id), { statuts: updated }));
  });
  await Promise.all(promises);
}

async function renameStatutInJoueurs(oldNom, newNom, data) {
  const snapshot = await getDocs(collection(db,'joueurs'));
  const promises = [];
  snapshot.forEach(docSnap => {
    const stats = docSnap.data().statuts || [];
    let changed = false;
    const updated = stats.map(s => {
      if (s.nom === oldNom) { changed = true; return { ...s, nom: newNom, desc: data.desc||'', type: data.type||'' }; }
      return s;
    });
    if (changed) promises.push(updateDoc(doc(db,'joueurs',docSnap.id), { statuts: updated }));
  });
  await Promise.all(promises);
}

async function deleteStatut(id, nom) {
  // Vérifier si utilisé par un joueur
  const snapshot = await getDocs(collection(db,'joueurs'));
  let usedBy = null;
  snapshot.forEach(docSnap => {
    if ((docSnap.data().statuts||[]).find(s => s.nom === nom)) usedBy = docSnap.data().nom;
  });
  if (usedBy) { alert(`Impossible de supprimer "${nom}" : utilisé par ${usedBy}.`); return; }
  if (!confirm(`Êtes-vous sûr de vouloir supprimer "${nom}" ?`)) return;
  try {
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await deleteDoc(doc(db,'statuts',id));
    statutsCacheMJ = statutsCacheMJ.filter(s => s.id !== id);
    renderStatutsMJ(document.getElementById('statuts-search')?.value||'', document.getElementById('statuts-filter-type')?.value||'');
  } catch(err) { console.error(err); alert('Erreur suppression.'); }
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
// APERÇU
// =====================
function renderApercu() {
  const grid = document.getElementById('apercu-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const SLOTS_LABELS = {
    main1Item:'Main 1', main2Item:'Main 2', helmetItem:'Casque',
    armorItem:'Armure', bootsItem:'Bottes', glovesItem:'Gants', jewelItem:'Bijou'
  };
  const STATS = ['ATK','DEF','MAG','RESI','AGI'];
  const STAT_MAP = {ATK:'atk',DEF:'def',MAG:'mag',RESI:'res',AGI:'agi'};

  const joueurs = Object.values(joueursData).filter(d => !joueursHidden.has(d.id));
  if (!joueurs.length) {
    grid.innerHTML = '<p class="placeholder-text" style="padding:1rem">Aucun joueur connecte.</p>';
    return;
  }

  joueurs.forEach(data => {
    const card = document.createElement('div');
    card.className = 'apercu-card';

    // Header
    const header = document.createElement('div');
    header.className = 'apercu-header';
    const nomEl = document.createElement('div'); nomEl.className='apercu-nom'; nomEl.textContent=data.nom||'—';
    const subEl = document.createElement('div'); subEl.className='apercu-sub'; subEl.textContent=[data.race,data.classe].filter(Boolean).join(' / ')||'—';
    const hideBtn = document.createElement('button'); hideBtn.className='combattant-delete'; hideBtn.textContent='✕';
    hideBtn.addEventListener('click',()=>{ joueursHidden.add(data.id); renderApercu(); });
    header.appendChild(nomEl); header.appendChild(subEl); header.appendChild(hideBtn);
    card.appendChild(header);

    // PV/PM
    const pvpm = document.createElement('div'); pvpm.className='apercu-pvpm';
    pvpm.innerHTML=`<span class="apercu-bar apercu-bar--hp">PV ${data.hpCurrent||0}/${data.hpMax||0}</span><span class="apercu-bar apercu-bar--mp">PM ${data.mpCurrent||0}/${data.mpMax||0}</span>`;
    card.appendChild(pvpm);

    // Stats
    const statsEl = document.createElement('div'); statsEl.className='apercu-stats';
    STATS.forEach(stat => {
      const flat=parseFloat(data[`flat${stat}`]||0), bonus=parseFloat(data[`bonus${stat}`]||0), percent=parseFloat(data[`percent${stat}`]||0);
      const key=STAT_MAP[stat];
      let equip=0;
      ['main1Item','main2Item','helmetItem','armorItem','bootsItem','glovesItem','jewelItem'].forEach(s=>{if(data[s]&&data[s][key])equip+=parseInt(data[s][key])||0;});
      const total=Math.round((flat+equip+bonus)*(1+percent/100));
      const badge=document.createElement('span'); badge.className='apercu-stat-badge'; badge.textContent=`${stat} ${flat}/${total}`;
      statsEl.appendChild(badge);
    });
    card.appendChild(statsEl);

    // Statuts — nom + desc + avancement
    const statuts=data.statuts||[];
    if(statuts.length){
      const statutsEl=document.createElement('div'); statutsEl.className='apercu-statuts';
      statuts.forEach(s=>{
        if(!s.nom)return;
        const checked=(s.checks||[]).filter(Boolean).length;
        const tag=document.createElement('div'); tag.className='apercu-statut-row';
        const nomEl=document.createElement('span'); nomEl.className='apercu-statut-nom'; nomEl.textContent=s.nom+(checked>0?` (${checked}/5)`:'');
        tag.appendChild(nomEl);
        const descText = s.desc || (statutsCacheMJ.find(sc=>sc.nom===s.nom)?.desc) || '';
        if(descText){const descEl=document.createElement('div');descEl.className='apercu-statut-desc';descEl.textContent=descText;tag.appendChild(descEl);}
        // Couleur selon type
        const sType = s.type || (statutsCacheMJ.find(sc=>sc.nom===s.nom)?.type) || '';
        const sClass = sType==='pos' ? 'apercu-statut-row--pos' : sType==='neg' ? 'apercu-statut-row--neg' : sType ? 'apercu-statut-row--oth' : '';
        if(sClass) tag.classList.add(sClass);
        statutsEl.appendChild(tag);
      });
      card.appendChild(statutsEl);
    }

    // Equipements
    const equipEl=document.createElement('div'); equipEl.className='apercu-equip';
    Object.entries(SLOTS_LABELS).forEach(([key,label])=>{
      const item=data[key]; const row=document.createElement('div'); row.className='apercu-equip-row';
      row.innerHTML=`<span class="apercu-equip-slot">${label}</span><span class="apercu-equip-name">${item?.name||'—'}</span>`;
      equipEl.appendChild(row);
    });
    card.appendChild(equipEl);

    // Gils / KC
    const gilsEl=document.createElement('div'); gilsEl.className='apercu-gils';
    gilsEl.innerHTML=`<span>Gils : <strong>${data.gils||0}</strong></span><span>KC : <strong>${data.killCount||0}</strong></span>`;
    card.appendChild(gilsEl);

    // Competences
    const comps=data.competences||[];
    if(comps.length){
      const compsEl=document.createElement('div'); compsEl.className='apercu-comps';
      const title=document.createElement('div'); title.className='apercu-section-title'; title.textContent='Competences';
      compsEl.appendChild(title);
      comps.forEach(c=>{
        if(!c.nom)return;
        const row=document.createElement('div'); row.className='apercu-comp-row';
        const maitrise=(c.pc>0&&c.maitrise&&parseInt(c.maitrise)<c.pc)?` — ${c.maitrise}/${c.pc}`:'';
        row.textContent=`${c.nom}${maitrise}`;
        compsEl.appendChild(row);
      });
      card.appendChild(compsEl);
    }

    grid.appendChild(card);
  });
}

async function initApercu() {}

// =====================
// GENERATEUR
// =====================
function randBetween(min, max) { return min + Math.random() * (max - min); }

function calcStatMonster(base, growth, level) {
  return Math.round(base + growth * level * (randBetween(100, 120) / 100));
}

function calcStatHuman(growth, level, statType) {
  if (statType === 'PV') return Math.round(20 + growth * 6 * (1 + (20 * Math.random()) / 100));
  if (statType === 'PM') return Math.round(5  + growth * 2 * (1 + (20 * Math.random()) / 100));
  return Math.round(10 + growth * 4 * (1 + (20 * Math.random()) / 100));
}

function calcExp(m, level) {
  const baseExp   = ((m.baseAtk+m.baseDef+m.baseMag+m.baseRes+m.baseAgi)/2 + m.basePV/3 + m.basePM) / 2;
  const growthExp = ((m.growthAtk+m.growthDef+m.growthMag+m.growthRes+m.growthAgi)/2 + m.growthPV/3 + m.growthPM) / 2;
  return Math.round(baseExp + growthExp * level * (randBetween(150, 200) / 100));
}

async function initGenerateur() {
  // Charger races
  if (!Object.keys(racesDataMJ).length) {
    const snap = await getDocs(collection(db,'races'));
    snap.forEach(d => { racesDataMJ[d.id] = d.data(); });
  }

  // Charger types de monstres pour le dropdown
  const typeSelect = document.getElementById('gen-type');
  try {
    const monstersSnap = await getDocs(collection(db,'monsters'));
    const monsterNames = [];
    monstersSnap.forEach(d => {
      const data = d.data();
      monstreTypes[d.id] = data;
      if (data.monster) monsterNames.push(data.monster);
    });
    monsterNames.sort((a,b) => a.localeCompare(b));
    if (!monsterNames.length) {
      console.warn('Aucun monstre trouvé dans Firebase. Avez-vous lancé import-monsters.html ?');
    }
    monsterNames.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      typeSelect.appendChild(opt);
    });
    console.log(`Générateur : ${monsterNames.length} types de monstres chargés.`);
  } catch(err) {
    console.error('Erreur chargement monstres:', err);
  }

  const humanFields = document.getElementById('gen-humanoid-fields');
  const genBtn      = document.getElementById('gen-btn');

  typeSelect.addEventListener('change', () => {
    const isHuman = typeSelect.value === 'personnage';
    humanFields.style.display = isHuman ? 'block' : 'none';
    genBtn.disabled = !typeSelect.value;
  });

  buildGenRaceDropdown();
  genBtn.addEventListener('click', genererMonstre);
  document.getElementById('gen-add-skill').addEventListener('click', showGenSkillDropdown);
  document.getElementById('gen-add-ally').addEventListener('click',  () => addGenToCombat('ally'));
  document.getElementById('gen-add-enemy').addEventListener('click', () => addGenToCombat('enemy'));
}

function buildGenRaceDropdown() {
  const input=document.getElementById('gen-race-input'), dropdown=document.getElementById('gen-race-dropdown');
  function renderDD(filter){ dropdown.innerHTML=''; Object.values(racesDataMJ).filter(r=>r.nom.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>a.nom.localeCompare(b.nom)).forEach(race=>{ const opt=document.createElement('div'); opt.className='equip-option'; opt.textContent=race.nom; opt.addEventListener('mousedown',()=>{ input.value=race.nom; dropdown.classList.add('hidden'); buildGenClasseDropdown(race); }); dropdown.appendChild(opt); }); }
  function posDD(){ const rect=input.getBoundingClientRect(); dropdown.style.cssText=`position:fixed;top:${rect.bottom+2}px;left:${rect.left}px;width:${Math.max(rect.width,160)}px;z-index:9999;max-height:${Math.min(220,window.innerHeight-rect.bottom-8)}px`; }
  input.addEventListener('focus',()=>{ renderDD(input.value); posDD(); dropdown.classList.remove('hidden'); });
  input.addEventListener('input',()=>{ renderDD(input.value); posDD(); });
  input.addEventListener('blur', ()=>setTimeout(()=>dropdown.classList.add('hidden'),150));
}

function buildGenClasseDropdown(race) {
  const input=document.getElementById('gen-classe-input'), dropdown=document.getElementById('gen-classe-dropdown');
  const newInput=input.cloneNode(true); input.parentNode.replaceChild(newInput,input); newInput.value='';
  function renderDD(filter){ dropdown.innerHTML=''; (race.classes||[]).filter(c=>c.nom.toLowerCase().includes(filter.toLowerCase())).forEach(cls=>{ const opt=document.createElement('div'); opt.className='equip-option'; opt.textContent=`${cls.nom} (${cls.abr})`; opt.addEventListener('mousedown',()=>{ newInput.value=cls.nom; dropdown.classList.add('hidden'); }); dropdown.appendChild(opt); }); }
  function posDD(){ const rect=newInput.getBoundingClientRect(); dropdown.style.cssText=`position:fixed;top:${rect.bottom+2}px;left:${rect.left}px;width:${Math.max(rect.width,160)}px;z-index:9999;max-height:${Math.min(220,window.innerHeight-rect.bottom-8)}px`; }
  newInput.addEventListener('focus',()=>{ renderDD(newInput.value); posDD(); dropdown.classList.remove('hidden'); });
  newInput.addEventListener('input',()=>{ renderDD(newInput.value); posDD(); });
  newInput.addEventListener('blur', ()=>setTimeout(()=>dropdown.classList.add('hidden'),150));
}

async function genererMonstre() {
  const typeVal = document.getElementById('gen-type').value;
  const level   = parseInt(document.getElementById('gen-level').value) || 1;
  const name    = document.getElementById('gen-name').value.trim() || typeVal;
  const isHuman = typeVal === 'personnage';
  let monsterData = null, subLabel = '', availableSkills = [];

  if (isHuman) {
    const raceRaw   = document.getElementById('gen-race-input').value;
    const classeRaw = document.getElementById('gen-classe-input')?.value || '';
    // Normaliser en minuscules pour correspondre aux données Firebase
    const race   = raceRaw.toLowerCase();
    const classe = classeRaw.toLowerCase();
    subLabel = [raceRaw, classeRaw].filter(Boolean).join(' / ');
    const snap = await getDocs(query(collection(db,'enemy_classes'), where('race','==',race), where('classe','==',classe)));
    if (snap.empty) { alert(`Aucune donnee pour ${subLabel}.`); return; }
    snap.forEach(d => { monsterData = d.data(); });
    // Calculer les baseStat depuis growth
    // basePV  = 20 + growth*6  * RAND(1.2,1.5)
    // basePM  = 5  + growth*2  * RAND(1.2,1.5)
    // baseStat= 10 + growth*4  * RAND(1.2,1.5)
    function humanBase(fixed, growth, ratio) {
      const mult = 1.2 + Math.random() * 0.3;
      return Math.round(fixed + growth * ratio * mult);
    }
    monsterData = {
      ...monsterData,
      basePV:  humanBase(20, monsterData.growthPV,  6),
      basePM:  humanBase(5,  monsterData.growthPM,  2),
      baseAtk: humanBase(10, monsterData.growthAtk, 4),
      baseDef: humanBase(10, monsterData.growthDef, 4),
      baseMag: humanBase(10, monsterData.growthMag, 4),
      baseRes: humanBase(10, monsterData.growthRes, 4),
      baseAgi: humanBase(10, monsterData.growthAgi, 4),
    };
    // Récupérer toutes les classes de la race pour filtrer les skills
    const raceObj = Object.values(racesDataMJ).find(r => r.nom.toLowerCase() === race);
    const raceClasseNoms = raceObj ? raceObj.classes.map(c => c.nom.toLowerCase()) : [classe];
    const raceClasseMap  = {};
    if (raceObj) raceObj.classes.forEach(c => { raceClasseMap[c.nom.toLowerCase()] = c.abr; });

    const skillsSnap = await getDocs(collection(db,'skills'));
    skillsSnap.forEach(d => {
      const s = d.data();
      const parts = (s.classes||'').split(' / ').map(p => p.trim().toLowerCase());
      // Inclure si au moins une classe de la race peut l'apprendre, ou si Special
      if (parts.includes('special') || parts.some(p => raceClasseNoms.includes(p))) {
        // Construire le label avec les abréviations des classes de la race
        const abrs = parts.filter(p => raceClasseMap[p]).map(p => raceClasseMap[p]);
        const label = abrs.length ? `${s.name} (${abrs.join(' / ')})` : s.name;
        availableSkills.push({ id: d.id, ...s, label });
      }
    });
    availableSkills.sort((a,b) => a.name.localeCompare(b.name));
  } else {
    const monsterEntry = Object.values(monstreTypes).find(m => m.monster === typeVal);
    if (!monsterEntry) { alert(`Monstre "${typeVal}" introuvable.`); return; }
    monsterData = monsterEntry;
    subLabel    = typeVal;
    const skillsSnap = await getDocs(collection(db,'skills'));
    skillsSnap.forEach(d => { const s=d.data(); if((s.classes||'').includes(typeVal)) availableSkills.push({id:d.id,...s}); });
  }

  // total = base + growth * level * RAND(1.2,1.5) pour personnages
  // total = base + growth * level * RAND(1.0,1.2) pour monstres
  function calcFinalStat(base, growth, lvl, human) {
    const minR = human ? 1.2 : 1.0;
    const maxR = human ? 1.5 : 1.2;
    const mult = minR + Math.random() * (maxR - minR);
    return Math.round(base + growth * lvl * mult);
  }
  const pv  = calcFinalStat(monsterData.basePV,  monsterData.growthPV,  level, isHuman);
  const pm  = calcFinalStat(monsterData.basePM,  monsterData.growthPM,  level, isHuman);
  const atk = calcFinalStat(monsterData.baseAtk, monsterData.growthAtk, level, isHuman);
  const def = calcFinalStat(monsterData.baseDef, monsterData.growthDef, level, isHuman);
  const mag = calcFinalStat(monsterData.baseMag, monsterData.growthMag, level, isHuman);
  const res = calcFinalStat(monsterData.baseRes, monsterData.growthRes, level, isHuman);
  const agi = calcFinalStat(monsterData.baseAgi, monsterData.growthAgi, level, isHuman);
  const exp = calcExp({...monsterData, baseAtk:monsterData.baseAtk||atk, baseDef:monsterData.baseDef||def, baseMag:monsterData.baseMag||mag, baseRes:monsterData.baseRes||res, baseAgi:monsterData.baseAgi||agi, basePV:monsterData.basePV||pv, basePM:monsterData.basePM||pm}, level);

  genCurrentMonster = { name, subLabel, typeVal, level, pv, pm, atk, def, mag, res, agi, exp, availableSkills };
  genSkills = [];

  document.getElementById('gen-result').classList.remove('hidden');
  document.getElementById('gen-result-name').textContent  = name;
  document.getElementById('gen-result-sub').textContent   = subLabel;
  document.getElementById('gen-result-level').textContent = level;
  ['pv','pm','atk','def','mag','res','agi'].forEach(k => document.getElementById(`gen-${k}`).value = eval(k));
  document.getElementById('gen-exp').textContent = exp;
  document.getElementById('gen-skills-list').innerHTML = '';
}

function showGenSkillDropdown() {
  if(!genCurrentMonster) return;
  const list=document.getElementById('gen-skills-list');
  const wrapper=document.createElement('div'); wrapper.style.position='relative';
  const input=document.createElement('input'); input.className='calc-input'; input.type='text'; input.placeholder='Rechercher...';
  const dropdown=document.createElement('div'); dropdown.className='equip-dropdown';
  function renderDD(filter){ dropdown.innerHTML=''; genCurrentMonster.availableSkills.filter(s=>(s.label||s.name).toLowerCase().includes(filter.toLowerCase())&&!genSkills.find(g=>g.name===s.name)).forEach(skill=>{ const opt=document.createElement('div'); opt.className='equip-option'; opt.textContent=skill.label||skill.name; opt.addEventListener('mousedown',()=>{ genSkills.push(skill); wrapper.remove(); renderGenSkills(); }); dropdown.appendChild(opt); }); }
  function posDD(){ const rect=input.getBoundingClientRect(); dropdown.style.cssText=`position:fixed;top:${rect.bottom+2}px;left:${rect.left}px;width:${Math.max(rect.width,200)}px;z-index:9999;max-height:${Math.min(220,window.innerHeight-rect.bottom-8)}px`; }
  input.addEventListener('focus',()=>{ renderDD(''); posDD(); });
  input.addEventListener('input',()=>{ renderDD(input.value); posDD(); });
  input.addEventListener('blur', ()=>setTimeout(()=>{ dropdown.remove(); wrapper.remove(); },200));
  wrapper.appendChild(input); wrapper.appendChild(dropdown); list.appendChild(wrapper); input.focus();
}

function renderGenSkills() {
  const list=document.getElementById('gen-skills-list'); list.innerHTML='';
  genSkills.forEach((skill,i)=>{
    const row=document.createElement('div'); row.className='gen-skill-row gen-skill-row--full';
    const header=document.createElement('div'); header.className='gen-skill-header';
    header.innerHTML=`<span class="gen-skill-name">${skill.name}</span><span class="gen-skill-range">${skill.range||''}</span>`;
    const delBtn=document.createElement('button'); delBtn.className='combattant-delete'; delBtn.textContent='✕';
    delBtn.addEventListener('click',()=>{ genSkills.splice(i,1); renderGenSkills(); });
    header.appendChild(delBtn);
    row.appendChild(header);
    if(skill.desc){
      const desc=document.createElement('div'); desc.className='gen-skill-desc'; desc.textContent=skill.desc;
      row.appendChild(desc);
    }
    list.appendChild(row);
  });
}

function addGenToCombat(kind) {
  if(!genCurrentMonster) return;
  const pv  = parseInt(document.getElementById('gen-pv').value)  || genCurrentMonster.pv;
  const agi = parseInt(document.getElementById('gen-agi').value) || genCurrentMonster.agi;
  const atk = parseInt(document.getElementById('gen-atk').value) || genCurrentMonster.atk;
  const def = parseInt(document.getElementById('gen-def').value) || genCurrentMonster.def;
  const mag = parseInt(document.getElementById('gen-mag').value) || genCurrentMonster.mag;
  const res = parseInt(document.getElementById('gen-res').value) || genCurrentMonster.res;
  const exp = genCurrentMonster.exp || 0;

  ennemis.push({
    id: `${kind}_${Date.now()}`,
    type: kind,
    nom: genCurrentMonster.name,
    hpMax: pv, hpCurrent: pv,
    agi, atk, def, mag, res, exp,
    statuts: [], hpHistory: [],
    combatSkills: genSkills.map(s => ({ nom: s.name, desc: s.desc||'', actif: false })),
  });
  renderInitiative();

  // Message de confirmation
  const msgEl = document.getElementById('gen-added-msg');
  const kindLabel = kind === 'ally' ? 'allié' : 'ennemi';
  msgEl.textContent = `✓ ${genCurrentMonster.name} ajouté en tant qu'${kindLabel}.`;
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 3000);
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
    renderApercu();
  });

  // Charger statuts
  const statutsSnap = await getDocs(collection(db,'statuts'));
  statutsCacheMJ = [];
  statutsSnap.forEach(d => statutsCacheMJ.push({ id: d.id, ...d.data() }));
  statutsCacheMJ.sort((a,b) => a.nom.localeCompare(b.nom));

  // onSnapshot statuts — propagation vers joueurs
  onSnapshot(collection(db,'statuts'), snapshot => {
    snapshot.docChanges().forEach(change => {
      const updated = { id: change.doc.id, ...change.doc.data() };
      if (change.type === 'modified') {
        const idx = statutsCacheMJ.findIndex(s => s.id === updated.id);
        if (idx !== -1) statutsCacheMJ[idx] = updated;
        propagateStatutToJoueurs(updated);
      } else if (change.type === 'added') {
        if (!statutsCacheMJ.find(s => s.id === updated.id)) statutsCacheMJ.push(updated);
      } else if (change.type === 'removed') {
        statutsCacheMJ = statutsCacheMJ.filter(s => s.id !== updated.id);
      }
    });
    renderStatutsMJ(
      document.getElementById('statuts-search')?.value || '',
      document.getElementById('statuts-filter-type')?.value || ''
    );
  });

  await chargerStatutsMJ();

  await initApercu();
  initStatutsMJ();
  await chargerSkills();
  await initGenerateur();
}

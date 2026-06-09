import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB73e3kgzwX3R7d8dE1Avwf28V_HVBvGXg",
  authDomain: "jdr-companion.firebaseapp.com",
  projectId: "jdr-companion",
  storageBucket: "jdr-companion.firebasestorage.app",
  messagingSenderId: "728047149353",
  appId: "1:728047149353:web:287b417f875c876c87d738"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Désactiver la molette sur tous les inputs number
document.addEventListener('wheel', () => {
  if (document.activeElement && document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });

// Désactiver la molette sur tous les inputs number
document.addEventListener('wheel', (e) => {
  if (document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });

const isIndexPage = document.getElementById('perso-select') !== null;
const isAppPage   = document.getElementById('perso-nom')    !== null;

// =====================
// PAGE INDEX
// =====================
if (isIndexPage) {
  const select     = document.getElementById('perso-select');
  const enterBtn   = document.getElementById('enter-btn');
  const loadingMsg = document.getElementById('loading-msg');

  async function chargerPersonnages() {
    try {
      const snapshot = await getDocs(collection(db, 'joueurs'));
      loadingMsg.classList.add('hidden');
      snapshot.forEach(docSnap => {
        const data   = docSnap.data();
        const option = document.createElement('option');
        option.value       = docSnap.id;
        option.textContent = data.nom;
        select.appendChild(option);
      });
    } catch (err) {
      loadingMsg.textContent = 'Erreur de connexion.';
      console.error(err);
    }
  }

  select.addEventListener('change', () => { enterBtn.disabled = select.value === ''; });
  enterBtn.addEventListener('click', () => {
    if (select.value) window.location.href = `app.html?id=${select.value}`;
  });
  chargerPersonnages();
}

// =====================
// PAGE APP
// =====================
if (isAppPage) {
  const params  = new URLSearchParams(window.location.search);
  const persoId = params.get('id');
  let docRef;
  const itemsCache  = {};
  let racesCache    = null;  // { id: {nom, classes:[{nom,abr}]} }
  let skillsCache   = [];    // toutes les skills Firebase
  let statutsCache  = [];    // tous les statuts Firebase

  const SLOTS = [
    { key: 'main1Item',  label: 'Main 1',  type: 'main'   },
    { key: 'main2Item',  label: 'Main 2',  type: 'main'   },
    { key: 'helmetItem', label: 'Casque',  type: 'helmet' },
    { key: 'armorItem',  label: 'Armure',  type: 'armor'  },
    { key: 'bootsItem',  label: 'Bottes',  type: 'boots'  },
    { key: 'glovesItem', label: 'Gants',   type: 'gloves' },
    { key: 'jewelItem',  label: 'Bijou',   type: 'jewel'  },
  ];

  const STATS_KEYS = ['ATK','DEF','MAG','RESI','AGI'];
  const STAT_MAP   = { ATK:'atk', DEF:'def', MAG:'mag', RESI:'res', AGI:'agi' };

  const state = {
    hpCurrent:0, hpMax:0, mpCurrent:0, mpMax:0, totalExp:0,
    gils:0, killCount:0, deathCount:0,
    // KC max = 10
    stats: { flat:{}, bonus:{}, percent:{}, equip:{} },
    equip: {},
    competences: [], inventaire: [], statuts: [],
    historique: [],
  };

  // =====================
  // SAUVEGARDE
  // =====================
  async function sauvegarder(champs) {
    try { await updateDoc(docRef, champs); }
    catch (err) { console.error('Erreur sauvegarde:', err); }
  }

  // =====================
  // MODE JOUR / NUIT
  // =====================
  function initTheme() {
    const btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('theme');
    if (saved === 'light') { document.body.classList.add('light-mode'); btn.textContent = '☀️'; }

    btn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      btn.textContent = isLight ? '☀️' : '🌙';
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
  }

  // =====================
  // BOUTON REPEAT (déclenche immédiatement, puis toutes les 250ms)
  // =====================
  function attachRepeat(btn, action) {
    let interval = null;
    function start(e) {
      e.preventDefault();
      action();
      interval = setInterval(action, 250);
    }
    function stop() {
      clearInterval(interval);
      interval = null;
    }
    btn.addEventListener('pointerdown',  start);
    btn.addEventListener('pointerup',    stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel',stop);
  }

  // =====================
  // EFFETS VISUELS
  // =====================
  function flashVignette(color) {
    const el = document.createElement('div');
    el.className = `vignette-flash vignette-flash--${color}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  // Vignette HP critique avec transition douce
  let vignetteEl = null;
  function majTeinte() {
    const pct = state.hpMax > 0 ? state.hpCurrent / state.hpMax : 1;
    const critique = pct > 0 && pct <= 0.25;
    document.body.classList.toggle('hp-critical', critique);
    if (!vignetteEl) {
      vignetteEl = document.createElement('div');
      vignetteEl.className = 'hp-vignette';
      document.body.appendChild(vignetteEl);
    }
    // Transition douce via requestAnimationFrame
    if (critique) {
      requestAnimationFrame(() => vignetteEl.classList.add('active'));
    } else {
      vignetteEl.classList.remove('active');
    }
  }

  // =====================
  // POPUP LEVEL UP
  // =====================
  function showLevelUp(level) {
    const overlay = document.getElementById('levelup-overlay');
    document.getElementById('levelup-level').textContent = `Niveau ${level}`;
    overlay.classList.remove('hidden');
    document.getElementById('levelup-close').onclick = () => overlay.classList.add('hidden');
  }

  // =====================
  // HISTORIQUE PV/PM
  // =====================
  let historiqueDebounceHp = null;
  let historiqueDebouncemp = null;
  let pendingHp = 0;
  let pendingMp = 0;

  function ajouterHistorique(type, delta) {
    if (delta === 0) return;

    if (type === 'hp') {
      pendingHp += delta;
      clearTimeout(historiqueDebounceHp);
      historiqueDebounceHp = setTimeout(() => {
        if (pendingHp === 0) return;
        const entry = {
          type: 'hp',
          delta: pendingHp,
          time: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}),
          after: state.hpCurrent,
          max: state.hpMax,
        };
        state.historique.unshift(entry);
        if (state.historique.length > 10) state.historique.pop();
        pendingHp = 0;
        renderHistorique();
        sauvegarder({ historique: state.historique });
      }, 3000);
    } else {
      pendingMp += delta;
      clearTimeout(historiqueDebouncemp);
      historiqueDebouncemp = setTimeout(() => {
        if (pendingMp === 0) return;
        const entry = {
          type: 'mp',
          delta: pendingMp,
          time: new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}),
          after: state.mpCurrent,
          max: state.mpMax,
        };
        state.historique.unshift(entry);
        if (state.historique.length > 10) state.historique.pop();
        pendingMp = 0;
        renderHistorique();
        sauvegarder({ historique: state.historique });
      }, 3000);
    }
  }

  function renderHistorique() {
    // Séparer HP et MP
    const hpEntries = state.historique.filter(e => e.type === 'hp').slice(0, 5);
    const mpEntries = state.historique.filter(e => e.type === 'mp').slice(0, 5);

    function formatEntries(entries, posClass, negClass) {
      if (!entries.length) return '';
      return entries.map((e, i) => {
        const sign = e.delta > 0 ? '+' : '';
        const cls  = e.delta > 0 ? posClass : negClass;
        const sep  = i < entries.length - 1 ? '<span class="historique-inline-sep"> · </span>' : '';
        return `<span class="historique-inline-entry"><span class="${cls}">${sign}${e.delta}</span></span>${sep}`;
      }).join('');
    }

    const hpEl = document.getElementById('historique-hp');
    const mpEl = document.getElementById('historique-mp');
    if (hpEl) hpEl.innerHTML = formatEntries(hpEntries, 'historique-val--hp-pos', 'historique-val--hp-neg');
    if (mpEl) mpEl.innerHTML = formatEntries(mpEntries, 'historique-val--mp-pos', 'historique-val--mp-neg');
  }

  // =====================
  // XP / NIVEAU
  // =====================
  function getLevel(t) { let lv=1,exp=t,n=100; while(exp>=n){exp-=n;lv++;n=lv*100;} return lv; }
  function getExpForNext(t) { return getLevel(t)*100; }
  function getCurrentExp(t) { let lv=1,exp=t,n=100; while(exp>=n){exp-=n;lv++;n=lv*100;} return exp; }

  function majExp(oldTotal) {
    const total=state.totalExp, lv=getLevel(total), cur=getCurrentExp(total), needed=getExpForNext(total);
    document.getElementById('exp-level').textContent   = lv;
    document.getElementById('exp-current').textContent = cur;
    document.getElementById('exp-needed').textContent  = needed;
    document.getElementById('exp-bar').style.width     = Math.round((cur/needed)*100)+'%';
    document.getElementById('exp-minus').disabled = total<=0;
    if (oldTotal !== undefined && getLevel(oldTotal) < lv) showLevelUp(lv);
  }

  // =====================
  // HP / MP
  // =====================
  function majBarre(type) {
    const cur=state[`${type}Current`], max=state[`${type}Max`];
    const pct=max>0?Math.min(100,Math.round((cur/max)*100)):0;
    document.getElementById(`${type}-bar`).style.width     = pct+'%';
    document.getElementById(`${type}-current`).textContent = cur;
    document.getElementById(`${type}-plus`).disabled  = cur>=max;
    document.getElementById(`${type}-minus`).disabled = cur<=0;
    if (type === 'hp') majTeinte();
  }

  function attachBouton(btnId, type, direction, champ) {
    const btn=document.getElementById(btnId);
    let timer=null, repeatTimer=null, isLong=false;

    function appliquer(montant) {
      if (type === 'exp') {
        const old=state.totalExp;
        state.totalExp=Math.max(0, state.totalExp+montant*direction);
        majExp(old);
        sauvegarder({totalExp:state.totalExp});
      } else {
        const key=`${type}Current`, max=state[`${type}Max`], avant=state[key];
        state[key]=Math.max(0,Math.min(max,state[key]+montant*direction));
        majBarre(type);
        const delta = state[key] - avant;
        if (delta !== 0) {
          if (type === 'hp' && delta < 0) flashVignette('red');
          ajouterHistorique(type, delta);
        }
        sauvegarder({[champ]:state[key]});
      }
    }

    const montantCourt = type === 'exp' ? 5  : 1;
    const montantLong  = type === 'exp' ? 50 : 5;

    function stopRepeat() {
      clearTimeout(timer);
      clearInterval(repeatTimer);
      repeatTimer = null;
      isLong = false;
    }

    btn.addEventListener('click', () => { if (!isLong) appliquer(montantCourt); isLong = false; });

    btn.addEventListener('pointerdown', () => {
      isLong = false;
      timer = setTimeout(() => {
        isLong = true;
        appliquer(montantLong);
        // Répétition toutes les 250ms
        repeatTimer = setInterval(() => appliquer(montantLong), 250);
      }, 500);
    });

    btn.addEventListener('pointerup',    stopRepeat);
    btn.addEventListener('pointerleave', stopRepeat);
    btn.addEventListener('pointercancel',stopRepeat);
  }

  function attachMax(inputId, type, champ) {
    const input=document.getElementById(inputId);
    if(!input) return;
    input.addEventListener('change',()=>{
      const val=Math.max(1,parseInt(input.value)||1);
      input.value=val;
      state[`${type}Max`]=val;
      if(state[`${type}Current`]>val) state[`${type}Current`]=val;
      majBarre(type);
      sauvegarder({[champ]:val,[`${type}Current`]:state[`${type}Current`]});
    });
  }

  // =====================
  // COMPTEURS GILS / KC
  // =====================
  function attachCompteur(minusId, plusId, inputId, champFirestore) {
    const minus = document.getElementById(minusId);
    const plus  = document.getElementById(plusId);
    const input = document.getElementById(inputId);

    function maj(val) {
      const v = Math.max(0, val);
      if (champFirestore === 'killCount') state.killCount = v;
      else if (champFirestore === 'deathCount') state.deathCount = v;
      input.value = v;
      sauvegarder({ [champFirestore]: v });
    }

    function attachBtn(btn, dir) {
      let repeatTimer=null;
      function doChange(){ const cur=parseInt(input.value)||0; maj(cur+dir); }
      function stopRepeat(){ clearInterval(repeatTimer); repeatTimer=null; }

      btn.addEventListener('click', doChange);
      btn.addEventListener('pointerdown',()=>{ repeatTimer=setInterval(doChange,250); });
      btn.addEventListener('pointerup',    stopRepeat);
      btn.addEventListener('pointerleave', stopRepeat);
      btn.addEventListener('pointercancel',stopRepeat);
    }
    attachBtn(minus, -1);
    attachBtn(plus,   1);
    input.addEventListener('change', () => maj(parseInt(input.value)||0));
  }

  // =====================
  // STATUTS
  // =====================
  function initStatuts(data) {
    state.statuts = data.statuts || [];
    renderStatuts();
    document.getElementById('statut-add').addEventListener('click', () => showStatutMenu());
  }

  function renderStatuts() {
    const list = document.getElementById('statuts-list');
    list.innerHTML = '';
    state.statuts.forEach((statut, i) => {
      const item = document.createElement('div');
      // Couleur selon type
      const typeClass = statut.type === 'pos' ? 'statut-item--pos'
                      : statut.type === 'neg' ? 'statut-item--neg'
                      : statut.type           ? 'statut-item--other' : '';
      item.className = `statut-item${typeClass ? ' '+typeClass : ''}`;

      // Nom + desc
      const nomWrap = document.createElement('div');
      nomWrap.className = 'statut-nom-wrap';
      const nomInput = document.createElement('input');
      nomInput.className   = 'statut-nom-input';
      nomInput.type        = 'text';
      nomInput.value       = statut.nom || '';
      nomInput.placeholder = 'Statut...';
      nomInput.addEventListener('blur', () => {
        state.statuts[i].nom = nomInput.value;
        sauvegarder({ statuts: state.statuts });
      });
      nomWrap.appendChild(nomInput);
      if (statut.desc) {
        const descEl = document.createElement('div');
        descEl.className   = 'statut-desc-inline';
        descEl.textContent = statut.desc;
        nomWrap.appendChild(descEl);
      }
      item.appendChild(nomWrap);

      // Cases à cocher : 3 | 2
      const checksGroup = document.createElement('div');
      checksGroup.className = 'statut-checks-group';
      for (let c = 0; c < 5; c++) {
        if (c === 3) { const sep = document.createElement('div'); sep.className = 'statut-sep'; checksGroup.appendChild(sep); }
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'statut-check';
        cb.checked = statut.checks?.[c] || false;
        cb.addEventListener('change', () => {
          if (!state.statuts[i].checks) state.statuts[i].checks = [false,false,false,false,false];
          state.statuts[i].checks[c] = cb.checked;
          sauvegarder({ statuts: state.statuts });
        });
        checksGroup.appendChild(cb);
      }
      item.appendChild(checksGroup);

      const delBtn = document.createElement('button');
      delBtn.className = 'statut-del'; delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        state.statuts.splice(i, 1);
        renderStatuts();
        sauvegarder({ statuts: state.statuts });
      });
      item.appendChild(delBtn);
      list.appendChild(item);
    });
  }

  function addStatut(s) {
    state.statuts.push({
      nom:    s.nom    || '',
      desc:   s.desc   || '',
      type:   s.type   || '',
      checks: [false,false,false,false,false]
    });
    renderStatuts();
    sauvegarder({ statuts: state.statuts });
  }

  function showStatutMenu() {
    const old = document.getElementById('statut-menu-popup');
    if (old) { old.remove(); return; }
    const anchor = document.getElementById('statut-add');
    const menu = document.createElement('div');
    menu.id = 'statut-menu-popup';
    menu.className = 'statut-menu-popup';

    const opts = [
      { label: '✏️ Manuel',           action: () => { addStatut({}); menu.remove(); } },
      { label: '✦ Positif aléatoire', cls: 'statut-menu-btn--pos', action: () => {
        const pool = statutsCache.filter(s => s.type === 'pos');
        if (pool.length) addStatut(pool[Math.floor(Math.random()*pool.length)]);
        menu.remove();
      }},
      { label: '✦ Négatif aléatoire', cls: 'statut-menu-btn--neg', action: () => {
        const pool = statutsCache.filter(s => s.type === 'neg');
        if (pool.length) addStatut(pool[Math.floor(Math.random()*pool.length)]);
        menu.remove();
      }},
      { label: '📋 Depuis la liste',  action: () => { menu.remove(); showStatutListe(); } },
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

  function showStatutListe() {
    const overlay = document.createElement('div');
    overlay.className = 'statut-liste-overlay';
    const box = document.createElement('div');
    box.className = 'statut-liste-box';

    const title = document.createElement('div');
    title.className = 'statut-liste-title'; title.textContent = 'Choisir un statut';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'statut-liste-close'; closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());

    const searchInp = document.createElement('input');
    searchInp.className = 'statut-liste-search'; searchInp.type = 'text'; searchInp.placeholder = 'Rechercher...';

    const items = document.createElement('div');
    items.className = 'statut-liste-items';

    function renderListe(filter) {
      items.innerHTML = '';
      statutsCache.filter(s => s.nom.toLowerCase().includes(filter.toLowerCase())).forEach(s => {
        const row = document.createElement('div');
        row.className = `statut-liste-row statut-liste-row--${s.type}`;
        row.innerHTML = `<span class="statut-liste-nom">${s.nom}</span><span class="statut-liste-desc">${s.desc||''}</span>`;
        row.addEventListener('click', () => { addStatut(s); overlay.remove(); });
        items.appendChild(row);
      });
    }

    searchInp.addEventListener('input', () => renderListe(searchInp.value));
    renderListe('');

    box.appendChild(title); box.appendChild(closeBtn);
    box.appendChild(searchInp); box.appendChild(items);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    searchInp.focus();
  }

  // =====================
  // RACE / CLASSE DROPDOWNS
  // =====================
  function buildRaceDropdown(currentRace, currentClasse) {
    const raceInput    = document.getElementById('perso-race');
    const classeInput  = document.getElementById('perso-classe');
    const raceDropdown = document.getElementById('race-dropdown');
    const classeDropdown = document.getElementById('classe-dropdown');

    // Remplir race dropdown
    function renderRaceDropdown(filter) {
      raceDropdown.innerHTML = '';
      const races = Object.values(racesCache)
        .filter(r => r.nom.toLowerCase().includes(filter.toLowerCase()))
        .sort((a,b) => a.nom.localeCompare(b.nom));
      races.forEach(race => {
        const opt = document.createElement('div');
        opt.className = 'equip-option';
        opt.textContent = race.nom;
        opt.addEventListener('mousedown', () => {
          raceInput.value = race.nom;
          raceDropdown.classList.add('hidden');
          sauvegarder({ race: race.nom, classe: '' });
          classeInput.value = '';
          buildClasseDropdown(race, '');
        });
        raceDropdown.appendChild(opt);
      });
    }

    function positionRaceDropdown() {
      const rect = raceInput.getBoundingClientRect();
      raceDropdown.style.position  = 'fixed';
      raceDropdown.style.top       = (rect.bottom + 2) + 'px';
      raceDropdown.style.left      = rect.left + 'px';
      raceDropdown.style.width     = Math.max(rect.width, 160) + 'px';
      raceDropdown.style.zIndex    = '9999';
      raceDropdown.style.maxHeight = Math.min(220, window.innerHeight - rect.bottom - 8) + 'px';
    }

    raceInput.value = currentRace;
    raceInput.addEventListener('focus', () => { renderRaceDropdown(raceInput.value); positionRaceDropdown(); raceDropdown.classList.remove('hidden'); });
    raceInput.addEventListener('input', () => { renderRaceDropdown(raceInput.value); positionRaceDropdown(); });
    raceInput.addEventListener('blur',  () => setTimeout(() => raceDropdown.classList.add('hidden'), 150));
    window.addEventListener('scroll', () => { if (!raceDropdown.classList.contains('hidden')) positionRaceDropdown(); }, { passive: true });

    // Trouver la race courante
    const currentRaceObj = Object.values(racesCache).find(r => r.nom === currentRace) || null;
    buildClasseDropdown(currentRaceObj, currentClasse);
  }

  function buildClasseDropdown(race, currentClasse) {
    const classeDropdown = document.getElementById('classe-dropdown');

    // Toujours récupérer l'input au moment de l'appel (pas de clone)
    function getInput() { return document.getElementById('perso-classe'); }
    getInput().value = currentClasse;

    function renderClasseDropdown(filter) {
      classeDropdown.innerHTML = '';
      const classes = race ? race.classes.filter(c => c.nom.toLowerCase().includes(filter.toLowerCase())) : [];
      if (!classes.length) {
        const empty = document.createElement('div');
        empty.className   = 'equip-option';
        empty.textContent = race ? 'Aucune classe trouvée' : 'Sélectionnez une race';
        empty.style.color = 'var(--text-dim)';
        classeDropdown.appendChild(empty);
        return;
      }
      classes.forEach(cls => {
        const opt = document.createElement('div');
        opt.className   = 'equip-option';
        opt.textContent = `${cls.nom} (${cls.abr})`;
        opt.addEventListener('mousedown', () => {
          getInput().value = cls.nom;
          classeDropdown.classList.add('hidden');
          sauvegarder({ classe: cls.nom });
          renderCompetences();
        });
        classeDropdown.appendChild(opt);
      });
    }

    function positionClasseDropdown() {
      const input = getInput();
      const rect  = input.getBoundingClientRect();
      classeDropdown.style.position  = 'fixed';
      classeDropdown.style.top       = (rect.bottom + 2) + 'px';
      classeDropdown.style.left      = rect.left + 'px';
      classeDropdown.style.width     = Math.max(rect.width, 160) + 'px';
      classeDropdown.style.zIndex    = '9999';
      classeDropdown.style.maxHeight = Math.min(220, window.innerHeight - rect.bottom - 8) + 'px';
    }

    // Supprimer anciens listeners sans cloner (on réattache toujours les mêmes)
    const input = getInput();
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.value = currentClasse;

    newInput.addEventListener('focus', () => { renderClasseDropdown(newInput.value); positionClasseDropdown(); classeDropdown.classList.remove('hidden'); });
    newInput.addEventListener('input', () => { renderClasseDropdown(newInput.value); positionClasseDropdown(); });
    newInput.addEventListener('blur',  () => setTimeout(() => classeDropdown.classList.add('hidden'), 150));
    window.addEventListener('scroll', () => { if (!classeDropdown.classList.contains('hidden')) positionClasseDropdown(); }, { passive: true });
  }

  // =====================
  // ITEMS — Firebase
  // =====================
  async function getItemsByType(type) {
    if (itemsCache[type]) return itemsCache[type];
    try {
      const q  = query(collection(db,'items'), where('type','==',type), orderBy('name'));
      const sn = await getDocs(q);
      const list = [];
      sn.forEach(d => list.push({ id:d.id, ...d.data() }));
      itemsCache[type] = list;
      return list;
    } catch(err) { console.error('Erreur items:', err); return []; }
  }

  // =====================
  // TOOLTIP ITEM
  // =====================
  let tooltipEl = null;

  function showItemTooltipStats(item, anchorEl) {
    hideItemTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'item-tooltip';
    const stats = ['atk','def','mag','res','agi'].filter(s => item[s]);
    tooltipEl.innerHTML = `
      <div class="item-tooltip-name">${item.name}</div>
      <div class="item-tooltip-stats">
        ${stats.map(s => `<span>${s.toUpperCase()} <strong>+${item[s]}</strong></span>`).join('')}
      </div>
    `;
    document.body.appendChild(tooltipEl);
    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    let top  = rect.bottom + 6;
    const tw = tooltipEl.offsetWidth || 180;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top  + 'px';
  }

  function showItemTooltip(item, x, y) {
    hideItemTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'item-tooltip';
    tooltipEl.innerHTML = `
      <div class="item-tooltip-name">${item.name}</div>
      <div class="item-tooltip-type">${item.type}</div>
      <div class="item-tooltip-stats">
        ${['atk','def','mag','res','agi'].filter(s=>item[s]).map(s=>`<span>${s.toUpperCase()} <strong>+${item[s]}</strong></span>`).join('')}
      </div>
      ${item.desc && item.desc !== '/' ? `<div class="item-tooltip-desc">${item.desc}</div>` : ''}
    `;
    document.body.appendChild(tooltipEl);
    moveItemTooltip(x, y);
  }

  function moveItemTooltip(x, y) {
    if (!tooltipEl) return;
    const tw=tooltipEl.offsetWidth||220, th=tooltipEl.offsetHeight||100;
    let left=x+14, top=y+14;
    if (left+tw>window.innerWidth-8)  left=x-tw-14;
    if (top+th>window.innerHeight-8)  top=y-th-14;
    tooltipEl.style.left=left+'px'; tooltipEl.style.top=top+'px';
  }

  function hideItemTooltip() {
    if (tooltipEl) { tooltipEl.remove(); tooltipEl=null; }
  }

  // =====================
  // ÉQUIPEMENTS
  // =====================
  function calcEquipStats() {
    STATS_KEYS.forEach(stat => {
      const key=STAT_MAP[stat];
      let total=0;
      SLOTS.forEach(slot => { const item=state.equip[slot.key]; if(item&&item[key]) total+=parseInt(item[key])||0; });
      state.stats.equip[stat]=total;
      const el=document.getElementById(`equip-${stat}`);
      if(el) el.textContent=total;
      majTotal(stat);
    });
  }

  async function buildEquipTable() {
    const tbody=document.getElementById('equip-tbody');
    tbody.innerHTML='';

    for (const slot of SLOTS) {
      const items=await getItemsByType(slot.type);
      const equipped=state.equip[slot.key]||null;
      const tr=document.createElement('tr');

      const tdSlot=document.createElement('td');
      tdSlot.textContent=slot.label; tdSlot.style.whiteSpace='nowrap';
      tr.appendChild(tdSlot);

      const tdItem=document.createElement('td');
      const wrapper=document.createElement('div');
      wrapper.className='equip-search-wrapper';

      const input=document.createElement('input');
      input.className='equip-search-input'; input.type='text';
      input.placeholder='— Rechercher —'; input.value=equipped?equipped.name:'';

      const dropdown=document.createElement('div');
      dropdown.className='equip-dropdown hidden';

      function renderDropdown(filter='') {
        dropdown.innerHTML='';
        const filtered=items.filter(i=>i.name.toLowerCase().includes(filter.toLowerCase()));
        const emptyOpt=document.createElement('div');
        emptyOpt.className='equip-option'; emptyOpt.textContent='— Aucun —';
        emptyOpt.addEventListener('mousedown',()=>selectItem(slot.key,null,input,dropdown,tdDesc,tdStats));
        dropdown.appendChild(emptyOpt);
        filtered.forEach(item=>{
          const opt=document.createElement('div');
          opt.className='equip-option'; opt.textContent=item.name;
          opt.addEventListener('mousedown',()=>selectItem(slot.key,item,input,dropdown,tdDesc,tdStats));
          opt.addEventListener('mouseenter',(e)=>showItemTooltip(item,e.clientX,e.clientY));
          opt.addEventListener('mousemove', (e)=>moveItemTooltip(e.clientX,e.clientY));
          opt.addEventListener('mouseleave',()=>hideItemTooltip());
          let ttTimer=null;
          opt.addEventListener('touchstart',(e)=>{ ttTimer=setTimeout(()=>{ const t=e.touches[0]; showItemTooltip(item,t.clientX,t.clientY); },500); },{passive:true});
          opt.addEventListener('touchend',()=>{clearTimeout(ttTimer);hideItemTooltip();});
          opt.addEventListener('touchmove',()=>{clearTimeout(ttTimer);hideItemTooltip();});
          dropdown.appendChild(opt);
        });
      }

      function positionDropdown() {
        const rect=input.getBoundingClientRect();
        dropdown.style.position='fixed'; dropdown.style.top=(rect.bottom+2)+'px';
        dropdown.style.left=rect.left+'px'; dropdown.style.width=Math.max(rect.width,200)+'px';
        dropdown.style.zIndex='9999';
        dropdown.style.maxHeight=Math.min(220,window.innerHeight-rect.bottom-8)+'px';
      }

      input.addEventListener('mouseenter',()=>{ const eq=state.equip[slot.key]; if(eq) showItemTooltipStats(eq,input); });
      input.addEventListener('mouseleave',()=>hideItemTooltip());
      let inputTtTimer=null;
      input.addEventListener('touchstart',(e)=>{ const eq=state.equip[slot.key]; if(!eq) return; inputTtTimer=setTimeout(()=>{ const t=e.touches[0]; showItemTooltipStats(eq,input,t.clientX,t.clientY); },500); },{passive:true});
      input.addEventListener('touchend',()=>{clearTimeout(inputTtTimer);hideItemTooltip();});
      input.addEventListener('touchmove',()=>{clearTimeout(inputTtTimer);hideItemTooltip();});

      input.addEventListener('focus',()=>{ hideItemTooltip(); renderDropdown(input.value); positionDropdown(); dropdown.classList.remove('hidden'); });
      input.addEventListener('input',()=>{ renderDropdown(input.value); positionDropdown(); });
      input.addEventListener('blur', ()=>{ setTimeout(()=>dropdown.classList.add('hidden'),150); });
      window.addEventListener('scroll',()=>{ if(!dropdown.classList.contains('hidden')) positionDropdown(); },{passive:true});

      wrapper.appendChild(input); wrapper.appendChild(dropdown);
      tdItem.appendChild(wrapper); tr.appendChild(tdItem);

      const tdStats=document.createElement('td'); tdStats.className='equip-stats-cell';
      function renderEquipStats(item) {
        if(!item){tdStats.innerHTML='';return;}
        tdStats.innerHTML=['atk','def','mag','res','agi'].filter(s=>item[s]).map(s=>`<span class="equip-stat-badge">${s.toUpperCase()} +${item[s]}</span>`).join('');
      }
      renderEquipStats(equipped); tr.appendChild(tdStats);

      const tdDesc=document.createElement('td'); tdDesc.className='equip-desc';
      tdDesc.textContent=equipped?equipped.desc:'—'; tr.appendChild(tdDesc);

      tbody.appendChild(tr);
      renderDropdown();
    }
  }

  async function selectItem(slotKey,item,input,dropdown,tdDesc,tdStats) {
    state.equip[slotKey]=item; input.value=item?item.name:''; tdDesc.textContent=item?item.desc:'—';
    if(tdStats){ tdStats.innerHTML=item?['atk','def','mag','res','agi'].filter(s=>item[s]).map(s=>`<span class="equip-stat-badge">${s.toUpperCase()} +${item[s]}</span>`).join(''):'' ; }
    dropdown.classList.add('hidden'); calcEquipStats();
    await sauvegarder({[slotKey]:item||null});
  }

  // =====================
  // COMPARATEUR
  // =====================
  function buildComparateur() {
    const section=document.getElementById('equip-body');
    const div=document.createElement('div'); div.className='comparateur';
    div.innerHTML=`
      <div class="comparateur-title">Comparateur</div>
      <div class="comparateur-row">
        <select class="calc-input comp-slot-select" id="comp-slot-select">
          <option value="">— Slot —</option>
          <option value="main1Item">Main 1</option><option value="main2Item">Main 2</option>
          <option value="helmetItem">Casque</option><option value="armorItem">Armure</option>
          <option value="bootsItem">Bottes</option><option value="glovesItem">Gants</option>
          <option value="jewelItem">Bijou</option>
        </select>
        <div class="equip-search-wrapper" id="comp-item-wrapper">
          <input class="equip-search-input" id="comp-item-input" type="text" placeholder="— Choisir un item —" disabled />
          <div class="equip-dropdown hidden" id="comp-item-dropdown"></div>
        </div>
        <div class="comparateur-result" id="comp-result"><span class="placeholder-text">Sélectionne un slot et un item</span></div>
      </div>`;
    section.appendChild(div);

    const slotSelect=div.querySelector('#comp-slot-select');
    const itemInput=div.querySelector('#comp-item-input');
    const itemDropdown=div.querySelector('#comp-item-dropdown');
    const result=div.querySelector('#comp-result');
    let compItems=[], selectedCompItem=null;

    slotSelect.addEventListener('change',async()=>{
      const slotKey=slotSelect.value; itemInput.value=''; itemInput.disabled=!slotKey;
      selectedCompItem=null; result.innerHTML='<span class="placeholder-text">Sélectionne un item</span>';
      if(!slotKey) return;
      const slot=SLOTS.find(s=>s.key===slotKey);
      compItems=await getItemsByType(slot.type); renderCompDropdown('');
    });

    function renderCompDropdown(filter) {
      itemDropdown.innerHTML='';
      compItems.filter(i=>i.name.toLowerCase().includes(filter.toLowerCase())).forEach(item=>{
        const opt=document.createElement('div'); opt.className='equip-option'; opt.textContent=item.name;
        opt.addEventListener('mousedown',()=>{ selectedCompItem=item; itemInput.value=item.name; itemDropdown.classList.add('hidden'); showComparaison(); });
        opt.addEventListener('mouseenter',(e)=>showItemTooltip(item,e.clientX,e.clientY));
        opt.addEventListener('mousemove', (e)=>moveItemTooltip(e.clientX,e.clientY));
        opt.addEventListener('mouseleave',()=>hideItemTooltip());
        itemDropdown.appendChild(opt);
      });
    }

    function positionCompDropdown() {
      const rect=itemInput.getBoundingClientRect();
      itemDropdown.style.position='fixed'; itemDropdown.style.top=(rect.bottom+2)+'px';
      itemDropdown.style.left=rect.left+'px'; itemDropdown.style.width=Math.max(rect.width,200)+'px';
      itemDropdown.style.zIndex='9999';
      itemDropdown.style.maxHeight=Math.min(220,window.innerHeight-rect.bottom-8)+'px';
    }

    itemInput.addEventListener('focus',()=>{ renderCompDropdown(itemInput.value); positionCompDropdown(); itemDropdown.classList.remove('hidden'); });
    itemInput.addEventListener('input',()=>{ renderCompDropdown(itemInput.value); positionCompDropdown(); });
    itemInput.addEventListener('blur', ()=>setTimeout(()=>itemDropdown.classList.add('hidden'),150));
    window.addEventListener('scroll',()=>{ if(!itemDropdown.classList.contains('hidden')) positionCompDropdown(); },{passive:true});

    function showComparaison() {
      const current=state.equip[slotSelect.value], newItem=selectedCompItem;
      if(!newItem) return;
      const STAT_KEYS=['atk','def','mag','res','agi'];
      const STAT_LABELS={atk:'ATK',def:'DEF',mag:'MAG',res:'RES',agi:'AGI'};
      let statsHtml='';
      STAT_KEYS.forEach(s=>{
        const valOld=parseInt(current?.[s]||0), valNew=parseInt(newItem[s]||0);
        const diff=valNew-valOld;
        if(valNew===0&&diff===0) return;
        const displayVal=!current?(valNew>0?`+${valNew}`:valNew):(diff>=0?`+${diff}`:diff);
        const cls=!current?(valNew>0?'comp-up':valNew<0?'comp-down':'comp-neutral'):(diff>0?'comp-up':diff<0?'comp-down':'comp-neutral');
        if(!current&&valNew===0) return;
        statsHtml+=`<span class="comp-stat ${cls}">${STAT_LABELS[s]} ${displayVal}</span>`;
      });
      const descHtml=newItem.desc&&newItem.desc!=='/'?`<div class="comp-desc">${newItem.desc}</div>`:'';
      result.innerHTML=statsHtml?`<div class="comp-stats-row">${statsHtml}</div>${descHtml}`:`<div class="comp-same">Aucun changement de stats</div>${descHtml}`;
    }
  }

  // =====================
  // STATISTIQUES
  // =====================
  function calcTotal(stat) {
    const f=parseFloat(state.stats.flat[stat]||0), e=parseFloat(state.stats.equip[stat]||0);
    const b=parseFloat(state.stats.bonus[stat]||0), p=parseFloat(state.stats.percent[stat]||0);
    return Math.round((f+e+b)*(1+p/100));
  }

  function majTotal(stat) {
    const val = calcTotal(stat);
    const el  = document.getElementById(`total-${stat}`);
    const elL = document.getElementById(`total-${stat}-left`);
    if(el)  el.textContent  = val;
    if(elL) elL.textContent = val;
  }

  function buildStatsTable() {
    const tbody=document.getElementById('stats-tbody'); tbody.innerHTML='';
    STATS_KEYS.forEach(stat=>{
      const tr=document.createElement('tr');
      const _tot = calcTotal(stat);
      tr.innerHTML=`
        <td class="col-total"><span class="tbl-total" id="total-${stat}-left">${_tot}</span></td>
        <td><strong>${stat}</strong></td>
        <td class="col-base">
          <input class="tbl-input no-spin" id="flat-${stat}" type="number" value="${state.stats.flat[stat]||0}" />
        </td>
        <td><span class="tbl-prefix">+</span><span id="equip-${stat}">${state.stats.equip[stat]||0}</span></td>
        <td>
          <div class="counter-row">
            <button class="counter-btn stat-btn" data-stat="${stat}" data-col="bonus" data-dir="-1">−</button>
            <span class="tbl-prefix">+</span><input class="tbl-input" id="bonus-${stat}" type="number" value="${state.stats.bonus[stat]||0}" />
            <button class="counter-btn stat-btn" data-stat="${stat}" data-col="bonus" data-dir="1">+</button>
          </div>
        </td>
        <td>
          <div class="counter-row">
            <button class="counter-btn stat-btn" data-stat="${stat}" data-col="percent" data-dir="-1">−</button>
            <span class="tbl-prefix">+</span><input class="tbl-input" id="percent-${stat}" type="number" value="${state.stats.percent[stat]||0}" /><span class="tbl-suffix">%</span>
            <button class="counter-btn stat-btn" data-stat="${stat}" data-col="percent" data-dir="1">+</button>
          </div>
        </td>
        <td class="col-total"><span class="tbl-total" id="total-${stat}">${_tot}</span></td>
      `;
      tbody.appendChild(tr);

      // Attacher les boutons +/-
      tr.querySelectorAll('.stat-btn').forEach(btn=>{
        let timer=null, repeatTimer=null, isLong=false;
        const stat=btn.dataset.stat, col=btn.dataset.col, dir=parseInt(btn.dataset.dir);

        function stopRepeat(){ clearTimeout(timer); clearInterval(repeatTimer); repeatTimer=null; isLong=false; }

        btn.addEventListener('click',()=>{ if(!isLong) changeStatBy(stat,col,dir); isLong=false; });
        btn.addEventListener('pointerdown',()=>{
          isLong=false;
          timer=setTimeout(()=>{
            isLong=true;
            changeStatBy(stat,col,dir*5);
            repeatTimer=setInterval(()=>changeStatBy(stat,col,dir*5),250);
          },500);
        });
        btn.addEventListener('pointerup',    stopRepeat);
        btn.addEventListener('pointerleave', stopRepeat);
        btn.addEventListener('pointercancel',stopRepeat);
      });

      // Attacher les inputs directs
      ['flat','bonus','percent'].forEach(col=>{
        document.getElementById(`${col}-${stat}`)?.addEventListener('change',e=>{
          state.stats[col][stat]=parseFloat(e.target.value)||0; majTotal(stat);
          sauvegarder({[`${col}${stat}`]:state.stats[col][stat]});
        });
      });
    });
  }

  function changeStatBy(stat, col, amount) {
    state.stats[col][stat]=(parseFloat(state.stats[col][stat])||0)+amount;
    const input=document.getElementById(`${col}-${stat}`);
    if(input) input.value=state.stats[col][stat];
    majTotal(stat);
    sauvegarder({[`${col}${stat}`]:state.stats[col][stat]});
  }

  // =====================
  // INVENTAIRE
  // =====================
  function renderInventaire() {
    const tbody=document.getElementById('inv-tbody'); tbody.innerHTML='';
    state.inventaire.forEach((item,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>
          <div class="counter-row" style="gap:0.2rem">
            <button class="counter-btn inv-qty-btn" data-i="${i}" data-dir="-1">−</button>
            <input class="comp-input inv-input no-spin" data-i="${i}" data-field="quantite" type="number" min="0" value="${item.quantite||0}" style="width:3ch;text-align:center" />
            <button class="counter-btn inv-qty-btn" data-i="${i}" data-dir="1">+</button>
          </div>
        </td>
        <td><input class="comp-input inv-input" data-i="${i}" data-field="nom" type="text" value="${item.nom||''}" placeholder="Objet" style="width:100%" /></td>
        <td class="td-wrap"><input class="comp-input inv-input" data-i="${i}" data-field="desc" type="text" value="${item.desc||''}" placeholder="Description" style="width:100%" /></td>
        <td><button class="inv-del-btn" data-i="${i}">✕</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.inv-input').forEach(input=>{
      input.addEventListener('blur',()=>{
        const i=parseInt(input.dataset.i);
        state.inventaire[i][input.dataset.field]=input.dataset.field==='quantite'?parseInt(input.value)||1:input.value;
        sauvegarder({inventaire:state.inventaire});
      });
    });
    tbody.querySelectorAll('.inv-qty-btn').forEach(btn=>{
      const i=parseInt(btn.dataset.i), dir=parseInt(btn.dataset.dir);
      btn.addEventListener('click', () => {
        const cur=parseInt(state.inventaire[i].quantite)||0;
        state.inventaire[i].quantite=Math.max(0,cur+dir);
        renderInventaire(); sauvegarder({inventaire:state.inventaire});
      });
    });
    tbody.querySelectorAll('.inv-del-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const i=parseInt(btn.dataset.i), nom=state.inventaire[i].nom||'cet objet';
        if(confirm(`Supprimer "${nom}" ?`)){ state.inventaire.splice(i,1); renderInventaire(); sauvegarder({inventaire:state.inventaire}); }
      });
    });
  }

  // =====================
  // COMPÉTENCES
  // =====================
  // Récupérer les skills disponibles pour la race courante
  function getSkillsForRace() {
    const raceNom = document.getElementById('perso-race')?.value || '';
    const raceObj = Object.values(racesCache || {}).find(r => r.nom === raceNom);
    if (!raceObj) return skillsCache;
    const classeNoms = raceObj.classes.map(c => c.nom);
    const classeAbrs = raceObj.classes.map(c => c.abr);
    return skillsCache.filter(s => {
      if (!s.classes) return false;
      const parts = s.classes.split(' / ').map(p => p.trim());
      // Inclure si Special ou si une classe de la race peut l'apprendre
      if (parts.includes('Special') || parts.includes('Spc.')) return true;
      return parts.some(p => classeNoms.includes(p) || classeAbrs.includes(p));
    });
  }

  // Formater le label d'une skill : "Nom (Abrv1 / Abrv2)"
  // showAll=true pour le tableau (affiche toutes les abrs), false pour le dropdown
  function formatSkillLabel(skill, showAll=false) {
    const raceNom = document.getElementById('perso-race')?.value || '';
    const raceObj = Object.values(racesCache || {}).find(r => r.nom === raceNom);
    if (!skill.classes) return skill.name;
    const parts = skill.classes.split(' / ').map(p => p.trim());
    // Special
    if (parts.includes('Special') || parts.includes('Spc.')) {
      return `${skill.name} (Spc.)`;
    }
    if (!raceObj) return skill.name;
    const classeMap = {};
    raceObj.classes.forEach(c => { classeMap[c.nom] = c.abr; });
    const abrs = parts.filter(p => classeMap[p]).map(p => classeMap[p]);
    return abrs.length ? `${skill.name} (${abrs.join(' / ')})` : skill.name;
  }

  // Maîtrise : pc>0 => input+/pc, pc=0+note => note, sinon "Maitrise"
  function getMaitriseConfig(comp) {
    const skill = skillsCache.find(s => s.name === comp.nom);
    if (!skill) return { type: 'input', suffix: '' };
    if (skill.pc > 0)  return { type: 'input',  suffix: `/${skill.pc}` };
    if (skill.pc_note) return { type: 'static', value: skill.pc_note };
    return { type: 'static', value: 'Maitrise' };
  }

  function renderCompetences() {
    const tbody = document.getElementById('comp-tbody');
    tbody.innerHTML = '';

    state.competences.forEach((comp, i) => {
      const tr = document.createElement('tr');
      const mconf = getMaitriseConfig(comp);

      // ---- Nom : dropdown searchable ----
      const tdNom = document.createElement('td');
      const wrapper = document.createElement('div');
      wrapper.className = 'equip-search-wrapper';
      const nomInput = document.createElement('input');
      nomInput.className   = 'equip-search-input';
      nomInput.type        = 'text';
      nomInput.placeholder = 'Compétence...';
      // Afficher nom + abréviations dans le tableau
      const _skill = skillsCache.find(s => s.name === comp.nom);
      nomInput.value = _skill ? formatSkillLabel(_skill) : (comp.nom || '');
      const nomDD = document.createElement('div');
      nomDD.className = 'equip-dropdown hidden';

      function renderSkillDD(filter) {
        nomDD.innerHTML = '';
        const filterLow = filter.toLowerCase();
        const raceNom2  = document.getElementById('perso-race')?.value || '';
        const raceObj2  = Object.values(racesCache || {}).find(r => r.nom === raceNom2);
        const classeMap2 = {};
        if (raceObj2) raceObj2.classes.forEach(c => { classeMap2[c.nom] = c.abr; });

        const available = getSkillsForRace().filter(s => {
          // Recherche sur le nom
          if (s.name.toLowerCase().includes(filterLow)) return true;
          // Recherche sur les abréviations des classes
          if (!s.classes) return false;
          const parts = s.classes.split(' / ').map(p => p.trim());
          return parts.some(p => {
            const abr = classeMap2[p] || p;
            return abr.toLowerCase().includes(filterLow);
          });
        });
        if (!available.length) {
          const e = document.createElement('div');
          e.className = 'equip-option';
          e.textContent = 'Aucune competence disponible';
          e.style.color = 'var(--text-dim)';
          nomDD.appendChild(e);
          return;
        }
        available.forEach(skill => {
          const opt = document.createElement('div');
          opt.className   = 'equip-option';
          opt.textContent = formatSkillLabel(skill);
          opt.addEventListener('mousedown', () => {
            state.competences[i] = {
              ...state.competences[i],
              skillId: skill.id,
              nom:     skill.name,
              desc:    skill.desc     || '',
              range:   skill.range    || '',
              pm:      skill.pm       || 0,
              pc:      skill.pc       || 0,
              pc_note: skill.pc_note  || '',
            };
            nomInput.value = formatSkillLabel(skill);
            nomDD.classList.add('hidden');
            sauvegarder({ competences: state.competences });
            renderCompetences();
          });
          nomDD.appendChild(opt);
        });
      }

      function posNomDD() {
        const rect = nomInput.getBoundingClientRect();
        nomDD.style.position  = 'fixed';
        nomDD.style.top       = (rect.bottom + 2) + 'px';
        nomDD.style.left      = rect.left + 'px';
        nomDD.style.width     = Math.max(rect.width, 200) + 'px';
        nomDD.style.zIndex    = '9999';
        nomDD.style.maxHeight = Math.min(220, window.innerHeight - rect.bottom - 8) + 'px';
      }

      nomInput.addEventListener('focus', () => { renderSkillDD(nomInput.value); posNomDD(); nomDD.classList.remove('hidden'); });
      nomInput.addEventListener('input', () => { renderSkillDD(nomInput.value); posNomDD(); });
      nomInput.addEventListener('blur',  () => setTimeout(() => nomDD.classList.add('hidden'), 150));
      window.addEventListener('scroll',  () => { if (!nomDD.classList.contains('hidden')) posNomDD(); }, { passive: true });

      wrapper.appendChild(nomInput);
      wrapper.appendChild(nomDD);
      tdNom.appendChild(wrapper);
      tr.appendChild(tdNom);

      // ---- Desc ----
      const tdDesc = document.createElement('td');
      tdDesc.className   = 'comp-auto-cell';
      tdDesc.textContent = comp.desc || '—';
      tr.appendChild(tdDesc);

      // ---- Portée ----
      const tdRange = document.createElement('td');
      tdRange.className   = 'comp-auto-cell';
      tdRange.textContent = comp.range || '—';
      tr.appendChild(tdRange);

      // ---- PM ----
      const tdPm = document.createElement('td');
      tdPm.style.textAlign = 'center';
      const skillMatch = skillsCache.find(s => s.name === comp.nom);
      const isSoutienReaction = skillMatch && (skillMatch.range === 'Soutien' || skillMatch.range === 'Reaction' || skillMatch.range === 'Réaction');

      if (isSoutienReaction) {
        // Case cochable exclusive par type
        const cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.className = 'comp-active-cb';
        cb.checked   = comp.actif || false;
        cb.title     = `Activer ce ${skillMatch.range}`;
        cb.addEventListener('change', () => {
          const type = skillMatch.range;
          // Décocher tous les autres du même type
          state.competences.forEach((c, j) => {
            const sm = skillsCache.find(s => s.name === c.nom);
            if (j !== i && sm && (sm.range === type || (type === 'Réaction' && sm.range === 'Reaction') || (type === 'Reaction' && sm.range === 'Réaction'))) {
              state.competences[j].actif = false;
            }
          });
          state.competences[i].actif = cb.checked;
          sauvegarder({ competences: state.competences });
          renderCompetences();
        });
        tdPm.style.textAlign = 'center';
        tdPm.appendChild(cb);
      } else {
        const pmInput = document.createElement('input');
        pmInput.className   = 'comp-input no-spin';
        pmInput.type        = 'number';
        pmInput.value       = comp.pm || 0;
        pmInput.style.width = '4ch';
        if (skillMatch) {
          pmInput.readOnly      = true;
          pmInput.style.opacity = '0.6';
          pmInput.style.cursor  = 'default';
        } else {
          pmInput.addEventListener('blur', () => {
            state.competences[i].pm = parseInt(pmInput.value) || 0;
            sauvegarder({ competences: state.competences });
          });
        }
        tdPm.appendChild(pmInput);
      }
      tr.appendChild(tdPm);

      // Surbrillance si actif (Soutien/Réaction cochée)
      if (comp.actif) {
        tr.classList.add('comp-row--active');
      }
      // Surbrillance si innée (pc=0 et pas de pc_note) ou maîtrisée (maitrise atteint pc)
      if (skillMatch) {
        const isInnee    = skillMatch.pc === 0 && !skillMatch.pc_note;
        const isMaitrise = skillMatch.pc > 0 && comp.maitrise && parseInt(comp.maitrise) >= skillMatch.pc;
        const isNoted    = skillMatch.pc === 0 && skillMatch.pc_note;
        if (isInnee || isMaitrise || isNoted) {
          tr.classList.add('comp-row--mastered');
        }
      }

      // ---- Maîtrise ----
      const tdMait = document.createElement('td');
      tdMait.style.whiteSpace = 'nowrap';
      tdMait.style.textAlign  = 'center';
      if (mconf.type === 'input') {
        const mInput = document.createElement('input');
        mInput.className   = 'comp-input';
        mInput.type        = 'text';
        mInput.value       = comp.maitrise || '';
        mInput.placeholder = '0';
        mInput.style.width = '3ch';
        mInput.addEventListener('blur', () => {
          state.competences[i].maitrise = mInput.value;
          sauvegarder({ competences: state.competences });
        });
        const suffix = document.createElement('span');
        suffix.className   = 'tbl-suffix';
        suffix.textContent = mconf.suffix;
        tdMait.appendChild(mInput);
        tdMait.appendChild(suffix);
      } else {
        tdMait.className   = 'comp-auto-cell';
        tdMait.textContent = mconf.value;
      }
      tr.appendChild(tdMait);

      // ---- Supprimer ----
      const tdDel = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className   = 'inv-del-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        const nom = state.competences[i].nom || 'cette competence';
        if (confirm(`Supprimer "${nom}" ?`)) {
          state.competences.splice(i, 1);
          renderCompetences();
          sauvegarder({ competences: state.competences });
        }
      });
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    });
  }

  // Mise à jour temps réel depuis skills Firebase
  function majCompetencesFromSkills() {
    let changed = false;
    state.competences.forEach((comp, i) => {
      // Chercher par nom OU par id si le nom a changé
      const skill = skillsCache.find(s => s.name === comp.nom)
                 || skillsCache.find(s => s.id   === comp.skillId);
      if (!skill) return;
      if (skill.name    !== comp.nom      ||
          skill.desc    !== comp.desc     ||
          skill.range   !== comp.range    ||
          skill.pm      !== comp.pm       ||
          skill.pc      !== comp.pc       ||
          skill.pc_note !== comp.pc_note) {
        state.competences[i] = {
          ...comp,
          nom:     skill.name,
          desc:    skill.desc     || '',
          range:   skill.range    || '',
          pm:      skill.pm       || 0,
          pc:      skill.pc       || 0,
          pc_note: skill.pc_note  || '',
        };
        changed = true;
      }
    });
    if (changed) {
      sauvegarder({ competences: state.competences });
      renderCompetences();
    }
  }
  // =====================
  // EXPANDABLES
  // =====================
  function initExpandables() {
    document.querySelectorAll('.expand-toggle').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const body=document.getElementById(btn.dataset.target);
        const open=body.classList.contains('open');
        body.classList.toggle('open',!open); btn.classList.toggle('open',!open);
      });
    });
  }

  // =====================
  // CHARGEMENT PRINCIPAL
  // =====================
  async function chargerPersonnage() {
    if(!persoId){ window.location.href='index.html'; return; }
    try {
      docRef=doc(db,'joueurs',persoId);
      const docSnap=await getDoc(docRef);
      if(!docSnap.exists()){ document.getElementById('perso-nom').textContent='Personnage introuvable'; return; }
      const data=docSnap.data();

      document.getElementById('perso-nom').textContent = data.nom || '—';

      // Charger statuts depuis Firebase
      if (!statutsCache.length) {
        const statutsSnap = await getDocs(collection(db, 'statuts'));
        statutsCache = [];
        statutsSnap.forEach(d => statutsCache.push({ id: d.id, ...d.data() }));
        statutsCache.sort((a,b) => a.nom.localeCompare(b.nom));
      }

      // Charger races depuis Firebase
      if (!racesCache) {
        racesCache = {};
        const racesSnap = await getDocs(collection(db, 'races'));
        racesSnap.forEach(d => { racesCache[d.id] = d.data(); });
      }

      // Charger skills depuis Firebase
      if (!skillsCache.length) {
        const skillsSnap = await getDocs(query(collection(db, 'skills'), orderBy('name')));
        skillsCache = [];
        skillsSnap.forEach(d => skillsCache.push({ id: d.id, ...d.data() }));
      }

      // Construire dropdowns Race/Classe
      buildRaceDropdown(data.race || '', data.classe || '');

      // onSnapshot statuts — mise à jour en temps réel
      onSnapshot(collection(db,'statuts'), snapshot => {
        snapshot.docChanges().forEach(change => {
          const updated = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'modified') {
            const idx = statutsCache.findIndex(s => s.id === updated.id);
            if (idx !== -1) statutsCache[idx] = updated;
            // Mettre à jour les statuts actifs du joueur
            let changed = false;
            state.statuts.forEach((s, i) => {
              if (s.nom === updated.nom) {
                state.statuts[i] = { ...s, desc: updated.desc||'', type: updated.type||'' };
                changed = true;
              }
            });
            if (changed) { renderStatuts(); sauvegarder({ statuts: state.statuts }); }
          } else if (change.type === 'added') {
            if (!statutsCache.find(s => s.id === updated.id)) statutsCache.push(updated);
          } else if (change.type === 'removed') {
            statutsCache = statutsCache.filter(s => s.id !== updated.id);
          }
        });
      });

      // onSnapshot sur skills — mise à jour en temps réel
      onSnapshot(collection(db, 'skills'), snapshot => {
        snapshot.forEach(d => {
          const updated = { id: d.id, ...d.data() };
          const idx = skillsCache.findIndex(s => s.id === d.id);
          if (idx !== -1) skillsCache[idx] = updated;
          else skillsCache.push(updated);
        });
        majCompetencesFromSkills();
      });

      state.hpCurrent=data.hpCurrent||0; state.hpMax=data.hpMax||0;
      state.mpCurrent=data.mpCurrent||0; state.mpMax=data.mpMax||0;
      document.getElementById('hp-max').value=state.hpMax;
      document.getElementById('mp-max').value=state.mpMax;
      majBarre('hp'); majBarre('mp');
      attachBouton('hp-minus','hp',-1,'hpCurrent'); attachBouton('hp-plus','hp',1,'hpCurrent');
      attachBouton('mp-minus','mp',-1,'mpCurrent'); attachBouton('mp-plus','mp',1,'mpCurrent');
      attachMax('hp-max','hp','hpMax'); attachMax('mp-max','mp','mpMax');

      state.totalExp=data.totalExp||0; majExp();
      attachBouton('exp-minus','exp',-1,'totalExp'); attachBouton('exp-plus','exp',1,'totalExp');

      // Historique
      state.historique=data.historique||[]; renderHistorique();

      // Stats
      STATS_KEYS.forEach(stat=>{
        state.stats.flat[stat]    = data[`flat${stat}`]    ||0;
        state.stats.bonus[stat]   = data[`bonus${stat}`]   ||0;
        state.stats.percent[stat] = data[`percent${stat}`] ||0;
        state.stats.equip[stat]   = 0;
      });
      SLOTS.forEach(slot=>{ state.equip[slot.key]=data[slot.key]||null; });
      buildStatsTable(); calcEquipStats(); await buildEquipTable(); buildComparateur();

      // Gils
      state.gils = data.gils || 0;
      const gilsInput = document.getElementById('gils-val');
      gilsInput.value = state.gils;
      gilsInput.addEventListener('change', () => {
        state.gils = Math.max(0, parseInt(gilsInput.value) || 0);
        gilsInput.value = state.gils;
        sauvegarder({ gils: state.gils });
      });

      // Kill Count — span non éditable, max 10, long press − = reset 0
      state.killCount = data.killCount || 0;
      const kcVal = document.getElementById('kc-val');
      kcVal.textContent = state.killCount;

      function updateKC(val) {
        state.killCount = Math.max(0, Math.min(10, val));
        kcVal.textContent = state.killCount;
        sauvegarder({ killCount: state.killCount });
      }

      const kcPlus  = document.getElementById('kc-plus');
      const kcMinus = document.getElementById('kc-minus');
      // KC + : repeat
      attachRepeat(kcPlus, () => updateKC(state.killCount + 1));

      // KC - : simple click, long press = reset à 0
      let kcTimer=null, kcLong=false;
      kcMinus.addEventListener('click', () => { if (!kcLong) updateKC(state.killCount - 1); kcLong=false; });
      kcMinus.addEventListener('pointerdown', () => {
        kcLong=false;
        kcTimer=setTimeout(() => { kcLong=true; updateKC(0); }, 600);
      });
      kcMinus.addEventListener('pointerup',    () => clearTimeout(kcTimer));
      kcMinus.addEventListener('pointerleave', () => clearTimeout(kcTimer));
      kcMinus.addEventListener('pointercancel',() => clearTimeout(kcTimer));

      // Death Count — span non éditable, +/- 1 uniquement
      state.deathCount = data.deathCount || 0;
      const dcVal = document.getElementById('dc-val');
      dcVal.textContent = state.deathCount;

      function updateDC(val) {
        state.deathCount = Math.max(0, val);
        dcVal.textContent = state.deathCount;
        sauvegarder({ deathCount: state.deathCount });
      }

      attachRepeat(document.getElementById('dc-plus'),  () => updateDC(state.deathCount + 1));
      attachRepeat(document.getElementById('dc-minus'), () => updateDC(state.deathCount - 1));

      // Notes communes — onSnapshot temps réel + bouton Soumettre
      const sharedRef  = doc(db, 'global_notes', 'global');
      const sharedArea = document.getElementById('shared-notes-field');
      const sharedBtn  = document.getElementById('shared-notes-submit');
      const sharedStatus = document.getElementById('shared-notes-status');

      // Écouter les mises à jour en temps réel
      onSnapshot(sharedRef, (snap) => {
        if (snap.exists()) {
          const remote = snap.data().notes || '';
          // Ne pas écraser si le joueur est en train d'éditer
          if (document.activeElement !== sharedArea) {
            sharedArea.value = remote;
          }
        }
      });

      // Bouton Soumettre
      sharedBtn.addEventListener('click', async () => {
        try {
          await setDoc(sharedRef, { notes: sharedArea.value }, { merge: true });
          sharedStatus.classList.remove('hidden');
          setTimeout(() => sharedStatus.classList.add('hidden'), 2000);
        } catch (err) {
          console.error('Erreur notes communes:', err);
        }
      });

      // Pouvoir Divin
      document.getElementById('pouvoir-nom').value  = data.pouvoirNom  ||'';
      document.getElementById('pouvoir-desc').value = data.pouvoirDesc ||'';
      document.getElementById('pouvoir-nom').addEventListener('blur',  e=>sauvegarder({pouvoirNom:e.target.value}));
      document.getElementById('pouvoir-desc').addEventListener('blur', e=>sauvegarder({pouvoirDesc:e.target.value}));

      // Statuts
      initStatuts(data);

      // Inventaire / Compétences / Notes
      state.inventaire=data.inventaire||[]; renderInventaire();
      document.getElementById('inv-add').addEventListener('click',()=>{ state.inventaire.push({quantite:1,nom:'',desc:''}); renderInventaire(); sauvegarder({inventaire:state.inventaire}); });
      state.competences=data.competences||[]; renderCompetences();
      document.getElementById('comp-add').addEventListener('click',()=>{ state.competences.push({nom:'',desc:'',pm:'',maitrise:''}); renderCompetences(); sauvegarder({competences:state.competences}); });
      document.getElementById('notes-field').value=data.notes||'';
      document.getElementById('notes-field').addEventListener('blur',e=>sauvegarder({notes:e.target.value}));

      initExpandables();
      initTheme();

      // Écouter les changements en temps réel (messages MJ + mise à jour items)
      onSnapshot(docRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        // Message personnel du MJ
        const msg = data.personal_message;
        if (msg && msg.trim()) {
          showMjMessage(msg);
          updateDoc(docRef, { personal_message: '' });
        }

        // Mise à jour des équipements si un slot a changé
        const SLOT_KEYS = ['main1Item','main2Item','helmetItem','armorItem','bootsItem','glovesItem','jewelItem'];
        let equipChanged = false;
        SLOT_KEYS.forEach(slot => {
          const newItem = data[slot] || null;
          const oldItem = state.equip[slot];
          // Comparer tous les champs : nom, type, stats, desc
          if (newItem && oldItem && (
            newItem.name !== oldItem.name ||
            newItem.type !== oldItem.type ||
            newItem.desc !== oldItem.desc ||
            newItem.atk  !== oldItem.atk  ||
            newItem.def  !== oldItem.def  ||
            newItem.mag  !== oldItem.mag  ||
            newItem.res  !== oldItem.res  ||
            newItem.agi  !== oldItem.agi
          )) {
            state.equip[slot] = newItem;
            equipChanged = true;
          }
        });

        if (equipChanged) {
          calcEquipStats();
          // Mettre à jour nom, type, description et stats badges dans le tableau
          SLOT_KEYS.forEach(slot => {
            const item = state.equip[slot];
            if (!item) return;
            const tbody = document.getElementById('equip-tbody');
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            const slotIndex = SLOTS.findIndex(s => s.key === slot);
            if (slotIndex < 0 || !rows[slotIndex]) return;
            const tds = rows[slotIndex].querySelectorAll('td');

            // Colonne nom/input (2e td — l'input de recherche)
            const input = rows[slotIndex].querySelector('.equip-search-input');
            if (input) input.value = item.name || '';

            // Colonne stats badges (3e td)
            if (tds[2]) {
              tds[2].innerHTML = ['atk','def','mag','res','agi']
                .filter(s => item[s])
                .map(s => `<span class="equip-stat-badge">${s.toUpperCase()} +${item[s]}</span>`)
                .join('');
            }

            // Colonne description (4e td)
            if (tds[3]) tds[3].textContent = item.desc || '—';
          });
        }
      });

    } catch(err){ document.getElementById('perso-nom').textContent='Erreur de chargement'; console.error(err); }
  }

  function showMjMessage(msg) {
    const overlay = document.createElement('div');
    overlay.className = 'levelup-overlay';
    overlay.innerHTML = `
      <div class="levelup-box">
        <div class="levelup-stars">✦ Message du MJ ✦</div>
        <p class="mj-message-text">${msg}</p>
        <button class="levelup-close" id="mj-msg-close">Fermer</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#mj-msg-close').addEventListener('click', () => overlay.remove());
  }

  chargerPersonnage();
}

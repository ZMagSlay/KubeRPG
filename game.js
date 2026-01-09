// KubeRPG — Prototype local
// Vanilla JS: map rendering, accounts, inventory, turn-based combats, dungeon waves

// --- Data models and storage ---
const STORAGE_KEY = 'kuberpg_players_v1';

function loadAccounts(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return {};
  try{ return JSON.parse(raw);}catch(e){return {}};
}
function saveAccounts(accounts){ localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); }

// Basic item factory
function makeItem(type, rarity, power){
  const base = {id: Date.now()+Math.random(), type, rarity, stats:{}, equipped:false};
  if(type==='Sword') base.stats.damage = power;
  if(type==='Orbe') base.stats.defense = power;
  if(type==='Halo') base.stats.hp = power;
  return base;
}

// Rarity multiplier
const RARITY_MULT = {Common:1, Rare:1.4, Epic:2, Legendary:3};
const RARITIES = Object.keys(RARITY_MULT);

// --- Game state ---
let accounts = loadAccounts();
let party = []; // array of pseudos
let selectedPlayer = null; // pseudo

// Canvas and map
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// Simple map buildings
const buildings = [
  {id:'forge',name:'Forge',x:100,y:80,w:120,h:80,color:'#b04'},
  {id:'house',name:'Maison',x:620,y:420,w:120,h:100,color:'#6b3'},
  {id:'bar',name:'Bar',x:60,y:420,w:140,h:90,color:'#d96'},
  {id:'donjon',name:'Donjon',x:360,y:220,w:140,h:120,color:'#666'}
];

// Players runtime data (positions)
let runtimePlayers = {}; // pseudo -> {x,y,vx...}

// --- UI hooks ---
const accountsListEl = document.getElementById('accountsList');
const createAccountForm = document.getElementById('createAccountForm');
const pseudoInput = document.getElementById('pseudo');
const colorInput = document.getElementById('color');
const joinGroupBtn = document.getElementById('joinGroup');
const partyListEl = document.getElementById('partyList');
const inventoryListEl = document.getElementById('inventoryList');
const enterDungeonBtn = document.getElementById('enterDungeon');
const logEl = document.getElementById('log');

// --- Helpers ---
function log(msg){
  const el = document.createElement('div'); el.textContent = msg; logEl.prepend(el);
}

function renderAccounts(){
  accountsListEl.innerHTML='';
  for(const pseudo in accounts){
    const a = accounts[pseudo];
    const div = document.createElement('div'); div.className='accountItem';
    const col = document.createElement('div'); col.className='accountColor'; col.style.background = a.color;
    const name = document.createElement('div'); name.innerHTML = `<div class="pseudoLabel">${pseudo}</div><div class="small">lvl ${a.progress.level} • ${a.inventory.length} objets</div>`;
    const btn = document.createElement('button'); btn.textContent = 'Sélectionner';
    btn.onclick = ()=>{ selectedPlayer = pseudo; renderInventory(); highlightSelected(); };
    div.appendChild(col); div.appendChild(name); div.appendChild(btn);
    accountsListEl.appendChild(div);
  }
}

function highlightSelected(){
  // small visual cue in party list
  renderParty();
}

function renderParty(){
  if(party.length===0) partyListEl.textContent='Aucun membre';
  else{
    partyListEl.innerHTML='';
    party.forEach(pseudo=>{
      const el = document.createElement('div'); el.className='partyMember'; el.textContent = pseudo + (pseudo===selectedPlayer? ' (actif)':'');
      partyListEl.appendChild(el);
    });
  }
}

function renderInventory(){
  inventoryListEl.innerHTML='';
  if(!selectedPlayer){ inventoryListEl.textContent='Sélectionner un compte'; return; }
  const acc = accounts[selectedPlayer];
  if(!acc) return;
  if(acc.inventory.length===0) inventoryListEl.textContent='Vide';
  acc.inventory.forEach(item=>{
    const div = document.createElement('div'); div.className='itemCard itemRarity-'+item.rarity;
    div.innerHTML = `<strong>${item.type}</strong> <span class="small">(${item.rarity})</span><div class="small">${JSON.stringify(item.stats)}</div>`;
    const eqBtn = document.createElement('button'); eqBtn.textContent = item.equipped? 'Déséquiper':'Équiper';
    eqBtn.onclick = ()=>{ item.equipped=!item.equipped; saveAccounts(accounts); renderInventory(); };
    div.appendChild(eqBtn);
    inventoryListEl.appendChild(div);
  });
}

// --- Account form ---
createAccountForm.addEventListener('submit', e=>{
  e.preventDefault();
  const pseudo = pseudoInput.value.trim();
  const color = colorInput.value;
  if(!pseudo) return;
  if(!accounts[pseudo]){
    accounts[pseudo] = {pseudo, color, progress:{level:1, dungeonStage:0}, inventory:[], equipped:{}};
    // give starter items
    accounts[pseudo].inventory.push(makeItem('Sword','Common',3));
    accounts[pseudo].inventory.push(makeItem('Halo','Common',5));
    saveAccounts(accounts);
    log(`Compte créé: ${pseudo}`);
  }
  selectedPlayer = pseudo; renderAccounts(); renderInventory();
});

joinGroupBtn.addEventListener('click', ()=>{
  if(!selectedPlayer) return alert('Sélectionner un compte d\'abord');
  if(!party.includes(selectedPlayer)) party.push(selectedPlayer);
  renderParty();
  // spawn runtime position if missing
  if(!runtimePlayers[selectedPlayer]) runtimePlayers[selectedPlayer] = {x:400+Math.random()*40-20,y:500+Math.random()*40-20};
});

// Movement controls (move selected player)
document.addEventListener('keydown', e=>{
  if(!selectedPlayer) return;
  const p = runtimePlayers[selectedPlayer];
  if(!p) return;
  const step = 8;
  if(e.key==='ArrowUp' || e.key==='w') p.y-=step;
  if(e.key==='ArrowDown' || e.key==='s') p.y+=step;
  if(e.key==='ArrowLeft' || e.key==='a') p.x-=step;
  if(e.key==='ArrowRight' || e.key==='d') p.x+=step;
});

// Canvas interactions (click on building)
canvas.addEventListener('click', e=>{
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX-rect.left; const y = e.clientY-rect.top;
  for(const b of buildings){
    if(x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h){
      handleBuildingInteract(b);
      return;
    }
  }
});

function handleBuildingInteract(b){
  log(`${b.name} activée`);
  if(b.id==='donjon'){
    if(party.length===0) return alert('Former un groupe local d\'abord (sélectionnez un compte puis "Joindre au groupe").');
    startDungeon();
  }
  if(b.id==='forge'){
    // simple forge: upgrade a random inventory item of selected player
    if(!selectedPlayer) return alert('Sélectionner un compte.');
    const acc = accounts[selectedPlayer];
    if(acc.inventory.length===0) return alert('Rien à améliorer.');
    const it = acc.inventory[Math.floor(Math.random()*acc.inventory.length)];
    // bump stats slightly
    for(const k in it.stats) it.stats[k] = Math.ceil(it.stats[k]*1.2 + 1);
    saveAccounts(accounts); renderInventory(); log(`${acc.pseudo}: ${it.type} amélioré`);
  }
  if(b.id==='bar'){
    log('Bar: repos — restauration légère');
    // restore party HP in runtime (we'll store hp in runtime)
    party.forEach(pseudo=>{ const r = runtimePlayers[pseudo]; if(r) r.hp = r.maxHp; });
  }
  if(b.id==='house'){
    if(!selectedPlayer) return alert('Sélectionner un compte.');
    log(`${selectedPlayer} est allé·e à la maison — sauvegarde`);
    saveAccounts(accounts);
  }
}

// --- Rendering loop ---
function draw(){
  ctx.clearRect(0,0,W,H);
  // draw buildings
  buildings.forEach(b=>{
    ctx.fillStyle = b.color; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(b.name, b.x+8, b.y+20);
  });
  // draw players
  for(const pseudo of party){
    const acc = accounts[pseudo];
    if(!runtimePlayers[pseudo]) runtimePlayers[pseudo] = {x:100+Math.random()*600,y:100+Math.random()*400, hp:20, maxHp:20};
    const p = runtimePlayers[pseudo];
    // derived stats from equipped items
    const stats = computePlayerStats(acc);
    p.maxHp = stats.hp;
    if(!p.hp) p.hp = p.maxHp;

    // cube
    ctx.fillStyle = acc.color; ctx.fillRect(p.x-16, p.y-16, 32, 32);
    // pseudo label above cube
    ctx.fillStyle = acc.color; ctx.font = '12px sans-serif'; ctx.fillText(pseudo, p.x-16, p.y-22);
    // hp bar
    ctx.fillStyle = '#222'; ctx.fillRect(p.x-20,p.y+20,40,6);
    ctx.fillStyle = '#f55'; ctx.fillRect(p.x-20,p.y+20,40*Math.max(0,p.hp)/p.maxHp,6);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// --- Stats and combat ---
function computePlayerStats(acc){
  // base stats
  let hp = 30; let dmg = 4; let def = 0;
  acc.inventory.forEach(it=>{
    if(it.equipped){
      if(it.type==='Sword') dmg += it.stats.damage * (RARITY_MULT[it.rarity]||1);
      if(it.type==='Orbe') def += it.stats.defense * (RARITY_MULT[it.rarity]||1);
      if(it.type==='Halo') hp += it.stats.hp * (RARITY_MULT[it.rarity]||1);
    }
  });
  // scale with level
  hp = Math.ceil(hp * (1 + (acc.progress.level-1)*0.08));
  dmg = Math.ceil(dmg * (1 + (acc.progress.level-1)*0.06));
  def = Math.ceil(def * (1 + (acc.progress.level-1)*0.04));
  return {hp,dmg,def};
}

// --- Combat system (simple turn-based simulator) ---
function startCombat(players, enemies){
  // players: array of pseudos; enemies: array of objects {name,hp,dmg,def,id}
  log('Combat engagé — préparation...');
  // prepare runtime combat copies
  const partyState = players.map(pseudo=>{
    const acc = accounts[pseudo];
    const s = computePlayerStats(acc);
    return {pseudo, hp:s.hp, maxHp:s.hp, dmg:s.dmg, def:s.def};
  });
  const enemyState = enemies.map((e,i)=> ({...e, id:i}));

  // turn order: all players then all enemies
  const rounds = [];
  // queue is players then enemies per round
  let round = 1;

  function combatRound(){
    log(`--- Round ${round} ---`);
    // players act
    for(const p of partyState){
      if(p.hp<=0) continue;
      // choose target: first alive enemy
      const target = enemyState.find(en=>en.hp>0);
      if(!target) break;
      // compute damage
      const dmg = Math.max(1, p.dmg - target.def);
      target.hp -= dmg;
      log(`${p.pseudo} attaque ${target.name} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp||'?'})`);
      if(target.hp<=0){
        log(`${target.name} vaincu !`);
      }
    }
    // enemies act
    for(const e of enemyState){
      if(e.hp<=0) continue;
      const target = partyState.find(pl=>pl.hp>0);
      if(!target) break; // party defeated
      const dmg = Math.max(1, e.dmg - target.def);
      target.hp -= dmg;
      log(`${e.name} attaque ${target.pseudo} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp})`);
      if(target.hp<=0) log(`${target.pseudo} est KO`);
    }

    // check end
    const allEnemiesDead = enemyState.every(e=>e.hp<=0);
    const allPlayersDead = partyState.every(p=>p.hp<=0);
    if(allEnemiesDead || allPlayersDead){
      if(allEnemiesDead){ log('Victoire !'); onCombatWin(players, enemyState); }
      else { log('Défaite...'); }
      return;
    }
    round++; setTimeout(combatRound, 800);
  }
  setTimeout(combatRound, 300);
}

function onCombatWin(players, enemyState){
  // drop items for each enemy
  const drops = [];
  enemyState.forEach(e=>{
    // each enemy drops 0-2 items
    const ct = Math.random()<0.7?1: Math.random()<0.3?2:0;
    for(let i=0;i<ct;i++){
      const rarity = weightedRarity();
      const type = ['Sword','Orbe','Halo'][Math.floor(Math.random()*3)];
      const basePower = Math.ceil((e.level||1) * (2 + Math.random()*3));
      drops.push(makeItem(type, rarity, Math.max(1, Math.round(basePower * (RARITY_MULT[rarity]||1)))));
    }
  });
  if(drops.length===0) log('Aucun butin trouvé.');
  else{
    log(`Butin trouvé: ${drops.length} objets`);
    // give drops to first party member (simple)
    const receiver = players[0];
    const acc = accounts[receiver];
    acc.inventory.push(...drops);
    saveAccounts(accounts);
    renderInventory();
  }
}

function weightedRarity(){
  const r = Math.random();
  if(r<0.6) return 'Common';
  if(r<0.85) return 'Rare';
  if(r<0.97) return 'Epic';
  return 'Legendary';
}

// --- Dungeon waves ---
function startDungeon(){
  // simple wave progression
  let wave = 1;
  function spawnWave(){
    log(`Donjon: vague ${wave}`);
    // create enemies scaled to wave
    const enemies = [];
    const count = 1 + Math.floor(Math.random()* (1 + Math.floor(wave/2)));
    for(let i=0;i<count;i++){
      const level = wave + Math.floor(Math.random()*2);
      const baseHp = 10 + level*5;
      const baseDmg = 2 + level*2;
      const def = Math.floor(level/2);
      enemies.push({name:`Squelette L${level}`, hp:baseHp, maxHp:baseHp, dmg:baseDmg, def, level});
    }
    startCombat(party, enemies);
    wave++;
    // after a delay, if party still exists ask to continue
    setTimeout(()=>{
      if(confirm('Continuer à la vague suivante ?')) spawnWave();
      else log('Sortie du donjon.');
    }, 3000 + enemies.length*1000);
  }
  spawnWave();
}

// --- Init ---
function init(){
  renderAccounts(); renderParty(); renderInventory();
  log('Prototype prêt. Créez un compte puis joignez-le au groupe.');
}
init();

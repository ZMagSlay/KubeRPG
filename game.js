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
let splitScreenEnabled = false;
let inCombat = false;

// Canvas and map (primary)
const canvas = document.getElementById('map');
let secondaryCanvas = null;
let ctx = canvas.getContext('2d');
let W = canvas.width, H = canvas.height;

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
    const eqBtn = document.createElement('button');
    // determine if it's currently equipped in a slot
    const slot = findEquippedSlot(acc, item.id);
    eqBtn.textContent = slot? 'Déséquiper':'Équiper';
    eqBtn.onclick = ()=>{
      if(slot){ unequipItem(acc, slot); }
      else { equipItem(acc, item); }
      saveAccounts(accounts); renderInventory(); renderEquippedPanel();
    };
    div.appendChild(eqBtn);
    inventoryListEl.appendChild(div);
  });
}

function findEquippedSlot(acc, itemId){
  if(!acc.equipped) return null;
  for(const slot in acc.equipped){ if(acc.equipped[slot] && acc.equipped[slot].id===itemId) return slot; }
  return null;
}

function equipItem(acc, item){
  if(!acc.equipped) acc.equipped = {};
  acc.equipped[item.type] = item; // one slot per type
}

function unequipItem(acc, slot){ if(acc.equipped) acc.equipped[slot]=null; }

function renderEquippedPanel(){
  const panel = document.getElementById('equippedSlots');
  if(!selectedPlayer) return;
  const acc = accounts[selectedPlayer];
  ['Sword','Orbe','Halo'].forEach(type=>{
    const span = panel.querySelector(`[data-item="${type}"]`);
    const it = acc.equipped && acc.equipped[type];
    span.textContent = it? `${it.type} (${it.rarity})` : '—';
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
  const step = 8;
  if(splitScreenEnabled && party.length>=2){
    // WASD -> party[0], Arrows -> party[1]
    const p0 = runtimePlayers[party[0]]; const p1 = runtimePlayers[party[1]];
    if(p0){ if(['w','a','s','d'].includes(e.key)) handleKeyForPlayer(e.key, p0, step); }
    if(p1){ if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)) handleKeyForPlayer(e.key, p1, step); }
  } else {
    if(!selectedPlayer) return;
    const p = runtimePlayers[selectedPlayer]; if(!p) return;
    if(['w','a','s','d','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.key)) handleKeyForPlayer(e.key, p, step);
  }
});

function handleKeyForPlayer(key, playerRuntime, step){
  if(key==='ArrowUp' || key==='w') playerRuntime.y-=step;
  if(key==='ArrowDown' || key==='s') playerRuntime.y+=step;
  if(key==='ArrowLeft' || key==='a') playerRuntime.x-=step;
  if(key==='ArrowRight' || key==='d') playerRuntime.x+=step;
}

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
  // render to primary (and secondary if enabled)
  W = canvas.width; H = canvas.height;
  ctx.clearRect(0,0,W,H);
  if(inCombat && window.__combat){
    renderCombatViewport(ctx, W, H, window.__combat);
    if(splitScreenEnabled && secondaryCanvas){
      const ctx2 = secondaryCanvas.getContext('2d'); const W2 = secondaryCanvas.width, H2 = secondaryCanvas.height;
      ctx2.clearRect(0,0,W2,H2);
      renderCombatViewport(ctx2, W2, H2, window.__combat);
    }
  } else {
    if(splitScreenEnabled && secondaryCanvas){
      renderViewport(ctx, W, H, party[0] ? runtimePlayers[party[0]] : null);
      // secondary
      const ctx2 = secondaryCanvas.getContext('2d');
      const W2 = secondaryCanvas.width, H2 = secondaryCanvas.height;
      ctx2.clearRect(0,0,W2,H2);
      renderViewport(ctx2, W2, H2, party[1] ? runtimePlayers[party[1]] : null);
    } else {
      renderViewport(ctx, W, H, null);
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function renderViewport(context, width, height, focusPlayer){
  context.save();
  // compute camera center
  let cx = width/2, cy = height/2;
  if(focusPlayer){ cx = focusPlayer.x; cy = focusPlayer.y; }
  // translate so that camera center maps to canvas center
  context.translate(Math.round(width/2 - cx), Math.round(height/2 - cy));
  // draw buildings
  buildings.forEach(b=>{
    context.fillStyle = b.color; context.fillRect(b.x,b.y,b.w,b.h);
    context.fillStyle = '#fff'; context.font = '14px sans-serif'; context.fillText(b.name, b.x+8, b.y+20);
  });
  // draw players
  for(const pseudo of party){
    const acc = accounts[pseudo];
    if(!runtimePlayers[pseudo]) runtimePlayers[pseudo] = {x:100+Math.random()*600,y:100+Math.random()*400, hp:20, maxHp:20};
    const p = runtimePlayers[pseudo];
    const stats = computePlayerStats(acc);
    p.maxHp = stats.hp; if(!p.hp) p.hp = p.maxHp;
    context.fillStyle = acc.color; context.fillRect(p.x-16, p.y-16, 32, 32);
    context.fillStyle = acc.color; context.font = '12px sans-serif'; context.fillText(pseudo, p.x-16, p.y-22);
    context.fillStyle = '#222'; context.fillRect(p.x-20,p.y+20,40,6);
    context.fillStyle = '#f55'; context.fillRect(p.x-20,p.y+20,40*Math.max(0,p.hp)/p.maxHp,6);
  }
  context.restore();
}

// --- Stats and combat ---
function computePlayerStats(acc){
  // base stats
  let hp = 30; let dmg = 4; let def = 0;
  if(acc.equipped){
    for(const slot of ['Sword','Orbe','Halo']){
      const it = acc.equipped[slot];
      if(!it) continue;
      if(it.type==='Sword') dmg += it.stats.damage * (RARITY_MULT[it.rarity]||1);
      if(it.type==='Orbe') def += it.stats.defense * (RARITY_MULT[it.rarity]||1);
      if(it.type==='Halo') hp += it.stats.hp * (RARITY_MULT[it.rarity]||1);
    }
  }
  // scale with level
  hp = Math.ceil(hp * (1 + (acc.progress.level-1)*0.08));
  dmg = Math.ceil(dmg * (1 + (acc.progress.level-1)*0.06));
  def = Math.ceil(def * (1 + (acc.progress.level-1)*0.04));
  return {hp,dmg,def};
}

// --- Combat system (simple turn-based simulator) ---
function startCombat(players, enemies, callback){
  // players: array of pseudos; enemies: array of objects {name,hp,dmg,def,id}
  log('Combat engagé — préparation...');
  const partyState = players.map(pseudo=>{
    const acc = accounts[pseudo];
    const s = computePlayerStats(acc);
    return {pseudo, hp:s.hp, maxHp:s.hp, dmg:s.dmg, def:s.def};
  });
  const enemyState = enemies.map((e,i)=> ({...e, id:i}));
  let round = 1;
  function combatRound(){
    log(`--- Round ${round} ---`);
    // players act
    for(const p of partyState){
      if(p.hp<=0) continue;
      const target = enemyState.find(en=>en.hp>0);
      if(!target) break;
      const dmg = Math.max(1, p.dmg - target.def);
      target.hp -= dmg;
      log(`${p.pseudo} attaque ${target.name} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp||'?'})`);
      if(target.hp<=0) log(`${target.name} vaincu !`);
    }
    // enemies act
    for(const e of enemyState){
      if(e.hp<=0) continue;
      const target = partyState.find(pl=>pl.hp>0);
      if(!target) break;
      const dmg = Math.max(1, e.dmg - target.def);
      target.hp -= dmg;
      log(`${e.name} attaque ${target.pseudo} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp})`);
      if(target.hp<=0) log(`${target.pseudo} est KO`);
    }
    const allEnemiesDead = enemyState.every(e=>e.hp<=0);
    const allPlayersDead = partyState.every(p=>p.hp<=0);
    if(allEnemiesDead || allPlayersDead){
      if(allEnemiesDead){ log('Victoire !');
        const drops = generateDrops(enemyState);
        if(typeof callback==='function') callback(true, drops);
        else onCombatWin(players, enemyState);
      } else { log('Défaite...'); if(typeof callback==='function') callback(false, []); }
      return;
    }
    round++; setTimeout(combatRound, 800);
  }
  setTimeout(combatRound, 300);
}

function generateDrops(enemyState){
  const drops = [];
  enemyState.forEach(e=>{
    const ct = Math.random()<0.7?1: Math.random()<0.3?2:0;
    for(let i=0;i<ct;i++){
      const rarity = weightedRarity();
      const type = ['Sword','Orbe','Halo'][Math.floor(Math.random()*3)];
      const basePower = Math.ceil((e.level||1) * (2 + Math.random()*3));
      drops.push(makeItem(type, rarity, Math.max(1, Math.round(basePower * (RARITY_MULT[rarity]||1)))));
    }
  });
  return drops;
}

// Combat runner (grid-based, simple AI for players and enemies)
function runCombatRound(combat, onFinished){
  let round = 1;
  function step(){
    log(`--- Round ${round} ---`);
    // players turn
    const players = combat.units.filter(u=>u.type==='player' && u.hp>0);
    const enemies = combat.units.filter(u=>u.type==='enemy' && u.hp>0);
    // players act (simple AI: move toward closest enemy and attack if adjacent)
    for(const p of players){
      const target = findClosest(p, enemies);
      if(!target) continue;
      const dist = Math.abs(p.x-target.x) + Math.abs(p.y-target.y);
      if(dist>1){
        // move one step towards
        if(p.x < target.x) p.x++;
        else if(p.x > target.x) p.x--;
        else if(p.y < target.y) p.y++;
        else if(p.y > target.y) p.y--;
      }
      // recompute dist
      const nd = Math.abs(p.x-target.x) + Math.abs(p.y-target.y);
      if(nd<=1){
        const dmg = Math.max(1, p.dmg - (target.def||0));
        target.hp -= dmg;
        log(`${p.pseudo} attaque ${target.name||target.id} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp})`);
      }
    }
    // enemies turn
    for(const e of enemies){
      const target = findClosest(e, players);
      if(!target) continue;
      const dist = Math.abs(e.x-target.x) + Math.abs(e.y-target.y);
      if(dist>1){
        if(e.x < target.x) e.x++;
        else if(e.x > target.x) e.x--;
        else if(e.y < target.y) e.y++;
        else if(e.y > target.y) e.y--;
      }
      const nd = Math.abs(e.x-target.x) + Math.abs(e.y-target.y);
      if(nd<=1){
        const dmg = Math.max(1, e.dmg - (target.def||0));
        target.hp -= dmg;
        log(`${e.name} attaque ${target.pseudo} pour ${dmg} dégâts (${Math.max(0,target.hp)}/${target.maxHp})`);
      }
    }

    // cleanup and check end
    const playersAlive = combat.units.filter(u=>u.type==='player' && u.hp>0).length;
    const enemiesAlive = combat.units.filter(u=>u.type==='enemy' && u.hp>0).length;
    if(enemiesAlive===0 || playersAlive===0){
      // finished
      setTimeout(()=> onFinished(), 300);
      return;
    }
    round++; setTimeout(step, 600);
  }
  setTimeout(step, 300);
}

function findClosest(unit, targets){
  if(!targets || targets.length===0) return null;
  let best = null; let bd = Infinity;
  for(const t of targets){
    const d = Math.abs(unit.x - t.x) + Math.abs(unit.y - t.y);
    if(d < bd){ bd = d; best = t; }
  }
  return best;
}

// Combat rendering: draws a simple grid and units when `inCombat` is true
function renderCombatViewport(context, width, height, combat){
  context.save();
  // compute scale to center grid
  const tile = combat.tile || 64;
  const gw = combat.cols * tile; const gh = combat.rows * tile;
  const ox = Math.max(0, Math.floor((width - gw)/2));
  const oy = Math.max(0, Math.floor((height - gh)/2));
  // background
  context.fillStyle = '#123'; context.fillRect(ox-8, oy-8, gw+16, gh+16);
  // grid
  for(let r=0;r<combat.rows;r++){
    for(let c=0;c<combat.cols;c++){
      const x = ox + c*tile; const y = oy + r*tile;
      context.fillStyle = (c%2 ^ r%2)? '#0b2a3a' : '#0f3447';
      context.fillRect(x,y,tile-2,tile-2);
    }
  }
  // units
  combat.units.forEach(u=>{
    const x = ox + u.x*tile + 8; const y = oy + u.y*tile + 8; const size = tile-16;
    if(u.type==='player') context.fillStyle = (accounts[u.pseudo] && accounts[u.pseudo].color) || '#4caf50';
    else context.fillStyle = '#a24c4c';
    context.fillRect(x,y,size,size);
    // hp bar
    context.fillStyle = '#222'; context.fillRect(x, y+size+6, size, 8);
    context.fillStyle = '#f55'; context.fillRect(x, y+size+6, Math.max(0,size * (u.hp/u.maxHp)), 8);
    // label
    context.fillStyle = '#fff'; context.font = '12px sans-serif';
    const label = u.type==='player'? u.pseudo : u.name;
    context.fillText(label, x, y-6);
  });
  context.restore();
}

function onCombatWin(players, enemyState){
  const drops = generateDrops(enemyState);
  if(drops.length===0) log('Aucun butin trouvé.');
  else{
    log(`Butin trouvé: ${drops.length} objets`);
    const receiver = players[0];
    const acc = accounts[receiver];
    acc.inventory.push(...drops);
    saveAccounts(accounts);
    renderInventory(); renderEquippedPanel();
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
  // Grid-based dungeon: turn-based on a tiled board with simple AI
  if(party.length===0){ return alert('Former un groupe local d\'abord (sélectionnez un compte puis "Joindre au groupe").'); }
  inCombat = true;
  const GRID_COLS = 8;
  const GRID_ROWS = 6;
  const TILE = 64; // px for rendering

  let wave = 1;

  function spawnWave(){
    log(`Donjon: vague ${wave}`);
    // build combat state
    const combat = {cols:GRID_COLS, rows:GRID_ROWS, tile:TILE, units:[], wave};

    // spawn players at left column
    let yidx = 1;
    for(const pseudo of party){
      const acc = accounts[pseudo];
      if(!acc) continue;
      const s = computePlayerStats(acc);
      const unit = {id:`p_${pseudo}`, type:'player', pseudo, hp:s.hp, maxHp:s.hp, dmg:s.dmg, def:s.def, x:0, y:Math.min(GRID_ROWS-1, yidx), accName: pseudo};
      combat.units.push(unit);
      yidx += 2;
    }

    // spawn enemies on right column
    const count = 1 + Math.floor(Math.random()* (1 + Math.floor(wave/2)));
    for(let i=0;i<count;i++){
      const level = wave + Math.floor(Math.random()*2);
      const baseHp = 10 + level*5;
      const baseDmg = 2 + level*2;
      const def = Math.floor(level/2);
      const e = {id:`e_${i}`, type:'enemy', name:`Squelette L${level}`, hp:baseHp, maxHp:baseHp, dmg:baseDmg, def, level, x:GRID_COLS-1, y: Math.min(GRID_ROWS-1, i*2)};
      combat.units.push(e);
    }

    // attach combat to global for rendering
    window.__combat = combat;

    // run turn loop
    runCombatRound(combat, ()=>{
      // callback when wave finished
      const playersAlive = combat.units.filter(u=>u.type==='player' && u.hp>0).length;
      const enemiesAlive = combat.units.filter(u=>u.type==='enemy' && u.hp>0).length;
      if(playersAlive===0){
        log('Le groupe a été vaincu. Fin du donjon.');
        // return players to village left
        party.forEach(pseudo=>{ runtimePlayers[pseudo] = {x:100+Math.random()*80, y:400+Math.random()*80}; });
        inCombat = false; delete window.__combat;
        return;
      }
      // victory
      log('Vague terminée — victoire');
      // drops and rewards
      const drops = generateDrops(combat.units.filter(u=>u.type==='enemy'));
      if(drops.length>0){
        const receiver = party[0]; const acc = accounts[receiver]; acc.inventory.push(...drops); saveAccounts(accounts); renderInventory(); renderEquippedPanel();
        log(`Récompenses distribuées (${drops.length})`);
      }
      // reset player positions to left
      party.forEach((pseudo,idx)=>{ runtimePlayers[pseudo] = {x:120, y:120 + idx*60}; });
      // ask to continue
      setTimeout(()=>{
        if(confirm('Continuer à la vague suivante ?')){ wave++; spawnWave(); }
        else { inCombat = false; delete window.__combat; log('Sortie du donjon.'); }
      }, 300);
    });
  }

  spawnWave();
}

// --- Init ---
function init(){
  renderAccounts(); renderParty(); renderInventory();
  renderEquippedPanel();
  // autosave every 10s
  setInterval(()=>{ saveAccounts(accounts); log('Autosave'); }, 10000);
  // split-screen toggle
  const toggle = document.getElementById('toggleSplit');
  toggle.addEventListener('click', ()=>{
    splitScreenEnabled = !splitScreenEnabled;
    toggle.textContent = splitScreenEnabled? 'Désactiver Split-Screen' : 'Activer Split-Screen';
    if(splitScreenEnabled){
      if(!secondaryCanvas){
        secondaryCanvas = document.createElement('canvas'); secondaryCanvas.id='mapRight'; secondaryCanvas.width=380; secondaryCanvas.height=600;
        document.getElementById('gameArea').appendChild(secondaryCanvas);
      }
    } else {
      if(secondaryCanvas){ secondaryCanvas.remove(); secondaryCanvas = null; }
    }
  });
  log('Prototype prêt. Créez un compte puis joignez-le au groupe.');
}
init();


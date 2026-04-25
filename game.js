const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('statusLine');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const pilots = [
  { id: 'shin', name: 'Shin', speed: 280, fireRate: 0.1, armor: 3, desc: 'Balanced ace for all mission types.' },
  { id: 'mickey', name: 'Mickey', speed: 330, fireRate: 0.08, armor: 2, desc: 'Fast and aggressive, but fragile.' },
  { id: 'greg', name: 'Greg', speed: 240, fireRate: 0.12, armor: 4, desc: 'Heavy armor and steadier handling.' },
];

const missions = [
  { id: 'desert', name: 'Desert Siege', theme: 'desert', difficulty: 1, length: 95, bossName: 'Fortress Walker' },
  { id: 'ocean', name: 'Ocean Blockade', theme: 'ocean', difficulty: 2, length: 115, bossName: 'Carrier Hydra' },
  { id: 'forest', name: 'Forest Corridor', theme: 'forest', difficulty: 3, length: 125, bossName: 'Heli Leviathan' },
  { id: 'urban', name: 'Urban Breakthrough', theme: 'urban', difficulty: 4, length: 130, bossName: 'Railgun Citadel' },
];

const subWeapons = {
  bomb: { name: 'Bomb', cost: 200, ammo: 10, dmg: 25, cooldown: 0.35 },
  missile: { name: 'Missile', cost: 250, ammo: 14, dmg: 16, cooldown: 0.2 },
  napalm: { name: 'Napalm', cost: 300, ammo: 8, dmg: 38, cooldown: 0.55 },
};

const economy = {
  engineUpgrade: { name: 'Engine Upgrade', cost: 500, desc: '+8% movement speed per level', max: 3 },
  gunUpgrade: { name: 'Gun Upgrade', cost: 550, desc: '+1 bullet lane up to 3 lanes', max: 2 },
};

const keys = new Set();
addEventListener('keydown', (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Backspace"].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const state = {
  scene: 'title',
  cursor: 0,
  pilotIndex: 0,
  selectedMission: 0,
  missionClear: new Set(),
  playerSlots: [null, null],
  activePlayer: 0,
  lastInput: 0,
  game: null,
  msg: 'Press Enter to start briefing.',
};

function press(key) {
  return keys.has(key);
}

function tapped(action, cooldown = 150) {
  const now = performance.now();
  if (keys.has(action) && now - state.lastInput > cooldown) {
    state.lastInput = now;
    return true;
  }
  return false;
}

function initPlayer(pilot) {
  return {
    pilot,
    money: 0,
    lives: 3,
    continues: 2,
    score: 0,
    weaponType: 'bomb',
    subAmmo: 10,
    engineLevel: 0,
    gunLevel: 0,
  };
}

function startCampaign() {
  state.playerSlots[0] = initPlayer(pilots[state.pilotIndex]);
  state.playerSlots[1] = initPlayer(pilots[(state.pilotIndex + 1) % pilots.length]);
  state.activePlayer = 0;
  state.scene = 'mission-select';
  state.cursor = 0;
}

function launchMission(missionIndex) {
  const p = state.playerSlots[state.activePlayer];
  const mission = missions[missionIndex];
  state.game = {
    mission,
    t: 0,
    scrollX: 0,
    player: {
      x: WIDTH * 0.2,
      y: HEIGHT * 0.5,
      hp: p.pilot.armor * 25,
      maxHp: p.pilot.armor * 25,
      gunTimer: 0,
      subTimer: 0,
      invuln: 0,
    },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    effects: [],
    boss: null,
    done: false,
    rewardPaid: false,
  };
  state.scene = 'stage';
}

function spawnWave(g, dt) {
  const t = g.t;
  const difficulty = g.mission.difficulty;
  if (!g.boss && t > g.mission.length - 16) {
    g.boss = {
      x: WIDTH + 260,
      y: HEIGHT * 0.5,
      w: 220,
      h: 160,
      hp: 380 + difficulty * 180,
      maxHp: 380 + difficulty * 180,
      phase: 1,
      fireTimer: 0,
      value: 1100 + difficulty * 350,
      name: g.mission.bossName,
    };
  }

  const interval = 2.0 - difficulty * 0.2;
  if (Math.floor((t - dt) / interval) !== Math.floor(t / interval) && !g.boss) {
    const count = 2 + difficulty;
    for (let i = 0; i < count; i++) {
      g.enemies.push({
        type: 'air',
        x: WIDTH + i * 80,
        y: 80 + Math.random() * (HEIGHT - 200),
        hp: 14 + difficulty * 6,
        speed: 130 + Math.random() * 60,
        wave: Math.random() * Math.PI * 2,
        value: 40 + difficulty * 20,
      });
    }
  }

  const groundInterval = 3.2 - difficulty * 0.2;
  if (Math.floor((t - dt) / groundInterval) !== Math.floor(t / groundInterval) && !g.boss) {
    g.enemies.push({
      type: 'ground',
      x: WIDTH + 50,
      y: HEIGHT - 62,
      hp: 26 + difficulty * 10,
      speed: 120,
      value: 70 + difficulty * 25,
    });
  }
}

function firePrimary(g, dt) {
  const pData = state.playerSlots[state.activePlayer];
  const player = g.player;
  player.gunTimer -= dt;
  if (!press('j') || player.gunTimer > 0) return;

  player.gunTimer = pData.pilot.fireRate;
  const lanes = 1 + pData.gunLevel;
  const spread = 14;
  for (let i = 0; i < lanes; i++) {
    const offset = (i - (lanes - 1) / 2) * spread;
    g.bullets.push({ x: player.x + 30, y: player.y + offset, vx: 520, vy: 0, dmg: 8, type: 'gun' });
  }
}

function fireSub(g, dt) {
  const pData = state.playerSlots[state.activePlayer];
  const spec = subWeapons[pData.weaponType];
  const player = g.player;
  player.subTimer -= dt;
  if (!press('k') || player.subTimer > 0 || pData.subAmmo <= 0) return;
  player.subTimer = spec.cooldown;
  pData.subAmmo--;

  if (pData.weaponType === 'bomb') {
    g.bullets.push({ x: player.x + 10, y: player.y + 22, vx: 180, vy: 280, dmg: spec.dmg, type: 'bomb' });
  } else if (pData.weaponType === 'missile') {
    g.bullets.push({ x: player.x + 26, y: player.y - 8, vx: 360, vy: -40, dmg: spec.dmg, type: 'missile' });
    g.bullets.push({ x: player.x + 26, y: player.y + 8, vx: 360, vy: 40, dmg: spec.dmg, type: 'missile' });
  } else {
    g.bullets.push({ x: player.x + 20, y: player.y, vx: 280, vy: 240, dmg: spec.dmg, type: 'napalm' });
  }
}

function hit(a, aw, ah, b, bw, bh) {
  return Math.abs(a.x - b.x) * 2 < aw + bw && Math.abs(a.y - b.y) * 2 < ah + bh;
}

function updateStage(dt) {
  const g = state.game;
  const pData = state.playerSlots[state.activePlayer];
  g.t += dt;
  g.scrollX += (130 + g.mission.difficulty * 18) * dt;

  const moveSpeed = pData.pilot.speed * (1 + pData.engineLevel * 0.08);
  const dx = (press('arrowright') || press('d') ? 1 : 0) - (press('arrowleft') || press('a') ? 1 : 0);
  const dy = (press('arrowdown') || press('s') ? 1 : 0) - (press('arrowup') || press('w') ? 1 : 0);
  g.player.x = Math.max(40, Math.min(WIDTH * 0.5, g.player.x + dx * moveSpeed * dt));
  g.player.y = Math.max(30, Math.min(HEIGHT - 70, g.player.y + dy * moveSpeed * dt));
  g.player.invuln = Math.max(0, g.player.invuln - dt);

  firePrimary(g, dt);
  fireSub(g, dt);
  spawnWave(g, dt);

  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.type === 'bomb' || b.type === 'napalm') b.vy += 240 * dt;
  }
  g.bullets = g.bullets.filter((b) => b.x < WIDTH + 80 && b.y < HEIGHT + 80 && b.y > -80);

  for (const e of g.enemies) {
    e.x -= e.speed * dt;
    if (e.type === 'air') {
      e.wave += dt * 4;
      e.y += Math.sin(e.wave) * 40 * dt;
      if (Math.random() < 0.012) g.enemyBullets.push({ x: e.x - 10, y: e.y, vx: -260, vy: Math.sin(e.wave) * 45, dmg: 8 });
    } else {
      if (Math.random() < 0.014) g.enemyBullets.push({ x: e.x - 16, y: e.y - 14, vx: -220, vy: -20, dmg: 10 });
    }
  }

  if (g.boss) {
    const b = g.boss;
    b.x = Math.max(WIDTH - 240, b.x - 80 * dt);
    b.fireTimer -= dt;
    if (b.hp < b.maxHp * 0.55) b.phase = 2;
    if (b.hp < b.maxHp * 0.25) b.phase = 3;
    if (b.fireTimer <= 0) {
      b.fireTimer = Math.max(0.28, 0.62 - b.phase * 0.12);
      const volleys = 2 + b.phase;
      for (let i = 0; i < volleys; i++) {
        const angle = -0.38 + (i / Math.max(1, volleys - 1)) * 0.76;
        g.enemyBullets.push({ x: b.x - 95, y: b.y - 40 + i * 35, vx: -230, vy: Math.sin(angle) * 150, dmg: 13 + b.phase * 2 });
      }
    }
  }

  for (const eb of g.enemyBullets) {
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
  }
  g.enemyBullets = g.enemyBullets.filter((b) => b.x > -50 && b.y > -40 && b.y < HEIGHT + 40);

  for (const bullet of g.bullets) {
    for (const enemy of g.enemies) {
      const targetH = enemy.type === 'ground' ? 28 : 20;
      if (hit(bullet, 8, 8, enemy, 36, targetH)) {
        if (enemy.type === 'ground' && bullet.type === 'gun') continue;
        enemy.hp -= bullet.dmg;
        bullet.x = WIDTH + 500;
        if (enemy.hp <= 0) {
          pData.money += enemy.value;
          pData.score += enemy.value;
          g.effects.push({ x: enemy.x, y: enemy.y, t: 0.36, r: 20 });
          if (Math.random() < 0.2) {
            pData.money += 60;
          }
        }
      }
    }

    if (g.boss && hit(bullet, 8, 8, g.boss, g.boss.w, g.boss.h)) {
      g.boss.hp -= bullet.dmg;
      bullet.x = WIDTH + 500;
      g.effects.push({ x: bullet.x - 500, y: bullet.y, t: 0.15, r: 10 });
    }
  }

  g.enemies = g.enemies.filter((e) => e.hp > 0 && e.x > -80);

  if (g.player.invuln <= 0) {
    for (const eb of g.enemyBullets) {
      if (hit(g.player, 34, 24, eb, 8, 8)) {
        g.player.hp -= eb.dmg;
        eb.x = -999;
        g.player.invuln = 1.0;
      }
    }
    for (const e of g.enemies) {
      if (hit(g.player, 30, 20, e, 36, 20)) {
        g.player.hp -= 18;
        g.player.invuln = 1.0;
      }
    }
    if (g.boss && hit(g.player, 30, 20, g.boss, g.boss.w, g.boss.h)) {
      g.player.hp = 0;
    }
  }

  if (g.boss && g.boss.hp <= 0) {
    if (!g.rewardPaid) {
      pData.money += g.boss.value;
      pData.score += g.boss.value;
      state.missionClear.add(g.mission.id);
      g.rewardPaid = true;
      g.done = true;
      state.msg = `${g.mission.name} cleared by ${pData.pilot.name}! +$${g.boss.value}`;
    }
  }

  if (g.player.hp <= 0) {
    pData.lives -= 1;
    if (pData.lives < 0 && pData.continues > 0) {
      pData.continues -= 1;
      pData.lives = 2;
    }
    if (pData.lives >= 0) {
      g.player.hp = g.player.maxHp;
      g.player.invuln = 2;
    } else {
      state.activePlayer = (state.activePlayer + 1) % 2;
      const nextP = state.playerSlots[state.activePlayer];
      if (nextP.lives >= 0) {
        state.msg = `${pData.pilot.name} down. ${nextP.pilot.name} takes point.`;
        launchMission(state.selectedMission);
        return;
      }
      state.scene = 'title';
      state.msg = 'All pilots lost. Press Enter to restart campaign.';
      return;
    }
  }

  if (g.done && tapped('enter')) {
    state.scene = 'shop';
    state.cursor = 0;
  }

  if (tapped('backspace') && !g.done) {
    state.scene = 'shop';
    state.msg = 'Sortie aborted. Rearm at the shop.';
  }

  g.effects = g.effects.filter((fx) => (fx.t -= dt) > 0);
}

function drawBackground(theme, scroll) {
  const x = scroll % WIDTH;
  const palettes = {
    desert: ['#5f7896', '#a48c62', '#7f6a4b'],
    ocean: ['#5a7fab', '#2c6e9d', '#1f4d76'],
    forest: ['#577d70', '#35614f', '#2e4c35'],
    urban: ['#6b7786', '#4b545f', '#32373f'],
  };
  const [sky, mid, fore] = palettes[theme] || palettes.desert;

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = mid;
  for (let i = -1; i < 6; i++) {
    ctx.fillRect((i * 220 - x * 0.45), HEIGHT - 200 + Math.sin((i + scroll * 0.01)) * 22, 180, 120);
  }

  ctx.fillStyle = fore;
  for (let i = -1; i < 8; i++) {
    const bx = i * 160 - x * 0.8;
    ctx.fillRect(bx, HEIGHT - 70, 120, 70);
    if (theme === 'urban') ctx.fillRect(bx + 15, HEIGHT - 150, 50, 80);
  }
}

function drawPlane(x, y, color = '#f5f5f5') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + 30, y);
  ctx.lineTo(x - 14, y - 10);
  ctx.lineTo(x - 6, y);
  ctx.lineTo(x - 14, y + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillRect(x - 4, y - 20, 8, 40);
}

function renderStage() {
  const g = state.game;
  const p = state.playerSlots[state.activePlayer];
  drawBackground(g.mission.theme, g.scrollX);

  for (const enemy of g.enemies) {
    if (enemy.type === 'air') {
      drawPlane(enemy.x, enemy.y, '#ffd37d');
    } else {
      ctx.fillStyle = '#d08a4b';
      ctx.fillRect(enemy.x - 18, enemy.y - 10, 36, 20);
      ctx.fillStyle = '#734d2d';
      ctx.fillRect(enemy.x - 8, enemy.y - 18, 16, 10);
    }
  }

  if (g.boss) {
    ctx.fillStyle = '#d7dce2';
    ctx.fillRect(g.boss.x - g.boss.w / 2, g.boss.y - g.boss.h / 2, g.boss.w, g.boss.h);
    ctx.fillStyle = '#3e4148';
    ctx.fillRect(g.boss.x - g.boss.w / 2 + 20, g.boss.y - g.boss.h / 2 + 24, g.boss.w - 40, g.boss.h - 48);

    const bw = 380;
    const ratio = Math.max(0, g.boss.hp / g.boss.maxHp);
    ctx.fillStyle = '#240b13';
    ctx.fillRect((WIDTH - bw) / 2, 18, bw, 15);
    ctx.fillStyle = '#e04667';
    ctx.fillRect((WIDTH - bw) / 2, 18, bw * ratio, 15);
    ctx.fillStyle = 'white';
    ctx.fillText(`${g.boss.name} PHASE ${g.boss.phase}`, WIDTH / 2 - 62, 14);
  }

  for (const bullet of g.bullets) {
    ctx.fillStyle = bullet.type === 'gun' ? '#c5f4ff' : bullet.type === 'missile' ? '#ffcf6b' : '#ff7d5d';
    ctx.fillRect(bullet.x - 4, bullet.y - 2, 8, 4);
  }

  for (const b of g.enemyBullets) {
    ctx.fillStyle = '#ff5676';
    ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
  }

  for (const fx of g.effects) {
    const alpha = fx.t / 0.36;
    ctx.fillStyle = `rgba(255,180,80,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(fx.x, fx.y, fx.r * (1 - alpha + 0.25), 0, Math.PI * 2);
    ctx.fill();
  }

  if (g.player.invuln <= 0 || Math.floor(performance.now() / 80) % 2 === 0) {
    drawPlane(g.player.x, g.player.y, '#f7f9ff');
  }

  ctx.fillStyle = 'rgba(8,12,20,0.6)';
  ctx.fillRect(12, 12, 320, 90);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Pilot: ${p.pilot.name} | Lives: ${p.lives} | Continues: ${p.continues}`, 20, 32);
  ctx.fillText(`$${p.money}  Score:${p.score}  Sub:${subWeapons[p.weaponType].name}(${p.subAmmo})`, 20, 52);
  ctx.fillText(`HP: ${Math.max(0, Math.round(g.player.hp))}/${g.player.maxHp}  Mission: ${g.mission.name}`, 20, 72);

  if (g.done) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#f7d77b';
    ctx.font = 'bold 38px Segoe UI';
    ctx.fillText('MISSION COMPLETE', WIDTH / 2 - 190, HEIGHT / 2 - 10);
    ctx.font = '16px Segoe UI';
    ctx.fillStyle = '#fff';
    ctx.fillText('Press Enter to proceed to shop.', WIDTH / 2 - 110, HEIGHT / 2 + 24);
  }
}

function renderMenu(title, options, subtitle = '') {
  ctx.fillStyle = '#101722';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#f1f4ff';
  ctx.font = 'bold 42px Segoe UI';
  ctx.fillText(title, 50, 78);
  if (subtitle) {
    ctx.font = '18px Segoe UI';
    ctx.fillStyle = '#b9c8de';
    ctx.fillText(subtitle, 52, 106);
  }

  options.forEach((line, i) => {
    const y = 170 + i * 54;
    const selected = i === state.cursor;
    ctx.fillStyle = selected ? '#f6b300' : '#cedcf2';
    ctx.font = selected ? 'bold 28px Segoe UI' : '24px Segoe UI';
    ctx.fillText(`${selected ? '▶' : ' '} ${line}`, 64, y);
  });
}

function updateTitle() {
  renderMenu('AREA MERCENARY', ['Start Campaign', 'Pilot Briefing'], 'Mission-select military shooter prototype');
  if (tapped('arrowdown')) state.cursor = Math.min(1, state.cursor + 1);
  if (tapped('arrowup')) state.cursor = Math.max(0, state.cursor - 1);
  if (tapped('enter')) {
    if (state.cursor === 0) {
      state.scene = 'pilot-select';
      state.cursor = 0;
    } else {
      state.msg = 'Choose pilot, then purchase sub-weapons and upgrades before each sortie.';
    }
  }
}

function updatePilotSelect() {
  const options = pilots.map((p) => `${p.name}  SPD:${p.speed}  GUN:${(1 / p.fireRate).toFixed(1)}  ARM:${p.armor}`);
  renderMenu('PILOT SELECT', options, 'Pick your lead pilot. P2 auto-assigns next pilot for alternating play.');
  const p = pilots[state.cursor];
  ctx.fillStyle = '#95b3d8';
  ctx.font = '18px Segoe UI';
  ctx.fillText(p.desc, 64, HEIGHT - 64);

  if (tapped('arrowdown')) state.cursor = Math.min(pilots.length - 1, state.cursor + 1);
  if (tapped('arrowup')) state.cursor = Math.max(0, state.cursor - 1);
  if (tapped('enter')) {
    state.pilotIndex = state.cursor;
    startCampaign();
    state.msg = `Lead pilot set: ${p.name}.`;
  }
  if (tapped('backspace')) {
    state.scene = 'title';
    state.cursor = 0;
  }
}

function updateMissionSelect() {
  const p = state.playerSlots[state.activePlayer];
  const options = missions.map((m) => {
    const clear = state.missionClear.has(m.id) ? '✔' : ' ';    
    return `[${clear}] ${m.name}  (Threat ${m.difficulty})`;
  });
  renderMenu(`MISSION SELECT - ${p.pilot.name}`, options, `Funds: $${p.money} | Choose non-linear stage order`);
  if (tapped('arrowdown')) state.cursor = Math.min(missions.length - 1, state.cursor + 1);
  if (tapped('arrowup')) state.cursor = Math.max(0, state.cursor - 1);
  if (tapped('enter')) {
    state.selectedMission = state.cursor;
    state.scene = 'shop';
    state.cursor = 0;
  }
}

function updateShop() {
  const p = state.playerSlots[state.activePlayer];
  const mission = missions[state.selectedMission];
  const choices = [
    `${subWeapons.bomb.name} ammo (+${subWeapons.bomb.ammo})  $${subWeapons.bomb.cost}`,
    `${subWeapons.missile.name} ammo (+${subWeapons.missile.ammo})  $${subWeapons.missile.cost}`,
    `${subWeapons.napalm.name} ammo (+${subWeapons.napalm.ammo})  $${subWeapons.napalm.cost}`,
    `${economy.engineUpgrade.name} Lv.${p.engineLevel}/${economy.engineUpgrade.max}  $${economy.engineUpgrade.cost}`,
    `${economy.gunUpgrade.name} Lv.${p.gunLevel}/${economy.gunUpgrade.max}  $${economy.gunUpgrade.cost}`,
    `Launch Mission: ${mission.name}`,
  ];
  renderMenu(`SHOP - ${p.pilot.name}`, choices, `Money: $${p.money} | Active sub-weapon: ${subWeapons[p.weaponType].name}`);

  if (tapped('arrowdown')) state.cursor = Math.min(choices.length - 1, state.cursor + 1);
  if (tapped('arrowup')) state.cursor = Math.max(0, state.cursor - 1);

  if (tapped('enter')) {
    if (state.cursor <= 2) {
      const type = ['bomb', 'missile', 'napalm'][state.cursor];
      const s = subWeapons[type];
      if (p.money >= s.cost) {
        p.money -= s.cost;
        p.weaponType = type;
        p.subAmmo += s.ammo;
        state.msg = `${s.name} resupplied. Ammo now ${p.subAmmo}.`;
      } else state.msg = 'Insufficient funds for ordnance.';
    } else if (state.cursor === 3) {
      if (p.engineLevel >= economy.engineUpgrade.max) {
        state.msg = 'Engine already maxed.';
      } else if (p.money >= economy.engineUpgrade.cost) {
        p.money -= economy.engineUpgrade.cost;
        p.engineLevel++;
        state.msg = 'Engine tuned for faster response.';
      } else state.msg = 'Insufficient funds for engine upgrade.';
    } else if (state.cursor === 4) {
      if (p.gunLevel >= economy.gunUpgrade.max) {
        state.msg = 'Gun system already maxed.';
      } else if (p.money >= economy.gunUpgrade.cost) {
        p.money -= economy.gunUpgrade.cost;
        p.gunLevel++;
        state.msg = 'Primary gun spread increased.';
      } else state.msg = 'Insufficient funds for gun upgrade.';
    } else {
      launchMission(state.selectedMission);
    }
  }

  if (tapped('backspace')) {
    state.scene = 'mission-select';
    state.cursor = state.selectedMission;
  }
}

function render() {
  ctx.font = '16px Segoe UI';
  ctx.textBaseline = 'top';
  statusLine.textContent = state.msg;

  if (state.scene === 'title') updateTitle();
  else if (state.scene === 'pilot-select') updatePilotSelect();
  else if (state.scene === 'mission-select') updateMissionSelect();
  else if (state.scene === 'shop') updateShop();
  else if (state.scene === 'stage') renderStage();
}

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (state.scene === 'stage') updateStage(dt);
  render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

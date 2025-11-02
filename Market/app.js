// drošībai: gaidām DOM
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const btnReset = document.getElementById("btnReset");

  // ===== Kartei NEKAD vairs neliekam fiksētu platumu/augstumu =====
  const TILE = 32;
  const MAP = [
    "....................................",
    "....========+==========+=========...",
    "....=......|..........|.......=....",
    "....=......|..........|.......=....",
    "....=......|..........|.......=....",
    "....=......+==========+.......=....",
    "....=..........................=....",
    "....=......+==========+.......=....",
    "....=......|..........|.......=....",
    "....=......|..........|.......=....",
    "....=......+==========+.......=....",
    "....=..........................=....",
    "....=......+==========+.......=....",
    "....=......|..........|.......=....",
    "....=......|..........|.......=....",
    "....=......+==========+.......=....",
    "....=..........................=....",
    "....========+==========+=========...",
    "....................................",
    "....................................",
  ];
  const MAP_W = MAP[0].length;
  const MAP_H = MAP.length;

  // Uzstādām kanvas īstos izmērus pēc kartes
  canvas.width  = MAP_W * TILE;
  canvas.height = MAP_H * TILE;

  // Satiksmes gaisma
  const TRAFFIC_LIGHT = { tx: 10, ty: 1, cycleMs: 4000 };
  let lightState = "NS", lightTimer = 0;

  // Ievade
  const keys = new Set();

  // Spēlētājs
  const player = {
    x: TILE * 6 + TILE/2, y: TILE * 9 + TILE/2,
    angle: 0, speed: 0,
    maxSpeed: 3.0, accel: 0.12, brake: 0.28, friction: 0.05, turn: 0.04,
    radius: 12, color: "#2563eb"
  };

  // NPC
  let npcs = [];

  // Palīgfunkcijas
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  function isRoad(t){ return t==='='||t==='|'||t==='+'; }
  function collideCircleWithMap(x, y, r){
    const minTx = Math.floor((x - r) / TILE);
    const maxTx = Math.floor((x + r) / TILE);
    const minTy = Math.floor((y - r) / TILE);
    const maxTy = Math.floor((y + r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty++){
      for (let tx = minTx; tx <= maxTx; tx++){
        if (tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return true;
        const t = MAP[ty][tx];
        if (!isRoad(t)){
          const rx = clamp(x, tx*TILE, tx*TILE+TILE);
          const ry = clamp(y, ty*TILE, ty*TILE+TILE);
          const dx = x-rx, dy = y-ry;
          if (dx*dx + dy*dy < r*r) return true;
        }
      }
    }
    return false;
  }

  function drawMap(){
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        const t = MAP[y][x];
        ctx.fillStyle = (t==='.' ? "#94a3b8" : (t==='+' ? "#d1d5db" : "#cbd5e1"));
        ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
      }
    }
    // Luksofors
    const {tx,ty} = TRAFFIC_LIGHT;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(tx*TILE+TILE-10, ty*TILE+2, 8, 20);
    ctx.fillStyle = (lightState==='NS') ? "#22c55e" : "#ef4444";
    ctx.beginPath(); ctx.arc(tx*TILE+TILE-6, ty*TILE+8, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = (lightState==='EW') ? "#22c55e" : "#ef4444";
    ctx.beginPath(); ctx.arc(tx*TILE+TILE-6, ty*TILE+18, 4, 0, Math.PI*2); ctx.fill();
  }

  function drawCar(car){
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = car.color; ctx.fillRect(-10,-16,20,32);
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillRect(-8,-12,16,8);
    ctx.restore();
  }

  function handlePlayer(dt){
    if (keys.has("ArrowUp")) player.speed += player.accel*dt;
    else if (keys.has("ArrowDown")) player.speed -= player.accel*dt*0.8;
    else {
      if (player.speed>0) player.speed = Math.max(0, player.speed-0.05*dt);
      else if (player.speed<0) player.speed = Math.min(0, player.speed+0.05*dt);
    }
    if (keys.has(" ")) {
      if (player.speed>0) player.speed = Math.max(0, player.speed-0.28*dt);
      else if (player.speed<0) player.speed = Math.min(0, player.speed+0.28*dt);
    }
    player.speed = clamp(player.speed, -1.5, player.maxSpeed);

    const steer = (keys.has("ArrowLeft")?-1:0) + (keys.has("ArrowRight")?1:0);
    if (steer!==0 && Math.abs(player.speed)>0.05){
      player.angle += steer * 0.04 * dt * (player.speed>=0?1:-1);
    }

    const nx = player.x + Math.cos(player.angle)*player.speed;
    const ny = player.y + Math.sin(player.angle)*player.speed;
    if (!collideCircleWithMap(nx, ny, player.radius)){ player.x = nx; player.y = ny; }
    else player.speed *= 0.3;
  }

  function makeNPC(path,color="#16a34a",speed=1.6){
    const s = path[0];
    return { x:s.x, y:s.y, angle:0, speed, radius:11, color, path, i:0, wait:0 };
  }
  function nearTrafficLight(ent){
    const cx = TRAFFIC_LIGHT.tx*TILE + TILE/2;
    const cy = TRAFFIC_LIGHT.ty*TILE + TILE/2;
    return Math.hypot(ent.x-cx, ent.y-cy) < TILE*1.1;
  }
  function lightAllows(ent){
    const vx = Math.cos(ent.angle), vy = Math.sin(ent.angle);
    const horiz = Math.abs(vx) > Math.abs(vy);
    return horiz ? (lightState==="EW") : (lightState==="NS");
  }
  function updateNPC(npc, dt){
    if (npc.wait>0){ npc.wait -= dt; return; }
    const tgt = npc.path[npc.i];
    const dx = tgt.x-npc.x, dy = tgt.y-npc.y, dist = Math.hypot(dx,dy);
    const desired = Math.atan2(dy,dx);
    let diff = desired - npc.angle;
    while (diff>Math.PI) diff -= Math.PI*2;
    while (diff<-Math.PI) diff += Math.PI*2;
    npc.angle += clamp(diff, -0.05*dt, 0.05*dt);

    if (nearTrafficLight(npc) && !lightAllows(npc)){ npc.wait = 10; return; }

    const step = Math.min(dist, npc.speed*dt);
    const nx = npc.x + Math.cos(npc.angle)*step;
    const ny = npc.y + Math.sin(npc.angle)*step;
    if (!collideCircleWithMap(nx, ny, npc.radius)){ npc.x = nx; npc.y = ny; }
    if (dist < 2) npc.i = (npc.i+1) % npc.path.length;
  }

  function resetGame(){
    player.x = TILE*6 + TILE/2; player.y = TILE*9 + TILE/2; player.angle = 0; player.speed = 0;
    npcs = [
      makeNPC([{x:TILE*5+16,y:TILE*1+16},{x:TILE*17+16,y:TILE*1+16},{x:TILE*17+16,y:TILE*5+16},
               {x:TILE*5+16,y:TILE*5+16},{x:TILE*5+16,y:TILE*1+16}], "#f59e0b", 1.7),
      makeNPC([{x:TILE*10+16,y:TILE*1+16},{x:TILE*10+16,y:TILE*10+16},{x:TILE*18+16,y:TILE*10+16},
               {x:TILE*18+16,y:TILE*1+16},{x:TILE*10+16,y:TILE*1+16}], "#10b981", 1.5)
    ];
    lightState="NS"; lightTimer=0;
  }

  // ievade
  window.addEventListener("keydown", (e)=>{
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)){ keys.add(e.key); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e)=> keys.delete(e.key));
  btnReset.addEventListener("click", resetGame);

  // cikls
  let last = performance.now();
  function loop(t){
    const dt = Math.min(33, t-last); last = t;
    // luksofors
    lightTimer += dt; if (lightTimer >= TRAFFIC_LIGHT.cycleMs/2){ lightState = (lightState==="NS")?"EW":"NS"; lightTimer=0; }

    handlePlayer(dt);
    for (const n of npcs) updateNPC(n, dt);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawMap();
    for (const n of npcs) drawCar(n);
    drawCar(player);
    requestAnimationFrame(loop);
  }

  // start
  resetGame();
  requestAnimationFrame(loop);

  // Ātra diagnostika: ja kāds fails neielādējas, parādām lietotājam
  console.info("Game boot OK. Canvas:", canvas.width, "x", canvas.height);
});

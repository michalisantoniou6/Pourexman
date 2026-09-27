(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const startButton = document.querySelector('#startButton');
  const soundButton = document.querySelector('#soundButton');
  const ghostBoing = document.querySelector('#ghostBoing');
  const ghostOhNo = document.querySelector('#ghostOhNo');
  const progressText = document.querySelector('#progressText');
  const starsCount = document.querySelector('#starsCount');
  const message = document.querySelector('#message');
  const starTrail = document.querySelector('#starTrail');
  const colorCue = document.querySelector('#colorCue');
  const map = [
    '###########',
    '#.........#',
    '#..##.##..#',
    '#.........#',
    '#.#.....#.#',
    '#.........#',
    '#..##.##..#',
    '#.........#',
    '###########'
  ];
  const tile = 64;
  const stepMs = 150;
  const dirs = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
  const starColors = [
    {name:'Red',color:'#ff697c'},
    {name:'Blue',color:'#55c8ff'},
    {name:'Green',color:'#78e69b'},
    {name:'Purple',color:'#d99aff'},
    {name:'Orange',color:'#ffad5e'},
    {name:'Yellow',color:'#ffe36c'},
    {name:'Pink',color:'#ff91d1'},
    {name:'Turquoise',color:'#5ee7d8'}
  ];
  const starSpots = [[1,1],[9,1],[5,4],[1,7],[9,7],[2,3],[8,3],[3,5],[7,5],[5,1]];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let player, stars, dots, ghosts, found, playing, soundOn = true, ghostTimer, ghostBumpTimer, autoTimer, travelTimer, turnTimer, cueTimer, nextRoundTimer, celebrateTimer;
  let audioContext, musicTimer, nextBeat = 0, musicStep = 0;
  let lastGhostAt = 0, ghostBumpCount = 0, effects = [], animationStarted = false, lastFrame = 0, round = 0, lastStarCount = 0, chompCount = 0, hasStarted = false, desiredDirection = null;
  const activeNotes = new Set();
  const melody = [523,0,659,0,784,659,523,0,587,0,659,0,784,659,587,0,523,659,784,0,880,784,659,0,587,659,523,0,392,0,523,0];

  function updateTrail() {
    starTrail.innerHTML = stars.map(s => `<span class="trail-star${s.found ? ' found' : ''}" style="--star-color:${s.color}" aria-hidden="true">★</span>`).join('');
    starTrail.setAttribute('aria-label', `${found} of ${stars.length} stars found`);
  }
  function shuffled(items) {
    const copy = [...items];
    for (let i=copy.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  }
  function ensureAudio() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!soundOn || !Audio) return null;
    try {
      audioContext ??= new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch (_) { return null; }
  }
  function tone(frequency, startAt, length, volume = .08, type = 'triangle') {
    if (!audioContext || !soundOn) return;
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + .018);
      gain.gain.exponentialRampToValueAtTime(.001, startAt + length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.onended = () => activeNotes.delete(oscillator);
      activeNotes.add(oscillator);
      oscillator.start(startAt); oscillator.stop(startAt + length + .02);
    } catch (_) { /* Visual play still works when audio is unavailable. */ }
  }
  function note(frequency, delay, length, volume = .08, type = 'triangle') {
    if (ensureAudio()) tone(frequency, audioContext.currentTime + delay, length, volume, type);
  }
  function boing() {
    if (!ensureAudio()) return;
    try {
      const at = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(620, at);
      oscillator.frequency.exponentialRampToValueAtTime(175, at + .3);
      gain.gain.setValueAtTime(.001, at);
      gain.gain.linearRampToValueAtTime(.18, at + .025);
      gain.gain.exponentialRampToValueAtTime(.001, at + .34);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.onended = () => activeNotes.delete(oscillator);
      activeNotes.add(oscillator);
      oscillator.start(at); oscillator.stop(at + .36);
    } catch (_) { note(440, 0, .2, .1); }
  }
  function playGhostVoice(clip) {
    if (!soundOn || document.hidden) return;
    try {
      ghostBoing.pause(); ghostOhNo.pause();
      clip.currentTime = 0;
      clip.volume = .9;
      clip.play().catch(() => {});
    } catch (_) { /* The visual reaction still works without audio. */ }
  }
  function scheduleMusic() {
    if (!audioContext || !soundOn || document.hidden) return;
    while (nextBeat < audioContext.currentTime + .35) {
      const step = musicStep % melody.length;
      if (melody[step]) tone(melody[step], nextBeat, .21, .11);
      if (step % 4 === 0) tone([131,147,175,147][Math.floor(step/8)%4], nextBeat, .37, .055, 'sine');
      if (step % 4 === 2) tone(196, nextBeat, .055, .022, 'sine');
      nextBeat += .25; musicStep++;
    }
  }
  function startMusic() {
    if (!ensureAudio() || musicTimer) return;
    nextBeat = audioContext.currentTime + .04;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 100);
  }
  function stopNotes() {
    clearInterval(musicTimer); musicTimer = null;
    activeNotes.forEach(oscillator => { try { oscillator.stop(); } catch (_) {} });
    activeNotes.clear();
  }
  function showCue(star) {
    colorCue.textContent = `★ ${star.name}! ${found} of ${stars.length}!`;
    colorCue.style.borderColor = star.color;
    colorCue.classList.remove('show');
    void colorCue.offsetWidth;
    colorCue.classList.add('show');
    clearTimeout(cueTimer);
    cueTimer = setTimeout(() => colorCue.classList.remove('show'), 1250);
  }
  function startAnimation() {
    if (animationStarted || reducedMotion || !window.requestAnimationFrame) return;
    animationStarted = true;
    const frame = time => {
      if (time - lastFrame > 16) { draw(Date.now()); lastFrame = time; }
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }

  function resetRound() {
    clearInterval(ghostTimer); clearInterval(autoTimer); clearInterval(travelTimer); clearTimeout(turnTimer); clearTimeout(ghostBumpTimer);
    clearTimeout(cueTimer); clearTimeout(nextRoundTimer); clearTimeout(celebrateTimer);
    player = {x:5,y:7,fromX:5,fromY:7,movedAt:0,dir:'right',bumpedAt:0};
    let starCount = 3 + Math.floor(Math.random()*5);
    if (starCount === lastStarCount) starCount = 3 + ((starCount-3+1+Math.floor(Math.random()*4))%5);
    lastStarCount = starCount;
    const spots = shuffled(starSpots), colors = shuffled(starColors);
    stars = Array.from({length:starCount},(_,i) => {
      const [x,y] = spots[i];
      const color = colors[i];
      return {x,y,name:color.name,color:color.color,found:false};
    });
    dots = new Set();
    map.forEach((row,y) => [...row].forEach((cell,x) => { if(cell === '.' && !stars.some(s => s.x === x && s.y === y)) dots.add(`${x},${y}`); }));
    ghosts = [{x:5,y:1,color:'#ff8fa8',last:'left'},{x:5,y:5,color:'#7ad6f2',last:'right'}];
    found = 0; playing = hasStarted; lastGhostAt = 0; effects = []; desiredDirection = null;
    progressText.textContent = round ? `Round ${round+1}: find ${starCount} stars!` : `Find the ${starCount} colorful stars!`;
    starsCount.textContent = `⭐ 0 / ${starCount}`;
    message.textContent = 'Use your arrow keys to find the stars!';
    colorCue.classList.remove('show');
    updateTrail();
    draw(Date.now());
    startAnimation();
    if (playing) ghostTimer = setInterval(moveGhosts, 850);
  }
  function open(x,y) { return map[y]?.[x] === '.'; }
  function start() {
    if (hasStarted) return;
    hasStarted = true; playing = true; ghostTimer = setInterval(moveGhosts, 850);
    overlay.classList.add('hidden');
    startButton.blur();
    startMusic();
    note(784, .04, .2, .12); note(1047, .24, .34, .12);
  }
  function move(direction) {
    if (!playing) return false;
    player.dir = direction;
    const [dx,dy] = dirs[direction];
    const x = player.x + dx, y = player.y + dy;
    if (!open(x,y)) { draw(Date.now()); return false; }
    player.fromX = player.x; player.fromY = player.y; player.movedAt = Date.now();
    player.x = x; player.y = y;
    if (dots.delete(`${x},${y}`) && ++chompCount % 2 === 0) note(chompCount % 4 ? 220 : 260, 0, .07, .035);
    const star = stars.find(s => !s.found && s.x === x && s.y === y);
    if (star) {
      star.found = true; found++;
      starsCount.textContent = `⭐ ${found} / ${stars.length}`;
      progressText.textContent = found === stars.length ? 'You found every star!' : `${stars.length-found} more to find!`;
      message.textContent = `${star.name} star! Let’s count: ${found}!`;
      updateTrail(); showCue(star);
      if (!reducedMotion) effects.push({x:x*tile+32,y:y*tile+32,color:star.color,started:Date.now()});
      note([523,587,659,698,784,880,988][found-1], 0, .22, .14);
      note([784,880,988,1047,1175,1319,1568][found-1], .14, .34, .12);
      if (found === stars.length) {
        playing = false; clearInterval(ghostTimer); clearInterval(autoTimer); clearInterval(travelTimer); clearTimeout(turnTimer); clearTimeout(ghostBumpTimer);
        progressText.textContent = `Hooray! ${stars.length} stars!`;
        message.textContent = 'Hooray! Here comes a new adventure!';
        note(784, .42, .19, .14); note(880, .64, .19, .14); note(1047, .86, .5, .16);
        if (!reducedMotion) effects.push(...stars.map(s => ({x:s.x*tile+32,y:s.y*tile+32,color:s.color,started:Date.now()+650})));
        celebrateTimer = setTimeout(() => {
          colorCue.textContent = `🎉 ${stars.length} STARS! 🎉`;
          colorCue.style.borderColor = '#ffd449';
          colorCue.classList.remove('show'); void colorCue.offsetWidth; colorCue.classList.add('show');
        }, 1300);
        nextRoundTimer = setTimeout(() => {round++;resetRound();}, 3100);
      }
    }
    checkGhost(); draw(Date.now());
    return true;
  }
  function checkGhost() {
    if (!playing) return;
    const ghost = ghosts.find(g => g.x === player.x && g.y === player.y);
    if (!ghost || Date.now() - lastGhostAt < 1100) return;
    const travelLeft = 500 - (Date.now() - (ghost.movedAt || 0));
    if (travelLeft > 0) {
      clearTimeout(ghostBumpTimer);
      ghostBumpTimer = setTimeout(checkGhost, travelLeft);
      return;
    }
    lastGhostAt = Date.now(); ghost.stunnedUntil = lastGhostAt + 1050; player.bumpedAt = lastGhostAt;
    const saysBoing = ghostBumpCount++ % 2 === 0;
    const reaction = saysBoing ? 'BOING!' : 'OH NO!';
    message.textContent = `${reaction} The silly ghost wiggled!`;
    effects.push({x:ghost.x*tile+32,y:ghost.y*tile+32,color:ghost.color,started:lastGhostAt,kind:'boing',reaction});
    boing();
    playGhostVoice(saysBoing ? ghostBoing : ghostOhNo);
  }
  function moveGhosts() {
    if (!playing) return;
    ghosts.forEach(g => {
      if (g.stunnedUntil > Date.now()) return;
      const choices = Object.entries(dirs).filter(([,d]) => open(g.x+d[0],g.y+d[1]));
      const choice = choices[Math.floor(Math.random()*choices.length)];
      if (choice) { g.fromX=g.x; g.fromY=g.y; g.movedAt=Date.now(); g.last=choice[0]; g.x+=choice[1][0]; g.y+=choice[1][1]; }
    });
    checkGhost(); draw();
  }
  function roundRect(x,y,w,h,r,fill) { ctx.fillStyle=fill; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill(); }
  function starShape(cx,cy,r,color) {
    ctx.beginPath();
    for(let i=0;i<10;i++) { const a=-Math.PI/2+i*Math.PI/5, d=i%2?r*.48:r; const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
    ctx.closePath(); ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=18; ctx.fill(); ctx.shadowBlur=0;
  }
  function draw(time = Date.now()) {
    ctx.fillStyle='#080b1d';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<map.length;y++) for(let x=0;x<map[y].length;x++) {
      const px=x*tile,py=y*tile;
      if(map[y][x]==='#') {
        roundRect(px+4,py+4,tile-8,tile-8,9,'#367aff');
        roundRect(px+10,py+10,tile-20,tile-20,6,'#10183d');
      } else {
        roundRect(px+3,py+3,tile-6,tile-6,6,(x+y)%2?'#0a1028':'#0d1430');
        if(dots.has(`${x},${y}`)) {ctx.beginPath();ctx.arc(px+32,py+32,4,0,Math.PI*2);ctx.fillStyle='#ffe18b';ctx.fill();}
      }
    }
    stars.filter(s=>!s.found).forEach((s,i)=>{
      const twinkle = reducedMotion ? 0 : Math.sin(time/370+i*1.7)*2;
      starShape(s.x*tile+32,s.y*tile+32,24+twinkle,s.color);
    });
    ghosts.forEach((g,i)=>{
      const float = reducedMotion ? 0 : Math.sin(time/410+i*2)*2;
      const hitTime = time - (g.stunnedUntil - 1050);
      const hit = g.stunnedUntil > time && !reducedMotion;
      const wobble = hit ? Math.sin(hitTime/37)*Math.max(0, 9-hitTime/120) : 0;
      const ghostGlide = reducedMotion || hit ? 1 : Math.min(1,Math.max(0,(time-(g.movedAt||0))/500));
      const gx=(g.fromX ?? g.x)+((g.x)-(g.fromX ?? g.x))*ghostGlide;
      const gy=(g.fromY ?? g.y)+((g.y)-(g.fromY ?? g.y))*ghostGlide;
      const cx=gx*tile+32+wobble,cy=gy*tile+34+float;
      ctx.save();
      if (hit) {
        ctx.translate(cx,cy);
        ctx.rotate(Math.sin(hitTime/70)*.22*Math.max(0,1-hitTime/1050));
        const squash = 1 + Math.sin(hitTime/75)*.15*Math.max(0,1-hitTime/1050);
        ctx.scale(1/squash,squash);
        ctx.translate(-cx,-cy);
      }
      ctx.fillStyle=g.color;ctx.beginPath();ctx.arc(cx,cy-5,21,Math.PI,0);ctx.lineTo(cx+21,cy+18);ctx.quadraticCurveTo(cx+12,cy+10,cx+5,cy+18);ctx.quadraticCurveTo(cx,cy+11,cx-5,cy+18);ctx.quadraticCurveTo(cx-12,cy+10,cx-21,cy+18);ctx.closePath();ctx.fill();
      ctx.fillStyle='white';ctx.beginPath();ctx.arc(cx-8,cy-6,6,0,7);ctx.arc(cx+8,cy-6,6,0,7);ctx.fill();
      ctx.fillStyle='#25204e';ctx.beginPath();ctx.arc(cx-7,cy-5,2.5,0,7);ctx.arc(cx+9,cy-5,2.5,0,7);ctx.fill();
      if (hit) { ctx.strokeStyle='#25204e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy+7,4,0,Math.PI);ctx.stroke(); }
      ctx.restore();
    });
    const glide = reducedMotion ? 1 : Math.min(1,Math.max(0,(time-player.movedAt)/stepMs));
    const cx=(player.fromX+(player.x-player.fromX)*glide)*tile+32;
    const bounce = reducedMotion ? 0 : Math.sin(glide*Math.PI)*3;
    const bump = reducedMotion ? 0 : Math.sin((time-player.bumpedAt)/36)*Math.max(0,1-(time-player.bumpedAt)/520)*7;
    const cy=(player.fromY+(player.y-player.fromY)*glide)*tile+32-bounce+bump;
    const facing={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[player.dir];
    const mouth = reducedMotion ? .24 : .19 + .17*Math.abs(Math.sin(time/140));
    ctx.fillStyle='#e9a632';ctx.beginPath();ctx.moveTo(cx,cy+4);ctx.arc(cx,cy+4,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd645';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#10183d';ctx.beginPath();ctx.arc(cx+3,cy-13,3.2,0,Math.PI*2);ctx.fill();
    effects = effects.filter(effect => time - effect.started < (effect.kind==='boing'?850:650));
    effects.forEach(effect => {
      if (time < effect.started) return;
      const progress = Math.max(0,(time-effect.started)/(effect.kind==='boing'?850:650));
      if (effect.kind === 'boing') {
        ctx.globalAlpha=1-progress;
        ctx.strokeStyle='#fff4a8';ctx.lineWidth=5*(1-progress)+1;
        ctx.beginPath();ctx.arc(effect.x,effect.y,18+progress*48,0,Math.PI*2);ctx.stroke();
        ctx.font='bold 24px ui-rounded, sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff4a8';
        ctx.fillText(effect.reaction,effect.x,effect.y-26-progress*35);
        ctx.globalAlpha=1;
        return;
      }
      ctx.fillStyle=effect.color; ctx.globalAlpha=1-progress;
      for(let i=0;i<8;i++) {
        const angle=i*Math.PI/4, distance=10+progress*31;
        ctx.beginPath();ctx.arc(effect.x+Math.cos(angle)*distance,effect.y+Math.sin(angle)*distance,4-progress*2,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    });
  }
  function pathTo(targetX,targetY) {
    if (!playing || !open(targetX,targetY)) return;
    clearInterval(autoTimer); clearInterval(travelTimer); clearTimeout(turnTimer);
    const queue=[{x:player.x,y:player.y,path:[]}], seen=new Set([`${player.x},${player.y}`]);
    while(queue.length) {
      const p=queue.shift();
      if(p.x===targetX && p.y===targetY) {
        let i=0;
        const begin = () => {
          if (!playing || !p.path.length) return;
          move(p.path[i++]);
          autoTimer=setInterval(()=>{if(!playing || i>=p.path.length){clearInterval(autoTimer);return;}move(p.path[i++]);},stepMs);
        };
        const remaining = Math.max(0,stepMs-(Date.now()-player.movedAt));
        if (remaining) turnTimer=setTimeout(begin,remaining); else begin();
        return;
      }
      for(const [name,[dx,dy]] of Object.entries(dirs)) {const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(open(x,y)&&!seen.has(key)){seen.add(key);queue.push({x,y,path:[...p.path,name]});}}
    }
  }
  function steer(direction) {
    if (!playing) return;
    clearInterval(autoTimer); clearInterval(travelTimer); clearTimeout(turnTimer);
    desiredDirection = direction;
    const remaining = Math.max(0,stepMs-(Date.now()-player.movedAt));
    const turn = () => {
      if (!playing) return;
      const advance = () => {
        const [wantX,wantY] = dirs[desiredDirection];
        const next = open(player.x+wantX,player.y+wantY) ? desiredDirection : player.dir;
        if (!open(player.x+dirs[next][0],player.y+dirs[next][1])) return false;
        return move(next);
      };
      if (!advance()) return;
      travelTimer = setInterval(() => {
        if (!advance()) {clearInterval(travelTimer);travelTimer=null;}
      }, stepMs);
    };
    if (remaining) turnTimer=setTimeout(turn,remaining); else turn();
  }
  function nearestStar(x,y) {
    return stars.filter(s=>!s.found).sort((a,b)=>(a.x-x)**2+(a.y-y)**2-(b.x-x)**2-(b.y-y)**2)[0];
  }
  document.addEventListener('keydown',e=>{
    const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key];
    if(direction){e.preventDefault();if(!hasStarted)start();if(!e.repeat || desiredDirection !== direction)steer(direction);}
    else if(e.key===' '){
      if (document.activeElement === soundButton) return;
      e.preventDefault();
      if(!hasStarted)start();else if(playing){const target=nearestStar(player.x,player.y);if(target)pathTo(target.x,target.y);}
    }
    else if(e.key==='Enter'&&!hasStarted&&document.activeElement===document.body){e.preventDefault();start();}
  });
  canvas.addEventListener('pointerdown',e=>{
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left)*canvas.width/rect.width/tile;
    const y=(e.clientY-rect.top)*canvas.height/rect.height/tile;
    const star=nearestStar(x,y);
    if (star && (star.x-x)**2+(star.y-y)**2 < 3.2) pathTo(star.x,star.y);
    else pathTo(Math.floor(x),Math.floor(y));
  });
  startButton.addEventListener('click',start);
  soundButton.addEventListener('click',()=>{
    soundOn=!soundOn;
    soundButton.textContent=soundOn?'♫ Music on':'♪ Music off';
    soundButton.setAttribute('aria-pressed',String(soundOn));
    if (soundOn && hasStarted) startMusic(); else { stopNotes(); ghostBoing.pause(); ghostOhNo.pause(); }
  });
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) { stopNotes(); ghostBoing.pause(); ghostOhNo.pause(); }
    else if (hasStarted && soundOn) startMusic();
  });
  resetRound();
})();

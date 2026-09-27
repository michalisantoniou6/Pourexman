(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const startButton = document.querySelector('#startButton');
  const soundButton = document.querySelector('#soundButton');
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
  const dirs = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
  const starSeeds = [
    {x:1,y:1,name:'Red',color:'#ff697c'},
    {x:9,y:1,name:'Blue',color:'#55c8ff'},
    {x:5,y:4,name:'Green',color:'#78e69b'},
    {x:1,y:7,name:'Purple',color:'#d99aff'},
    {x:9,y:7,name:'Orange',color:'#ffad5e'}
  ];
  const starSpots = [[1,1],[9,1],[5,4],[1,7],[9,7],[2,3],[8,3],[3,5],[7,5],[5,1]];
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let player, stars, dots, ghosts, found, playing, soundOn = true, ghostTimer, autoTimer, travelTimer, cueTimer, nextRoundTimer, celebrateTimer;
  let audioContext, musicTimer, nextBeat = 0, musicStep = 0;
  let lastStarAt = 0, lastGhostAt = 0, effects = [], animationStarted = false, lastFrame = 0, round = 0, chompCount = 0, hasStarted = false;
  const activeNotes = new Set();
  const melody = [523,0,659,0,784,659,523,0,587,0,659,0,784,659,587,0,523,659,784,0,880,784,659,0,587,659,523,0,392,0,523,0];

  function updateTrail() {
    starTrail.innerHTML = stars.map(s => `<span class="trail-star${s.found ? ' found' : ''}" style="--star-color:${s.color}" aria-hidden="true">★</span>`).join('');
    starTrail.setAttribute('aria-label', `${found} of 5 stars found`);
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
    colorCue.textContent = `★ ${star.name}! ${found} of 5!`;
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
      if (time - lastFrame > 32) { draw(Date.now()); lastFrame = time; }
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }

  function resetRound() {
    clearInterval(ghostTimer); clearInterval(autoTimer); clearInterval(travelTimer);
    clearTimeout(cueTimer); clearTimeout(nextRoundTimer); clearTimeout(celebrateTimer);
    player = {x:5,y:7,fromX:5,fromY:7,movedAt:0,dir:'right'};
    stars = starSeeds.map((seed,i) => {
      const [x,y] = starSpots[round === 0 ? i : (round*3+i*3)%starSpots.length];
      const color = starSeeds[(i+round)%starSeeds.length];
      return {x,y,name:color.name,color:color.color,found:false};
    });
    dots = new Set();
    map.forEach((row,y) => [...row].forEach((cell,x) => { if(cell === '.' && !stars.some(s => s.x === x && s.y === y)) dots.add(`${x},${y}`); }));
    ghosts = [{x:5,y:1,color:'#ff8fa8',last:'left'},{x:5,y:5,color:'#7ad6f2',last:'right'}];
    found = 0; playing = hasStarted; lastStarAt = 0; lastGhostAt = 0; effects = [];
    progressText.textContent = round ? `Round ${round+1}: find five stars!` : 'Find the 5 colorful stars!';
    starsCount.textContent = '⭐ 0 / 5';
    message.textContent = 'Tap a star, or steer with the arrows!';
    colorCue.classList.remove('show');
    updateTrail();
    draw(Date.now());
    startAnimation();
    if (playing) ghostTimer = setInterval(moveGhosts, 850);
  }
  function open(x,y) { return map[y]?.[x] === '.'; }
  function start() {
    hasStarted = true; round = 0; resetRound(); overlay.classList.add('hidden');
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
      star.found = true; found++; lastStarAt = Date.now();
      starsCount.textContent = `⭐ ${found} / 5`;
      progressText.textContent = found === 5 ? 'You found every color!' : `${5-found} more to find!`;
      message.textContent = `${star.name} star! Let’s count: ${found}!`;
      updateTrail(); showCue(star);
      if (!reducedMotion) effects.push({x:x*tile+32,y:y*tile+32,color:star.color,started:Date.now()});
      note([523,587,659,698,784][found-1], 0, .22, .14);
      note([784,880,988,1047,1175][found-1], .14, .34, .12);
      if (found === 5) {
        playing = false; clearInterval(ghostTimer); clearInterval(autoTimer); clearInterval(travelTimer);
        progressText.textContent = 'Hooray! Five stars!';
        message.textContent = 'Hooray! Here comes a new adventure!';
        note(784, .42, .19, .14); note(880, .64, .19, .14); note(1047, .86, .5, .16);
        if (!reducedMotion) effects.push(...stars.map(s => ({x:s.x*tile+32,y:s.y*tile+32,color:s.color,started:Date.now()+650})));
        celebrateTimer = setTimeout(() => {
          colorCue.textContent = '🎉 FIVE STARS! 🎉';
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
    const ghost = ghosts.find(g => g.x === player.x && g.y === player.y);
    if (!ghost || Date.now() - lastGhostAt < 1100 || Date.now() - lastStarAt < 1200) return;
    lastGhostAt = Date.now(); ghost.stunnedUntil = lastGhostAt + 850;
    message.textContent = 'Boop! The silly ghost danced!';
    if (!reducedMotion) effects.push({x:ghost.x*tile+32,y:ghost.y*tile+32,color:ghost.color,started:lastGhostAt});
    note(330, 0, .12, .1); note(440, .12, .14, .1);
  }
  function moveGhosts() {
    if (!playing) return;
    ghosts.forEach(g => {
      if (g.stunnedUntil > Date.now()) return;
      const choices = Object.entries(dirs).filter(([,d]) => open(g.x+d[0],g.y+d[1]));
      const choice = choices[Math.floor(Math.random()*choices.length)];
      if (choice) { g.last=choice[0]; g.x+=choice[1][0]; g.y+=choice[1][1]; }
    });
    checkGhost(); draw();
  }
  function roundRect(x,y,w,h,r,fill) { ctx.fillStyle=fill; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill(); }
  function starShape(cx,cy,r,color) {
    ctx.beginPath();
    for(let i=0;i<10;i++) { const a=-Math.PI/2+i*Math.PI/5, d=i%2?r*.48:r; const x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d; i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }
    ctx.closePath(); ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=18; ctx.fill(); ctx.shadowBlur=0;
  }
  function draw(time = 0) {
    ctx.fillStyle='#171145';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<map.length;y++) for(let x=0;x<map[y].length;x++) {
      const px=x*tile,py=y*tile;
      if(map[y][x]==='#') {
        roundRect(px+4,py+4,tile-8,tile-8,14,'#5a4bb0');
        roundRect(px+10,py+10,tile-20,tile-20,10,'#7767d6');
      } else {
        roundRect(px+3,py+3,tile-6,tile-6,12,(x+y)%2?'#201954':'#241d5a');
        if(dots.has(`${x},${y}`)) {ctx.beginPath();ctx.arc(px+32,py+32,4,0,Math.PI*2);ctx.fillStyle='#f9dba0';ctx.fill();}
      }
    }
    stars.filter(s=>!s.found).forEach((s,i)=>{
      const twinkle = reducedMotion ? 0 : Math.sin(time/370+i*1.7)*2;
      starShape(s.x*tile+32,s.y*tile+32,24+twinkle,s.color);
    });
    ghosts.forEach((g,i)=>{
      const float = reducedMotion ? 0 : Math.sin(time/410+i*2)*2;
      const wobble = g.stunnedUntil > time && !reducedMotion ? Math.sin(time/45)*5 : 0;
      const cx=g.x*tile+32+wobble,cy=g.y*tile+34+float;
      ctx.fillStyle=g.color;ctx.beginPath();ctx.arc(cx,cy-5,21,Math.PI,0);ctx.lineTo(cx+21,cy+18);ctx.quadraticCurveTo(cx+12,cy+10,cx+5,cy+18);ctx.quadraticCurveTo(cx,cy+11,cx-5,cy+18);ctx.quadraticCurveTo(cx-12,cy+10,cx-21,cy+18);ctx.closePath();ctx.fill();
      ctx.fillStyle='white';ctx.beginPath();ctx.arc(cx-8,cy-6,6,0,7);ctx.arc(cx+8,cy-6,6,0,7);ctx.fill();
      ctx.fillStyle='#25204e';ctx.beginPath();ctx.arc(cx-7,cy-5,2.5,0,7);ctx.arc(cx+9,cy-5,2.5,0,7);ctx.fill();
    });
    const glide = reducedMotion ? 1 : Math.min(1,Math.max(0,(time-player.movedAt)/210));
    const cx=(player.fromX+(player.x-player.fromX)*glide)*tile+32;
    const cy=(player.fromY+(player.y-player.fromY)*glide)*tile+32;
    const facing={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[player.dir];
    const mouth = reducedMotion ? .24 : .19 + .17*Math.abs(Math.sin(time/140));
    ctx.fillStyle='#e9a632';ctx.beginPath();ctx.moveTo(cx,cy+4);ctx.arc(cx,cy+4,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd645';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#2a2251';ctx.beginPath();ctx.arc(cx+3,cy-13,3.2,0,Math.PI*2);ctx.fill();
    effects = effects.filter(effect => time - effect.started < 650);
    effects.forEach(effect => {
      if (time < effect.started) return;
      const progress = Math.max(0,(time-effect.started)/650);
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
    clearInterval(autoTimer); clearInterval(travelTimer);
    const queue=[{x:player.x,y:player.y,path:[]}], seen=new Set([`${player.x},${player.y}`]);
    while(queue.length) {
      const p=queue.shift();
      if(p.x===targetX && p.y===targetY) {
        let i=0;
        if (p.path.length) move(p.path[i++]);
        autoTimer=setInterval(()=>{if(!playing || i>=p.path.length){clearInterval(autoTimer);return;}move(p.path[i++]);},220);
        return;
      }
      for(const [name,[dx,dy]] of Object.entries(dirs)) {const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(open(x,y)&&!seen.has(key)){seen.add(key);queue.push({x,y,path:[...p.path,name]});}}
    }
  }
  function steer(direction) {
    if (!playing) return;
    clearInterval(autoTimer); clearInterval(travelTimer);
    if (!move(direction)) return;
    travelTimer = setInterval(() => {
      if (!move(direction)) {clearInterval(travelTimer);travelTimer=null;}
    }, 220);
  }
  function nearestStar(x,y) {
    return stars.filter(s=>!s.found).sort((a,b)=>(a.x-x)**2+(a.y-y)**2-(b.x-x)**2-(b.y-y)**2)[0];
  }
  document.addEventListener('keydown',e=>{
    const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key];
    if(direction){e.preventDefault();if(!e.repeat)steer(direction);}
    else if(e.key===' '){
      if (document.activeElement === soundButton) return;
      e.preventDefault();
      if(!hasStarted)start();else if(playing){const target=nearestStar(player.x,player.y);if(target)pathTo(target.x,target.y);}
    }
    else if(e.key==='Enter'&&!hasStarted&&document.activeElement===document.body){e.preventDefault();start();}
  });
  document.querySelectorAll('.move').forEach(button=>button.addEventListener('click',()=>steer(button.dataset.direction)));
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
    if (soundOn && hasStarted) startMusic(); else stopNotes();
  });
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) stopNotes(); else if (hasStarted && soundOn) startMusic();
  });
  resetRound();
})();

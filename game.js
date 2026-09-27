(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const overlayTitle = document.querySelector('#overlayTitle');
  const overlayText = document.querySelector('#overlayText');
  const startButton = document.querySelector('#startButton');
  const restartButton = document.querySelector('#restartButton');
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
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let player, stars, dots, ghosts, found, playing, soundOn = true, ghostTimer, autoTimer, cueTimer, winOverlayTimer, winSpeechTimer;
  let audioContext, lastStarAt = 0, effects = [], animationStarted = false, lastFrame = 0;
  const activeNotes = new Set();

  function updateTrail() {
    starTrail.innerHTML = stars.map(s => `<span class="trail-star${s.found ? ' found' : ''}" style="--star-color:${s.color}" aria-hidden="true">★</span>`).join('');
    starTrail.setAttribute('aria-label', `${found} of 5 stars found`);
  }
  function note(frequency, delay, length, volume = .045) {
    if (!soundOn || !window.AudioContext) return;
    try {
      audioContext ??= new window.AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startAt = audioContext.currentTime + delay;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + .025);
      gain.gain.exponentialRampToValueAtTime(.001, startAt + length);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.onended = () => activeNotes.delete(oscillator);
      activeNotes.add(oscillator);
      oscillator.start(startAt); oscillator.stop(startAt + length + .02);
    } catch (_) { /* Speech and visuals still work when audio is unavailable. */ }
  }
  function stopNotes() {
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

  function reset() {
    clearInterval(ghostTimer); clearInterval(autoTimer); clearTimeout(cueTimer);
    clearTimeout(winOverlayTimer); clearTimeout(winSpeechTimer); stopNotes();
    player = {x:5,y:7,dir:'right'};
    stars = starSeeds.map(s => ({...s,found:false}));
    dots = new Set();
    map.forEach((row,y) => [...row].forEach((cell,x) => { if(cell === '.' && !stars.some(s => s.x === x && s.y === y)) dots.add(`${x},${y}`); }));
    ghosts = [{x:5,y:1,color:'#ff8fa8',last:'left'},{x:5,y:5,color:'#7ad6f2',last:'right'}];
    found = 0; playing = false; lastStarAt = 0; effects = [];
    progressText.textContent = 'Find the 5 colorful stars!';
    starsCount.textContent = '⭐ 0 / 5';
    message.textContent = 'Find the stars and say their colors!';
    colorCue.classList.remove('show');
    updateTrail();
    draw();
    startAnimation();
  }
  function open(x,y) { return map[y]?.[x] === '.'; }
  function speak(text) {
    if (!soundOn || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.rate = .82; voice.pitch = 1.2;
    speechSynthesis.speak(voice);
  }
  function start() {
    reset(); playing = true; overlay.classList.add('hidden');
    startButton.blur();
    speak('Let’s find five colorful stars!');
    note(523, 0, .16, .035); note(659, .15, .2, .035);
    ghostTimer = setInterval(moveGhosts, 850);
  }
  function move(direction) {
    if (!playing) return;
    player.dir = direction;
    const [dx,dy] = dirs[direction];
    const x = player.x + dx, y = player.y + dy;
    if (!open(x,y)) { draw(); return; }
    player.x = x; player.y = y;
    dots.delete(`${x},${y}`);
    const star = stars.find(s => !s.found && s.x === x && s.y === y);
    if (star) {
      star.found = true; found++; lastStarAt = Date.now();
      starsCount.textContent = `⭐ ${found} / 5`;
      progressText.textContent = found === 5 ? 'You found every color!' : `${5-found} more to find!`;
      message.textContent = `${star.name} star! Let’s count: ${found}!`;
      updateTrail(); showCue(star);
      if (!reducedMotion) effects.push({x:x*tile+32,y:y*tile+32,color:star.color,started:Date.now()});
      note([392,440,494,523,587][found-1], 0, .22);
      note([523,587,659,698,784][found-1], .13, .27, .035);
      speak(`${star.name} star! ${found}!`);
      if (found === 5) {
        playing = false; clearInterval(ghostTimer); clearInterval(autoTimer);
        note(784, .42, .18); note(880, .64, .18); note(1047, .86, .45);
        winOverlayTimer = setTimeout(() => {
          overlayTitle.textContent = 'You did it! 🎉';
          overlayText.textContent = 'You found all five colors and counted to five. Great exploring!';
          startButton.textContent = '▶ Play again';
          overlay.classList.remove('hidden');
        }, 1350);
        winSpeechTimer = setTimeout(() => speak('Hooray! You found all five stars!'), 1900);
      }
    }
    checkGhost(); draw();
  }
  function checkGhost() {
    if (ghosts.some(g => g.x === player.x && g.y === player.y)) {
      // Keep color and counting speech uninterrupted, even on a shared tile.
      if (Date.now() - lastStarAt < 2500) return;
      message.textContent = 'Boop! A friendly ghost says hello!';
    }
  }
  function moveGhosts() {
    if (!playing) return;
    ghosts.forEach(g => {
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
      const cx=g.x*tile+32,cy=g.y*tile+34+float;
      ctx.fillStyle=g.color;ctx.beginPath();ctx.arc(cx,cy-5,21,Math.PI,0);ctx.lineTo(cx+21,cy+18);ctx.quadraticCurveTo(cx+12,cy+10,cx+5,cy+18);ctx.quadraticCurveTo(cx,cy+11,cx-5,cy+18);ctx.quadraticCurveTo(cx-12,cy+10,cx-21,cy+18);ctx.closePath();ctx.fill();
      ctx.fillStyle='white';ctx.beginPath();ctx.arc(cx-8,cy-6,6,0,7);ctx.arc(cx+8,cy-6,6,0,7);ctx.fill();
      ctx.fillStyle='#25204e';ctx.beginPath();ctx.arc(cx-7,cy-5,2.5,0,7);ctx.arc(cx+9,cy-5,2.5,0,7);ctx.fill();
    });
    const cx=player.x*tile+32,cy=player.y*tile+32;
    const facing={right:0,down:Math.PI/2,left:Math.PI,up:-Math.PI/2}[player.dir];
    const mouth = reducedMotion ? .24 : .19 + .17*Math.abs(Math.sin(time/140));
    ctx.fillStyle='#e9a632';ctx.beginPath();ctx.moveTo(cx,cy+4);ctx.arc(cx,cy+4,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffd645';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,25,facing+mouth,facing+Math.PI*2-mouth);ctx.closePath();ctx.fill();
    ctx.fillStyle='#2a2251';ctx.beginPath();ctx.arc(cx+3,cy-13,3.2,0,Math.PI*2);ctx.fill();
    effects = effects.filter(effect => time - effect.started < 650);
    effects.forEach(effect => {
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
    clearInterval(autoTimer);
    const queue=[{x:player.x,y:player.y,path:[]}], seen=new Set([`${player.x},${player.y}`]);
    while(queue.length) {
      const p=queue.shift();
      if(p.x===targetX && p.y===targetY) { let i=0; autoTimer=setInterval(()=>{if(!playing || i>=p.path.length){clearInterval(autoTimer);return;}move(p.path[i++]);},155);return; }
      for(const [name,[dx,dy]] of Object.entries(dirs)) {const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(open(x,y)&&!seen.has(key)){seen.add(key);queue.push({x,y,path:[...p.path,name]});}}
    }
  }
  document.addEventListener('keydown',e=>{
    const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'}[e.key];
    if(direction){e.preventDefault();clearInterval(autoTimer);move(direction);}
    else if((e.key==='Enter'||e.key===' ')&&!playing&&document.activeElement===document.body){e.preventDefault();start();}
  });
  document.querySelectorAll('.move').forEach(button=>button.addEventListener('click',()=>{clearInterval(autoTimer);move(button.dataset.direction);}));
  canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect();pathTo(Math.floor((e.clientX-rect.left)*canvas.width/rect.width/tile),Math.floor((e.clientY-rect.top)*canvas.height/rect.height/tile));});
  startButton.addEventListener('click',start);
  restartButton.addEventListener('click',start);
  soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.textContent=soundOn?'🔊 Sound on':'🔇 Sound off';soundButton.setAttribute('aria-pressed',String(soundOn));if(!soundOn){stopNotes();if('speechSynthesis'in window)speechSynthesis.cancel();}});
  reset();
})();

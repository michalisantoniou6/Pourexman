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
  let player, stars, dots, ghosts, found, playing, soundOn = true, ghostTimer, autoTimer, tick = 0;

  function reset() {
    clearInterval(ghostTimer); clearInterval(autoTimer);
    player = {x:5,y:7,dir:'right'};
    stars = starSeeds.map(s => ({...s,found:false}));
    dots = new Set();
    map.forEach((row,y) => [...row].forEach((cell,x) => { if(cell === '.' && !stars.some(s => s.x === x && s.y === y)) dots.add(`${x},${y}`); }));
    ghosts = [{x:5,y:1,color:'#ff8fa8',last:'left'},{x:5,y:5,color:'#7ad6f2',last:'right'}];
    found = 0; playing = false;
    progressText.textContent = 'Find the 5 colorful stars!';
    starsCount.textContent = '⭐ 0 / 5';
    message.textContent = 'Find the stars and say their colors!';
    draw();
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
      star.found = true; found++;
      starsCount.textContent = `⭐ ${found} / 5`;
      progressText.textContent = found === 5 ? 'You found every color!' : `${5-found} more to find!`;
      message.textContent = `${star.name} star! Let’s count: ${found}!`;
      speak(`${star.name} star! ${found}!`);
      if (found === 5) {
        playing = false; clearInterval(ghostTimer); clearInterval(autoTimer);
        setTimeout(() => {
          overlayTitle.textContent = 'You did it! 🎉';
          overlayText.textContent = 'You found all five colors and counted to five. Great exploring!';
          startButton.textContent = '▶ Play again';
          overlay.classList.remove('hidden');
          speak('Hooray! You found all five stars!');
        }, 500);
      }
    }
    checkGhost(); draw();
  }
  function checkGhost() {
    if (ghosts.some(g => g.x === player.x && g.y === player.y)) {
      message.textContent = 'Boop! A friendly ghost says hello!';
      if (found < 5) speak('Boop! Hello, friend!');
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
  function draw() {
    tick++;
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
    stars.filter(s=>!s.found).forEach(s=>starShape(s.x*tile+32,s.y*tile+32,24,s.color));
    ghosts.forEach(g=>{
      const cx=g.x*tile+32,cy=g.y*tile+34;
      ctx.fillStyle=g.color;ctx.beginPath();ctx.arc(cx,cy-5,21,Math.PI,0);ctx.lineTo(cx+21,cy+18);ctx.quadraticCurveTo(cx+12,cy+10,cx+5,cy+18);ctx.quadraticCurveTo(cx,cy+11,cx-5,cy+18);ctx.quadraticCurveTo(cx-12,cy+10,cx-21,cy+18);ctx.closePath();ctx.fill();
      ctx.fillStyle='white';ctx.beginPath();ctx.arc(cx-8,cy-6,6,0,7);ctx.arc(cx+8,cy-6,6,0,7);ctx.fill();
      ctx.fillStyle='#25204e';ctx.beginPath();ctx.arc(cx-7,cy-5,2.5,0,7);ctx.arc(cx+9,cy-5,2.5,0,7);ctx.fill();
    });
    const cx=player.x*tile+32,cy=player.y*tile+32;
    ctx.fillStyle='#ffd645';ctx.beginPath();ctx.arc(cx,cy,25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f9ad39';ctx.beginPath();ctx.arc(cx+6,cy+7,18,0,Math.PI);ctx.fill();
    ctx.fillStyle='#ffd645';ctx.beginPath();ctx.arc(cx,cy-2,24,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2a2251';ctx.beginPath();ctx.arc(cx+8,cy-11,3.3,0,7);ctx.fill();
    ctx.strokeStyle='#9b652b';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(cx+7,cy+3,8,.2,1.1);ctx.stroke();
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
  soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.textContent=soundOn?'🔊 Sound on':'🔇 Sound off';soundButton.setAttribute('aria-pressed',String(soundOn));if(!soundOn&&'speechSynthesis'in window)speechSynthesis.cancel();});
  reset();
})();

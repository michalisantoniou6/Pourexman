// Run with: node test-game.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
assert.match(html, /class="key-guide"/);
assert.doesNotMatch(html, /class="controls"/);
let fakeNow = 1800000000000;
class FakeDate extends Date { static now() { return fakeNow; } }
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', innerHTML: '', style: {}, dataset: {}, handlers: {}, attrs: {},
    classList: { add() { this.hidden = true; }, remove() { this.hidden = false; } },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; }, blur() {}
  });
  return elements.get(id);
}
const canvas = element('#game');
canvas.width = 704; canvas.height = 576;
const drawnArcs = [];
canvas.getContext = () => new Proxy({
  beginPath() {}, roundRect() {}, fill() {}, arc(x,y,r) { drawnArcs.push([x,y,r]); }, lineTo() {}, moveTo() {},
  closePath() {}, quadraticCurveTo() {}, stroke() {}, fillRect() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {}
}, { set(target, key, value) { target[key] = value; return true; } });
const timeouts = new Map();
let timeoutId = 0;
const intervals = new Map();
let intervalId = 0;
class FakeAudioContext {
  static instances = [];
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.destination = {}; this.created = 0; this.stopped = 0; FakeAudioContext.instances.push(this); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createOscillator() { this.created++; return {frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop:()=>{this.stopped++;}}; }
  createGain() { return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}; }
}
const document = {
  querySelector: element, querySelectorAll: () => [],
  addEventListener(type, fn) { this[type] = fn; }
};
let seed = 12345;
const fakeMath = Object.create(Math);
fakeMath.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2**32; };
vm.runInNewContext(fs.readFileSync('game.js', 'utf8'), {
  document, window: {AudioContext:FakeAudioContext}, Math:fakeMath, Date:FakeDate,
  setInterval(fn,delay) {const id=++intervalId;intervals.set(id,{fn,delay});return id;},
  clearInterval(id) {intervals.delete(id);},
  clearTimeout(id) { timeouts.delete(id); },
  setTimeout(fn, delay) { const id = ++timeoutId; timeouts.set(id, {fn, delay}); return id; }
});
element('#startButton').handlers.click();
assert.equal(element('#overlay').classList.hidden, true);
const audio = FakeAudioContext.instances[0];
assert.equal(audio.state, 'running');
assert.ok(audio.created >= 2, 'music should schedule more than a start chime');
const total = Number(element('#starsCount').textContent.match(/\/ (\d+)/)[1]);
assert.ok(total >= 3 && total <= 7, 'round should have 3–7 stars');
assert.equal((element('#starTrail').innerHTML.match(/class="trail-star"/g)||[]).length,total);
function press(direction) {
  fakeNow += 250;
  document.keydown({key:{up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[direction],repeat:false,preventDefault(){}});
}
press('up'); press('up');
assert.match(element('#message').textContent, /BOING!/);
assert.ok(audio.created >= 5, 'ghost bump should make a sound');
fakeNow += 100;
const ghostTick = [...intervals.values()].find(timer => timer.delay === 850);
assert.ok(ghostTick, 'ghosts should continue moving');
ghostTick.fn();
assert.ok(drawnArcs.every(([x,y]) => x > -100 && x < 804 && y > -100 && y < 676), 'periodic redraw should stay on the board');
const map = [
  '###########', '#.........#', '#..##.##..#', '#.........#', '#.#.....#.#',
  '#.........#', '#..##.##..#', '#.........#', '###########'
];
let current = [5, 5];
const goals = [];
map.forEach((row,y) => [...row].forEach((cell,x) => {if(cell==='.') goals.push([x,y]);}));
for (const goal of goals) {
  const queue = [[...current, []]], seen = new Set([current.join(',')]);
  let route;
  while (queue.length) {
    const [x, y, path] = queue.shift();
    if (x === goal[0] && y === goal[1]) { route = path; break; }
    for (const [name, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (map[ny]?.[nx] === '.' && !seen.has(key)) {
        seen.add(key); queue.push([nx, ny, [...path, name]]);
      }
    }
  }
  assert.ok(route, `star at ${goal} is reachable`);
  for (const direction of route) {
    press(direction);
    if (Number(element('#starsCount').textContent.match(/^(?:⭐ )?(\d+)/)[1]) === total) break;
  }
  const visibleCount = Number(element('#starsCount').textContent.match(/\d+/)[0]);
  assert.equal((element('#starTrail').innerHTML.match(/class="trail-star found"/g) || []).length, visibleCount);
  if (visibleCount === total) break;
  current = goal;
}
assert.equal(element('#starsCount').textContent, `⭐ ${total} / ${total}`);
assert.equal(element('#overlay').classList.hidden, true);
assert.equal(element('#progressText').textContent, `Hooray! ${total} stars!`);
const firstColors = element('#starTrail').innerHTML;
const nextRound = [...timeouts.values()].find(timer => timer.delay === 3100);
assert.ok(nextRound, 'next round should be scheduled');
nextRound.fn();
const nextTotal = Number(element('#starsCount').textContent.match(/\/ (\d+)/)[1]);
assert.ok(nextTotal >= 3 && nextTotal <= 7);
assert.notEqual(nextTotal,total,'consecutive rounds should have different star counts');
assert.notEqual(element('#starTrail').innerHTML,firstColors,'colors should vary between rounds');
assert.match(element('#progressText').textContent, /Round 2/);
press('left');
document.keydown({key:'ArrowUp',repeat:false,preventDefault(){}});
const turnRequest = [...timeouts.values()].find(timer => timer.delay === 150);
assert.ok(turnRequest, 'a mid-tile turn should wait for the next tile center');
fakeNow += 150; turnRequest.fn();
const movementTick = [...intervals.values()].find(timer => timer.delay === 150);
assert.ok(movementTick, 'movement should continue while the turn is buffered');
fakeNow += 150; movementTick.fn();
fakeNow += 150; movementTick.fn();
fakeNow += 150; ghostTick.fn();
const lastPlayerArc = drawnArcs.filter(([, ,r]) => r === 25).at(-1);
assert.deepEqual(lastPlayerArc.slice(0,2), [2*64+32,6*64+32], 'an early up press should turn at the next opening');
element('#soundButton').handlers.click();
assert.equal(element('#soundButton').attrs['aria-pressed'], 'false');
assert.ok(audio.stopped > 0, 'mute should stop scheduled audio');
const notesBeforeUnmute = audio.created;
element('#soundButton').handlers.click();
assert.ok(audio.created > notesBeforeUnmute, 'unmute should restart music');
console.log('PASS: buffered turns, random stars and colors, ghost boing, next round, music and mute');

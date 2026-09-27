// Run with: node test-game.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
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
  beginPath() {}, roundRect() {}, fill() {}, arc(x,y) { drawnArcs.push([x,y]); }, lineTo() {}, moveTo() {},
  closePath() {}, quadraticCurveTo() {}, stroke() {}, fillRect() {},
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillText() {}
}, { set(target, key, value) { target[key] = value; return true; } });
const buttons = ['up', 'down', 'left', 'right'].map(direction => {
  const button = element(direction); button.dataset.direction = direction; return button;
});
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
  querySelector: element, querySelectorAll: () => buttons,
  addEventListener(type, fn) { this[type] = fn; }
};
vm.runInNewContext(fs.readFileSync('game.js', 'utf8'), {
  document, window: {AudioContext:FakeAudioContext}, Math, Date:FakeDate,
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
function press(direction) { fakeNow += 250; element(direction).handlers.click(); }
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
const goals = [[1, 1], [9, 1], [5, 4], [1, 7], [9, 7]];
for (const [index, goal] of goals.entries()) {
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
  route.forEach(press);
  const visibleCount = Number(element('#starsCount').textContent.match(/\d+/)[0]);
  assert.equal((element('#starTrail').innerHTML.match(/class="trail-star found"/g) || []).length, visibleCount);
  assert.ok(visibleCount >= index + 1);
  assert.ok(element('#colorCue').textContent.includes('of 5!'));
  current = goal;
}
assert.equal(element('#starsCount').textContent, '⭐ 5 / 5');
assert.equal(element('#overlay').classList.hidden, true);
assert.equal(element('#progressText').textContent, 'Hooray! Five stars!');
const nextRound = [...timeouts.values()].find(timer => timer.delay === 3100);
assert.ok(nextRound, 'next round should be scheduled');
nextRound.fn();
assert.equal(element('#starsCount').textContent, '⭐ 0 / 5');
assert.match(element('#progressText').textContent, /Round 2/);
element('#soundButton').handlers.click();
assert.equal(element('#soundButton').attrs['aria-pressed'], 'false');
assert.ok(audio.stopped > 0, 'mute should stop scheduled audio');
const notesBeforeUnmute = audio.created;
element('#soundButton').handlers.click();
assert.ok(audio.created > notesBeforeUnmute, 'unmute should restart music');
console.log('PASS: music unlock, ghost boing, movement, five stars, next round, mute and unmute');

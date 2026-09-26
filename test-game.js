// Run with: node test-game.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', dataset: {}, handlers: {}, attrs: {},
    classList: { add() { this.hidden = true; }, remove() { this.hidden = false; } },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; }, blur() {}
  });
  return elements.get(id);
}
const canvas = element('#game');
canvas.width = 704; canvas.height = 576;
canvas.getContext = () => new Proxy({
  beginPath() {}, roundRect() {}, fill() {}, arc() {}, lineTo() {}, moveTo() {},
  closePath() {}, quadraticCurveTo() {}, stroke() {}, fillRect() {}
}, { set(target, key, value) { target[key] = value; return true; } });
const buttons = ['up', 'down', 'left', 'right'].map(direction => {
  const button = element(direction); button.dataset.direction = direction; return button;
});
const document = {
  querySelector: element, querySelectorAll: () => buttons,
  addEventListener(type, fn) { this[type] = fn; }
};
vm.runInNewContext(fs.readFileSync('game.js', 'utf8'), {
  document, window: {}, Math, setInterval: () => 1, clearInterval() {}, setTimeout: fn => fn()
});
element('#startButton').handlers.click();
assert.equal(element('#overlay').classList.hidden, true);
const map = [
  '###########', '#.........#', '#..##.##..#', '#.........#', '#.#.....#.#',
  '#.........#', '#..##.##..#', '#.........#', '###########'
];
let current = [5, 7];
for (const goal of [[1, 1], [9, 1], [5, 4], [1, 7], [9, 7]]) {
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
  route.forEach(direction => element(direction).handlers.click());
  current = goal;
}
assert.equal(element('#starsCount').textContent, '⭐ 5 / 5');
assert.equal(element('#overlay').classList.hidden, false);
assert.equal(element('#overlayTitle').textContent, 'You did it! 🎉');
console.log('PASS: start, movement, all five reachable stars, counting, win screen');

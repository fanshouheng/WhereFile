const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('function frame(now){');
  const end = source.indexOf('\nif(nativeHost){', start);
  assert.ok(start >= 0 && end > start, 'Locate the actual animation frame implementation');
  const clamp = source.match(/^const clamp=.*$/m)?.[0];
  const updateSea = source.match(/^function updateSea\(it\).*$/m)?.[0];
  assert.ok(clamp, 'Locate the actual clamp helper');
  assert.ok(updateSea, 'Locate the actual sea-state helper');
  const safeStart = source.indexOf('function safePosition(it){');
  const safeEnd = source.indexOf('\nfunction addItem(', safeStart);
  assert.ok(safeStart >= 0 && safeEnd > safeStart, 'Locate the actual safe-position helper');
  const frameScript = new vm.Script(`${clamp}\n${updateSea}\n${source.slice(safeStart, safeEnd)}\n${source.slice(start, end)}`, { filename: 'app.js:frame' });
  const { camera, shoreX, waveAt } = await import(pathToFileURL(path.join(root, 'ocean.js')));
  const { stepVoyage, voyageBounds, boatDirection } = await import(pathToFileURL(path.join(root, 'voyage.js')));

  function boat(x, y, phase) {
    return { x, y, phase, sea: true, vx: 0, vy: 0, target: null, el: { style: {}, classList: { toggle() {} } }, visual: { style: {} } };
  }
  function simulation(width, height, wind, items) {
    const calls = { ocean: 0, life: 0, scheduled: 0, messages: [] };
    const context = vm.createContext({
      last: 0, lastWake: 0, lastSave: 0, lastScenery: 0, lastLifeTime: 0, time: 0, paused: false, reduced: false, hostSuspended: false, sceneDirty: true, nativeHost: null, hostWallpaper: false,
      wind, items, cam: camera(width, height), drag: null, document: { hidden: false },
      shoreX, waveAt, stepVoyage, voyageBounds, boatDirection, updateSea() {}, savePositions() {},
      ocean: { draw() { calls.ocean++; } },
      life: { draw() { calls.life++; }, wake() {} },
      requestAnimationFrame() { calls.scheduled++; },
    });
    frameScript.runInContext(context);
    return { context, calls };
  }
  function advance(sim, fps, seconds, check = () => {}) {
    const offset = sim.context.last;
    for (let i = 1; i <= fps * seconds; i++) {
      sim.context.frame(offset + i * 1000 / fps);
      check(sim.context);
    }
  }
  function snapshot(context) {
    return { time: context.time, boats: context.items.map(it => ({
      x: it.x, y: it.y, vx: it.vx, vy: it.vy,
      transform: it.el.style.transform, roll: it.visual.style.transform,
    })) };
  }

  const results = [1, 15, 60].map(fps => {
    const sim = simulation(1440, 900, .35, [boat(850, 420, .7), boat(1120, 620, 2.1)]);
    advance(sim, fps, 8);
    assert.ok(Math.abs(sim.context.time - 8) < 1e-8, `${fps} FPS advances eight real seconds`);
    assert.ok(Math.abs(sim.calls.ocean - Math.min(fps, 30) * 8) <= 1, 'Scenery stays within 30 FPS');
    assert.equal(sim.calls.life, sim.calls.ocean, 'Sea life shares the scenery refresh budget');
    assert.equal(sim.calls.scheduled, fps * 8, 'Schedule once per frame');
    return { fps, sim, state: snapshot(sim.context) };
  });
  const reference = results.at(-1).state;
  for (const result of results) {
    const error = Math.max(...result.state.boats.map((it, i) =>
      Math.hypot(it.x - reference.boats[i].x, it.y - reference.boats[i].y)));
    assert.ok(error < .25, `${result.fps} FPS position differs by ${error.toFixed(3)}px from 60 FPS`);
    console.log(`PASS: ${result.fps} FPS advances 8 seconds; position difference ${error.toFixed(3)}px.`);
  }

  const paused = results[0].sim;
  paused.context.paused = true;
  const before = snapshot(paused.context);
  const pausedDraws = { ocean: paused.calls.ocean, life: paused.calls.life };
  advance(paused, 1, 8);
  assert.deepEqual(snapshot(paused.context), before, 'Pause freezes time, drift, bobbing and roll');
  assert.equal(paused.calls.ocean, pausedDraws.ocean, 'Paused ocean is not redrawn');
  assert.equal(paused.calls.life, pausedDraws.life, 'Paused sea life is not redrawn');
  paused.context.sceneDirty = true;
  advance(paused, 60, 1);
  assert.equal(paused.calls.ocean, pausedDraws.ocean + 1, 'Paused scene repaints once after a scene change');
  const previousTransform = paused.context.items[0].el.style.transform;
  paused.context.items[0].x += 18;
  paused.context.updateSea(paused.context.items[0]);
  advance(paused, 60, 1);
  assert.notEqual(paused.context.items[0].el.style.transform, previousTransform, 'Keyboard position/sea changes remain visible while paused');
  console.log('PASS: pause freezes position and stops repainting; scene changes still render.');

  const native = simulation(1920, 1080, .35, []);
  native.context.nativeHost = { postMessage(message) { native.calls.messages.push(message); } };
  native.context.hostWallpaper = true;
  advance(native, 60, 1);
  assert.equal(native.calls.messages.length, 0, 'No empty native pose messages');
  const nativeBoat = { ...boat(1300, 500, .7), desktop: true, id: 'native-test' };
  native.context.items.push(nativeBoat);
  advance(native, 60, 1);
  assert.equal(native.calls.messages.length, 60, 'Native boat keeps every 60 FPS pose');
  assert.equal(nativeBoat.el.style.transform, undefined, 'Hidden native DOM boat is not repainted');
  assert.ok(native.calls.messages.every(m => m.items.length === 1 && Number.isFinite(m.items[0].roll)), 'Native poses retain subpixel position and roll');
  native.context.paused = true;
  native.context.sceneDirty = true;
  advance(native, 60, 1);
  assert.equal(native.calls.messages.length, 61, 'Pause sends one final pose, then stops native messages');
  native.context.items[0].target = { x: 200, y: 400 };
  advance(native, 60, 1);
  assert.ok(native.context.items[0].x < 1300, 'Returning to shore remains responsive while paused');
  console.log('PASS: native boats keep 60 FPS; empty/paused pose traffic stops; paused return to shore works.');

  const suspended = results[1].sim;
  suspended.context.hostSuspended = true;
  const beforeSuspension = snapshot(suspended.context);
  const renderedBefore = { ocean: suspended.calls.ocean, life: suspended.calls.life };
  advance(suspended, 1, 8);
  assert.deepEqual(snapshot(suspended.context), beforeSuspension, 'Native host suspension freezes all motion');
  assert.equal(suspended.calls.ocean, renderedBefore.ocean, 'Suspended host does not render ocean');
  assert.equal(suspended.calls.life, renderedBefore.life, 'Suspended host does not render sea life');
  suspended.context.hostSuspended = false;
  advance(suspended, 1, 2);
  assert.ok(Math.abs(suspended.context.time - beforeSuspension.time - 2) < 1e-8,
    'Resuming host advances only the next two seconds, without catching up suspended time');
  assert.ok(suspended.context.items.some((it, i) =>
    Math.hypot(it.x - beforeSuspension.boats[i].x, it.y - beforeSuspension.boats[i].y) > 1),
    'Boats resume travelling after host suspension');
  assert.equal(suspended.calls.ocean, renderedBefore.ocean + 2, 'Ocean rendering resumes');
  assert.equal(suspended.calls.life, renderedBefore.life + 2, 'Sea-life rendering resumes');
  console.log('PASS: native host suspension freezes motion/rendering and resumes without a time jump.');

  const narrowCam = camera(390, 844);
  for (const fps of [1, 15, 60]) {
    const narrow = simulation(390, 844, 1, [
      boat(325, 125, .3), boat(shoreX(300, narrowCam) + 80, 300, 3.2),
      boat(325, 550, 1.1), boat(shoreX(645, narrowCam) + 80, 645, 4.7),
    ]);
    let worst = 0;
    advance(narrow, fps, 30, context => {
      for (const it of context.items) {
        assert.ok([it.x, it.y, it.vx, it.vy].every(Number.isFinite), 'Motion stays finite');
        const bounds = voyageBounds(context.cam, it.y);
        const excursion = Math.max(0, bounds.left - it.x, it.x - bounds.right,
          bounds.top - it.y, it.y - bounds.bottom);
        worst = Math.max(worst, excursion);
        assert.ok(excursion <= .75, `${fps} FPS strong-wind boat crosses a boundary by ${excursion.toFixed(3)}px`);
      }
    });
    assert.ok(Math.abs(narrow.context.time - 30) < 1e-7, 'Strong-wind run advances thirty seconds');
    console.log(`PASS: ${fps} FPS strong wind, 390x844, 30 seconds; maximum boundary excursion ${worst.toFixed(3)}px.`);
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

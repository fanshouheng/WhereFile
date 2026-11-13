const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('\nif(nativeHost){');
const end = source.indexOf('\nasync function init()', start);
assert.ok(start >= 0 && end > start);
const script = new vm.Script(source.slice(start, end), { filename: 'app.js:nativeHost' });

function setup() {
  const elements = new Map();
  const timers = new Map();
  const messages = [];
  let receive, nextTimer = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      open: false, disabled: false, textContent: '', attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      showModal() { this.open = true; }, close() { this.open = false; },
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    $: element, motionChoice: 'play', hostWallpaper: false, hostSuspended: false,
    nativeHost: {
      postMessage(message) { messages.push(message); },
      addEventListener(name, handler) { receive = handler; },
    },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    document: { body: { classList: { toggle() {} } } },
    finishDrag() {}, resize() {}, syncSound() {}, performance: { now: () => 0 },
  });
  script.runInContext(context);
  return { element, timers, messages, context, receive: data => receive({ data }),
    click: () => element('set-wallpaper').onclick(),
    timeout: () => { assert.equal(timers.size, 1); [...timers.values()][0](); },
  };
}

const action = setup();
action.click();
assert.equal(action.element('set-wallpaper').disabled, true);
assert.equal(action.element('set-wallpaper').textContent, '正在设置…');
assert.equal(action.element('set-wallpaper').attrs['aria-busy'], 'true');
action.click();
assert.equal(action.messages.length, 1, 'Repeated clicks do not submit twice');
action.receive({ type: 'host-state', wallpaper: false, suspended: false });
assert.equal(action.element('set-wallpaper').disabled, true, 'Unrelated manager state does not discard the pending request');
action.receive({ type: 'wallpaper-result', success: false, message: 'Windows 未允许嵌入桌面（5）。' });
assert.equal(action.element('wallpaper-error-dialog').open, true);
assert.match(action.element('wallpaper-error-message').textContent, /（5）/);
assert.equal(action.element('set-wallpaper').disabled, false);
assert.equal(action.timers.size, 0);
action.element('close-wallpaper-error').onclick();
action.click();
action.receive({ type: 'host-state', wallpaper: true, suspended: false });
assert.equal(action.element('set-wallpaper').disabled, false);
assert.equal(action.element('set-wallpaper').attrs['aria-busy'], undefined);
assert.equal(action.timers.size, 0);
assert.equal(action.element('wallpaper-error-dialog').open, false);
console.log('PASS: pending feedback, duplicate prevention, native failure, retry and confirmed desktop mode.');

const timeout = setup();
timeout.click();timeout.timeout();
assert.equal(timeout.element('wallpaper-error-dialog').open, true);
assert.match(timeout.element('wallpaper-error-message').textContent, /尚未收到确认/);
assert.equal(timeout.element('set-wallpaper').disabled, false);
timeout.receive({ type: 'wallpaper-result', success: true });
assert.equal(timeout.element('wallpaper-error-dialog').open, false, 'Late success clears the timeout notice');
console.log('PASS: missing native response shows a persistent notice; late success clears it.');

const broken = setup();
broken.context.nativeHost.postMessage = () => { throw new Error('Bridge unavailable'); };
broken.click();
assert.equal(broken.element('set-wallpaper').disabled, false);
assert.equal(broken.timers.size, 0);
assert.equal(broken.element('wallpaper-error-dialog').open, true);
assert.match(broken.element('wallpaper-error-message').textContent, /无法连接桌面程序/);
console.log('PASS: bridge exceptions restore the button and show recovery instructions.');

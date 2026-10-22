// Page wiring: connect, check, console, report, firmware.

import { CONFIG } from './config.js?v=1792701697';
import { SerialLink } from './link.js?v=1792701697';
import { SimLink } from './sim.js?v=1792701697';
import { Receiver, NoAnswerError, sleep } from './receiver.js?v=1792701697';
import { runChecks, stateWord } from './checks.js?v=1792701697';
import {
  loadFirmwareList, latestMain, latestFor, rowVersion, fileUrl, downloadBinary, crc32, flashMain,
  installedVersions, mainVersionOf, compareMain, compareSubsystem,
} from './firmware.js?v=1792701697';
import { buildReport, buildReportHtml, reportFileName, downloadFile, emailSummary, mailtoUrl } from './report.js?v=1792701697';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  link: null, rx: null, port: null, snap: null, findings: [], fw: null, fwError: null,
  busy: false, tab: 'check', liveTimer: null, sim: null,
};

// ---------------------------------------------------------------------------
// Setup

function init() {
  window.__support = state; // for debugging from the browser console
  $('#site-version').textContent = `v${CONFIG.siteVersion}`;
  for (const id of ['#footer-mail', '#support-mail']) {
    $(id).href = `mailto:${CONFIG.supportEmail}`;
    $(id).textContent = CONFIG.supportEmail;
  }

  const params = new URLSearchParams(location.search);
  state.sim = params.get('sim');

  if (!SerialLink.supported() && !state.sim) {
    const h = $('#browser-hint');
    h.classList.remove('hidden');
    const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    h.innerHTML = phone
      ? 'Phones and tablets cannot open USB serial ports, so this page needs a laptop or desktop computer running <b>Chrome</b> or <b>Edge</b>.'
      : 'This browser cannot open USB ports. Please use <b>Chrome</b> or <b>Edge</b> on a computer (Windows, macOS, Linux or ChromeOS).';
    $('#btn-connect').disabled = true;
  }
  if (state.sim) {
    $('#btn-connect').textContent = `Connect The Simulated ${state.sim.toUpperCase()}`;
  }

  $('#btn-connect').addEventListener('click', () => connect(false));
  $('#btn-connect-any').addEventListener('click', (e) => { e.preventDefault(); connect(true); });
  $('#btn-connect-known').addEventListener('click', connectKnown);
  if (SerialLink.supported() && !state.sim) {
    navigator.serial.getPorts().then((ports) => {
      if (ports.length) $('#btn-connect-known').classList.remove('hidden');
    }).catch(() => {});
  }
  $('#btn-disconnect').addEventListener('click', disconnect);
  $('#btn-recheck').addEventListener('click', () => runCheck());
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $$('.key').forEach((b) => b.addEventListener('click', () => quickKey(b.dataset.key)));
  $('#term-form').addEventListener('submit', onTermSubmit);
  $('#term-clear').addEventListener('click', () => { $('#term').textContent = ''; });
  $('#setting-form').addEventListener('submit', onSettingSubmit);
  $('#problem').addEventListener('input', refreshReport);
  $('#contact').addEventListener('input', refreshReport);
  $('#btn-download').addEventListener('click', onDownload);
  $('#btn-email').addEventListener('click', onEmail);
  $('#btn-copy').addEventListener('click', onCopy);
  $('#fw-ack').addEventListener('change', updateFlashButton);
  $$('input[name=fw-pick]').forEach((r) => r.addEventListener('change', updateFlashButton));
  $('#btn-flash').addEventListener('click', onFlash);
  $('#btn-wifi-update').addEventListener('click', onWifiUpdate);
  $('#fw-banner-btn').addEventListener('click', () => {
    $('#usb-update').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#fw-ack').focus();
  });
  $('#nav-drivers').addEventListener('click', () => { $('#drivers').open = true; });
  initConfirm();

  renderManualLinks();
  loadFirmwareList().then((fw) => { state.fw = fw; if (state.snap) { rerunChecks(); } renderVersions(); })
    .catch((e) => { state.fwError = e; renderVersions(); });

  if (SerialLink.supported()) {
    navigator.serial.addEventListener('disconnect', (ev) => {
      if (state.port && ev.target === state.port) onLinkLost('The cable was unplugged.');
    });
  }
}

// ---------------------------------------------------------------------------
// Connect and disconnect

function attach(link, port) {
  state.link = link;
  state.port = port;
  state.rx = new Receiver(link);
  state.rx.onLog(appendTerm);
  link.onClose((e) => onLinkLost(e ? 'The connection dropped.' : 'The port closed.'));
  $('#view-connect').classList.add('hidden');
  $('#view-device').classList.remove('hidden');
  $('#dev-kind').textContent = link.kind === 'sim' ? 'Simulated Unit' : 'Connected Over USB';
  $('#dev-name').textContent = 'Reading the unit';
  $('#dev-sub').textContent = '';
  startLiveCard();
}

async function connect(allPorts) {
  const err = $('#connect-error');
  err.classList.add('hidden');
  try {
    let link;
    let port;
    if (state.sim) {
      link = new SimLink(state.sim);
      port = await link.requestPort();
    } else {
      link = new SerialLink();
      port = await link.requestPort(allPorts);
    }
    await link.open(port, CONFIG.consoleBaud);
    attach(link, port);
    await runCheck();
  } catch (e) {
    if (e && e.name === 'NotFoundError') { $('#not-listed').classList.remove('hidden'); return; } // chooser closed
    err.classList.remove('hidden');
    if (e && /Failed to open|already open|in use|Access denied/i.test(e.message)) {
      err.innerHTML = '<b>The port is busy.</b> Another program (a terminal, the firmware uploader, a GNSS tool) has it open. Close that program and try again.';
    } else {
      err.textContent = `Could not connect: ${e.message || e}`;
    }
    $('#not-listed').classList.remove('hidden');
  }
}

// Try every port this page was allowed to use before, and keep the first one that opens its menu.
async function connectKnown() {
  const err = $('#connect-error');
  err.classList.add('hidden');
  const ports = await navigator.serial.getPorts();
  if (!ports.length) { err.classList.remove('hidden'); err.textContent = 'No port has been allowed yet. Use Connect A Unit first.'; return; }
  const btn = $('#btn-connect-known');
  btn.disabled = true;
  const tried = [];
  try {
    for (const port of ports) {
      const link = new SerialLink();
      try {
        await link.open(port, CONFIG.consoleBaud);
      } catch (e) {
        tried.push(/open|busy|denied|in use/i.test(e.message) ? 'one port is busy in another program' : e.message);
        continue;
      }
      const rx = new Receiver(link);
      let header = null;
      try { header = await rx.openMenu(20000); } catch { /* silent port */ }
      if (!header) {
        tried.push('one port gave no answer');
        await link.close();
        continue;
      }
      attach(link, port);
      state.rx = rx;
      rx.onLog(appendTerm);
      for (const e of rx.log) appendTerm(e);
      await runCheck();
      return;
    }
    err.classList.remove('hidden');
    err.innerHTML = `<b>No unit answered on the ports used before</b> (${[...new Set(tried)].join('; ')}). Check that the unit is on, then try again or use Connect A Unit to pick a port.`;
    $('#not-listed').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function disconnect() {
  if (state.rx && state.link?.connected) {
    // Best effort, bounded: a Torch whose console has gone quiet must not block the disconnect.
    const tidy = (async () => {
      try { await state.rx.restoreLoraTimeout(); } catch { /* ignore */ }
      try { await state.rx.exitMenu(); } catch { /* ignore */ }
    })();
    await Promise.race([tidy, sleep(15000)]);
  }
  if (state.link) await state.link.close();
  stopLiveCard();
  state.link = null; state.rx = null; state.port = null; state.snap = null; state.findings = [];
  $('#view-device').classList.add('hidden');
  $('#view-connect').classList.remove('hidden');
  $('#term').textContent = '';
  $('#findings').innerHTML = '';
  $('#findings-ok').innerHTML = '';
  $('#findings-summary').textContent = 'Waiting for the first check.';
  $('#where').textContent = 'nowhere yet';
}

function onLinkLost(why) {
  if (!state.link) return;
  stopLiveCard();
  const d = $('#device-error');
  d.classList.remove('hidden');
  d.innerHTML = `<b>Connection lost.</b> ${why} The readings below stay available; reconnect to run the check again.`;
  state.link = null; state.rx = null; state.port = null;
  setBusy(false);
  $('#btn-recheck').disabled = true;
  $('#btn-disconnect').textContent = 'Back To Start';
  $('#btn-disconnect').onclick = () => location.reload();
}

// ---------------------------------------------------------------------------
// Check

// The progress list shows four stages; each label the check reports maps onto one.
const STAGE_OF = [
  [/Opening the configuration menu/, 0],
  [/Keeping the console awake|Reading system status|Reading the GNSS receiver|Reading the firmware menu/, 1],
  [/Reading settings/, 2],
  [/Closing the menu|Watching the position/, 3],
];

function setBusy(on, text = '') {
  state.busy = on;
  $('#progress').classList.toggle('hidden', !on);
  if (on) setStage(text);
  $$('.key').forEach((b) => { b.disabled = on; });
  $('#btn-recheck').disabled = on;
  $('#btn-flash').disabled = on || !$('#fw-ack').checked;
  $('#btn-wifi-update').disabled = on;
}

function setStage(text) {
  let stage = -1;
  for (const [re, n] of STAGE_OF) if (re.test(text)) stage = n;
  const items = $$('#progress-steps li');
  const listed = stage >= 0;
  $('#progress-steps').classList.toggle('hidden', !listed);
  if (listed) {
    items.forEach((li, i) => {
      li.classList.toggle('done', i < stage);
      li.classList.toggle('active', i === stage);
    });
    $('#progress-text').textContent = stage === 0
      ? 'Connecting restarts the unit; the whole check takes about a minute.'
      : text;
  } else {
    $('#progress-text').textContent = text;
  }
}

async function runCheck() {
  if (!state.rx || state.busy) return;
  const d = $('#device-error');
  d.classList.add('hidden');
  setBusy(true, 'Opening the configuration menu');
  try {
    state.snap = await state.rx.fullCheck((t) => setStage(t));
    rerunChecks();
    renderDeviceCard();
  } catch (e) {
    if (e instanceof NoAnswerError) {
      explainNoAnswer();
    } else {
      d.classList.remove('hidden');
      d.textContent = `The check stopped: ${e.message}. The Console tab shows what the unit printed.`;
    }
  } finally {
    setBusy(false);
  }
}

function explainNoAnswer() {
  const d = $('#device-error');
  d.classList.remove('hidden');
  const link = state.link;
  const rx = link.rxBytes;
  let html;
  if (rx > 100 && link.nonPrintable > rx / 8) {
    html = '<b>This looks like the GNSS data port, not the console.</b> The unit shows two ports; disconnect and pick the other <i>USB-Enhanced-SERIAL</i> entry.';
  } else if (rx > 100) {
    html = '<b>The unit is sending data but did not open its menu.</b> If the lines in the Console tab start with $G, this is the GNSS data port: disconnect and pick the other port. Otherwise try Run Check Again.';
  } else {
    html = `<b>Nothing came back from the unit.</b> Check that it is powered on, that the cable carries data (not a charge-only cable), and that you picked the port ending in B. On Windows an unknown device in Device Manager means a driver is missing: see <a href="#drivers" id="err-drivers">Driver Help</a>.`;
  }
  d.innerHTML = html;
  const dl = $('#err-drivers');
  if (dl) dl.addEventListener('click', () => { $('#drivers').open = true; $('#view-connect').classList.remove('hidden'); });
  $('#findings-summary').textContent = 'No check could be run.';
}

function rerunChecks() {
  if (!state.snap) return;
  state.findings = runChecks(state.snap, state.fw);
  renderFindings();
  renderVersions();
  refreshReport();
}

function renderDeviceCard() {
  const s = state.snap;
  if (!s) return;
  const h = s.header || {};
  $('#dev-name').textContent = h.product ? `${h.brand} ${h.rtkPrefix ? 'RTK ' : ''}${h.product}` : 'Unknown unit';
  const parts = [];
  if (h.version) parts.push(`Firmware ${h.version}`);
  if (h.bluetoothName) parts.push(h.bluetoothName);
  else if (s.cli?.deviceName?.value) parts.push(s.cli.deviceName.value);
  $('#dev-sub').textContent = parts.join(' | ');
  $('#dev-mode').textContent = (h.mode || '-').toUpperCase();
  updateLiveCard();
}

function startLiveCard() {
  stopLiveCard();
  state.liveTimer = setInterval(updateLiveCard, 1000);
}
function stopLiveCard() { if (state.liveTimer) clearInterval(state.liveTimer); state.liveTimer = null; }

function updateLiveCard() {
  const rx = state.rx;
  if (!rx) return;
  const rover = rx.lastLive('rover');
  const base = rx.lastLive('base');
  const batt = rx.lastLive('battery');
  const last = rover && base ? (rover.t > base.t ? rover : base) : rover || base;
  if (last && Date.now() - last.t < 30000) {
    $('#dev-fix').textContent = last.kind === 'rover' ? stateWord(last.state) : last.state;
    $('#dev-siv').textContent = last.siv;
    $('#dev-acc').textContent = last.kind === 'rover' ? `${last.beyond ? '> ' : ''}${last.accuracy} ${last.units}` : '-';
    if (last.kind === 'base') $('#dev-mode').textContent = last.state;
  }
  const s = state.snap;
  const pct = batt?.percent ?? (s?.cli?.batteryLevelPercent?.value ? +s.cli.batteryLevelPercent.value : s?.system?.battery);
  if (pct !== undefined && pct !== null && !Number.isNaN(pct)) $('#dev-batt').textContent = `${pct}%`;
  const w = $('#where');
  if (w) w.textContent = rx.where;
}

const MARKS = { ok: '✓', info: 'i', warn: '!', bad: '×' };
const MARK_TEXT = { ok: 'fine', info: 'note', warn: 'needs attention', bad: 'problem' };

function findingCard(x) {
  const el = document.createElement('div');
  el.className = `finding ${x.level}`;
  el.innerHTML = `<div class="mark" aria-hidden="true">${MARKS[x.level]}</div><div><h4></h4><p></p></div>`;
  el.querySelector('h4').innerHTML = `<span class="sr-only">${MARK_TEXT[x.level]}: </span>`;
  el.querySelector('h4').appendChild(document.createTextNode(x.title));
  el.querySelector('p').textContent = x.detail || '';
  if (x.action) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = x.action.label;
    b.addEventListener('click', () => runAction(x.action));
    el.appendChild(b);
  }
  return el;
}

function renderFindings() {
  const box = $('#findings');
  const okBox = $('#findings-ok');
  box.innerHTML = '';
  okBox.innerHTML = '';
  const f = state.findings;
  const notes = f.filter((x) => x.level === 'note');
  const attention = f.filter((x) => x.level === 'bad' || x.level === 'warn' || x.level === 'info');
  const fine = f.filter((x) => x.level === 'ok');
  const worry = attention.filter((x) => x.level !== 'info').length;

  const sum = $('#findings-summary');
  if (!f.length) sum.textContent = 'Nothing to report.';
  else if (!worry) sum.textContent = `Everything we checked looks fine.${attention.length ? ` ${attention.length} note${attention.length > 1 ? 's' : ''} below.` : ''}`;
  else sum.textContent = `${worry} thing${worry > 1 ? 's' : ''} to look at, ${fine.length} fine.`;

  const next = attention.find((x) => x.next);
  $('#next-action').classList.toggle('hidden', !next);
  if (next) $('#next-action').textContent = `Next step: ${next.next}`;

  $('#attention-title').classList.toggle('hidden', !attention.length);
  for (const x of attention) box.appendChild(findingCard(x));

  $('#findings-fine').classList.toggle('hidden', !fine.length);
  $('#fine-title').textContent = `Looks Fine (${fine.length})`;
  for (const x of fine) okBox.appendChild(findingCard(x));

  $('#findings-notes').textContent = notes.map((x) => x.title + (x.detail ? `. ${x.detail}` : '')).join(' ');

  const dot = worry ? '<span class="dot" role="img" aria-label="needs attention"></span>' : '';
  $('#tabs button[data-tab=check]').innerHTML = `Check${dot}`;
}

function runAction(a) {
  if (a.kind === 'tab') showTab(a.args);
  else quickKey(a.kind);
}

function showTab(name) {
  state.tab = name;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== `panel-${name}`));
  if (name === 'console') $('#term-in').focus();
  if (name === 'report') refreshReport();
}

// ---------------------------------------------------------------------------
// In-page confirmation (replaces the browser's own dialogs)

let confirmResolve = null;
function askConfirm(text, { typed = null, yes = 'Yes' } = {}) {
  showTab('console');
  const strip = $('#confirm-strip');
  const input = $('#confirm-input');
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yes;
  input.value = '';
  input.classList.toggle('hidden', !typed);
  if (typed) input.placeholder = `Type ${typed} to continue`;
  strip.classList.remove('hidden');
  strip.scrollIntoView({ block: 'nearest' });
  if (typed) input.focus(); else $('#confirm-yes').focus();
  return new Promise((resolve) => {
    confirmResolve = (v) => { strip.classList.add('hidden'); confirmResolve = null; resolve(v); };
  }).then((v) => (typed ? v && input.value.trim().toUpperCase() === typed : v));
}
function initConfirm() {
  $('#confirm-yes').addEventListener('click', () => confirmResolve && confirmResolve(true));
  $('#confirm-no').addEventListener('click', () => confirmResolve && confirmResolve(false));
  $('#confirm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmResolve && confirmResolve(true); } });
}

// ---------------------------------------------------------------------------
// Console

function appendTerm(e) {
  const term = $('#term');
  const atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 20;
  if (e.dir === 'tx') {
    const shown = e.text.replace(/\r/g, '⏎').replace(/\n/g, '⏎');
    const span = document.createElement('span');
    span.className = 'tx';
    span.textContent = `> ${shown}\n`;
    term.appendChild(span);
  } else if (e.dir === 'sys') {
    const span = document.createElement('span');
    span.className = 'sys';
    span.textContent = `${e.text}\n`;
    term.appendChild(span);
  } else {
    term.appendChild(document.createTextNode(e.text + '\n'));
  }
  while (term.childNodes.length > 4000) term.removeChild(term.firstChild);
  if (atBottom) term.scrollTop = term.scrollHeight;
}

function sysLine(text) { appendTerm({ dir: 'sys', text }); }

async function onTermSubmit(ev) {
  ev.preventDefault();
  const inp = $('#term-in');
  const text = inp.value;
  inp.value = '';
  if (!state.rx) return;
  try {
    await state.rx.send(text + '\r');
    if (!state.rx.inMenu) state.rx.inMenu = true;
    if (state.rx.inCli && (text === 'x' || text === 'exit')) state.rx.inCli = false;
    if (text === '+' && state.rx.inMenu) state.rx.inCli = true;
  } catch (e) { sysLine(`Could not send: ${e.message}`); }
}

async function guarded(label, fn) {
  if (!state.rx || state.busy) return;
  setBusy(true, label);
  try { await fn(); }
  catch (e) {
    sysLine(`${label} failed: ${e.message}`);
    if (e instanceof NoAnswerError) offerReconnect();
  }
  finally { setBusy(false); }
}

// The console went quiet (on a Torch: the LoRa radio took the port). Reopening the port restarts the unit.
function offerReconnect() {
  const d = $('#device-error');
  d.classList.remove('hidden');
  d.innerHTML = '<b>The unit stopped answering.</b> On a Torch this happens when the LoRa radio takes over the USB port. Reconnecting restarts the unit and brings the console back. ';
  const b = document.createElement('button');
  b.className = 'btn small';
  b.textContent = 'Reconnect';
  b.addEventListener('click', reconnect);
  d.appendChild(b);
}

async function reconnect() {
  const link = state.link;
  const port = state.port;
  if (!link || !port) return;
  $('#device-error').classList.add('hidden');
  stopLiveCard();
  try { await link.close(); } catch { /* ignore */ }
  await sleep(500);
  await link.open(port, CONFIG.consoleBaud);
  state.rx.inMenu = false; state.rx.inCli = false; state.rx.rebootSeen = false; state.rx.loraTimeoutOriginal = null;
  sysLine('Port reopened; the unit is restarting.');
  startLiveCard();
  await runCheck();
}

async function quickKey(key) {
  const rx = state.rx;
  if (!rx) return;
  switch (key) {
    case 'menu': return guarded('Opening the main menu', async () => { await rx.goMain(); showTab('console'); });
    case 'system': return guarded('Opening system status', () => enterSub('s', /^Menu: System/));
    case 'gnss': return guarded('Opening the GNSS menu', () => enterSub('1', /^Menu: GNSS Receiver/));
    case 'firmware': return guarded('Opening the firmware menu', () => enterSub('f', /^Menu: Firmware Update/));
    case 'back': return guarded('Going back', async () => {
      const lines = await rx._probe('x\r');
      if (lines.some((l) => /^Menu: Main/.test(l))) { rx.inMenu = true; rx.inCli = false; sysLine('Back at the main menu.'); }
      else if (lines.some((l) => /^Menu: /.test(l))) { rx.inMenu = true; }
      else if (lines.some((l) => /Exiting command mode/.test(l))) { rx.inCli = false; rx.inMenu = true; }
      else if (lines.some((l) => /,ERROR,/.test(l))) { sysLine('You are in command mode. Type exit, or use Main Menu.'); rx.inCli = true; }
      else { rx.inMenu = false; rx.inCli = false; rx.where = 'Closed'; sysLine('Menu closed. The unit is back to normal operation; use Main Menu to reopen it.'); }
    });
    case 'leave': return guarded('Closing the menu', async () => {
      await rx.goMain();
      await rx.send('x\r');
      rx.inMenu = false; rx.inCli = false; rx.where = 'Closed';
      await sleep(300);
      sysLine('Menu closed. The unit is back to normal operation.');
    });
    case 'rover': return guarded('Switching to rover mode', () => switchMode('R', 'ROVER'));
    case 'base': return guarded('Switching to base mode', () => switchMode('B', 'BASE'));
    case 'bt-on': return guarded('Turning Bluetooth on', async () => {
      if (!await askConfirm('Turn Bluetooth Low Energy on and restart the unit?')) return;
      await rx.set('bluetoothRadioType', 1);
      await rx.save();
      await rx.exe('REBOOT');
      sysLine('Bluetooth set to Low Energy. The unit is restarting.');
      await afterRestart();
    });
    case 'reboot': return guarded('Restarting the unit', async () => {
      if (!await askConfirm('Restart the unit now? It loses its current fix and comes back in a few seconds.', { yes: 'Restart' })) return;
      await rx.exe('REBOOT');
      sysLine('Restart requested.');
      await afterRestart();
    });
    case 'factory': return guarded('Factory reset', async () => {
      const ok = await askConfirm('This erases every setting on the unit (WiFi, NTRIP, profiles) and restarts it.', { typed: 'RESET', yes: 'Erase Everything' });
      if (!ok) { sysLine('Factory reset cancelled.'); return; }
      await rx.exe('FACTORYRESET');
      sysLine('Factory reset requested. The unit erases its settings and restarts.');
      await afterRestart();
    });
    default: return undefined;
  }
}

async function enterSub(key, titleRe) {
  await state.rx.goSub(key, titleRe);
  showTab('console');
}

// The System menu's R/B keys change the mode at once; on some firmware the menus then
// close by themselves, so do not insist on a menu print afterwards. Confirm by reading lastState.
async function switchMode(letter, word) {
  const rx = state.rx;
  await rx.goSub('s', /^Menu: System/);
  await rx.send(letter + '\r');
  await sleep(2500);
  for (let i = 0; i < 2; i++) {
    const at = rx.log.length;
    await rx.send('x\r');
    try { await rx.expect(/^x\) Exit/, 1500, at); } catch { break; }
  }
  rx.inMenu = false;
  await sleep(1500);
  const STATES = { 0: 'ROVER', 1: 'BASE', 2: 'NTP', 3: 'BASE CASTER', 4: 'BASE ASSIST' };
  let now = null;
  try {
    const r = await rx.get('lastState');
    if (!r.error) now = STATES[+r.value] || null;
    await rx.exitCli();
    await rx.exitMenu();
  } catch { /* leave it */ }
  if (now && now !== word) {
    sysLine(`The unit reports ${now} mode, not ${word}. Check the Console output above.`);
    $('#dev-mode').textContent = now;
  } else {
    sysLine(`Switched to ${word}. Give the unit a few seconds to reconfigure.`);
    $('#dev-mode').textContent = word;
  }
}

async function afterRestart() {
  setStage('Waiting for the unit to come back');
  await sleep(6000);
  if (state.rx) { state.rx.inMenu = false; state.rx.inCli = false; }
}

async function onSettingSubmit(ev) {
  ev.preventDefault();
  const name = $('#setting-name').value.trim();
  const value = $('#setting-value').value.trim();
  const out = $('#setting-out');
  if (!name) return;
  await guarded(value ? `Writing ${name}` : `Reading ${name}`, async () => {
    const rx = state.rx;
    if (value) {
      if (!await askConfirm(`Set ${name} to "${value}" on the unit?`, { yes: 'Set It' })) return;
      await rx.set(name, value);
      await rx.save();
      out.textContent = `${name} = ${value} (saved)`;
    } else {
      const r = await rx.get(name);
      out.textContent = r.error ? `${name}: ${r.error}` : `${name} = ${r.value}`;
    }
    await rx.exitCli();
  });
}

// ---------------------------------------------------------------------------
// Report

function reportInputs() {
  return {
    snap: state.snap, findings: state.findings, log: state.rx?.log || [],
    problem: $('#problem').value, contact: $('#contact').value, fw: state.fw,
  };
}

function refreshReport() {
  if (state.tab !== 'report' && !state.snap) return;
  $('#report-preview').value = buildReport(reportInputs());
}

async function onDownload() {
  const name = reportFileName(state.snap, 'html');
  const html = await buildReportHtml(reportInputs());
  downloadFile(name, html, 'text/html;charset=utf-8');
  $('#report-help').textContent = `Saved as ${name} in your downloads. It opens in any browser and prints to PDF.`;
}

function onEmail() {
  const fileName = reportFileName(state.snap, 'html');
  const sum = emailSummary({ snap: state.snap, findings: state.findings, problem: $('#problem').value, fileName });
  location.href = mailtoUrl(sum);
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(buildReport(reportInputs()));
    $('#report-help').textContent = 'The report text is on the clipboard. Paste it into a forum post or an email.';
  } catch (e) {
    $('#report-help').textContent = `Could not copy: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Firmware

function renderManualLinks() {
  const d = CONFIG.docs;
  const items = [
    ['Main firmware with the SparkFun uploader (Windows, macOS, Linux)', d.esp32Update],
    ['LG290P receiver (TX2, Postcard) with QGNSS', d.lg290pUpdate],
    ['UM980 receiver (Torch) with UPrecise', d.um980Update],
    ['u-blox receivers (FPX, EVK)', d.ubloxUpdate],
    ['mosaic-X5 receiver (FPM, Facet X5)', d.mosaicUpdate],
    ['LoRa radio (Torch) with STM32CubeProgrammer', d.loraUpdate],
  ];
  $('#manual-links').innerHTML = items.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('');
}

function renderVersions() {
  const tb = $('#versions tbody');
  tb.innerHTML = '';
  const src = $('#fw-source');
  if (state.fwError) src.textContent = `The firmware list could not be loaded (${state.fwError.message}). Updates are unavailable until it loads.`;
  else if (state.fw) src.textContent = `Firmware list from ${state.fw.url.replace(/^https:\/\/raw\.githubusercontent\.com\//, '')} (checked ${state.fw.loadedAt.toLocaleString()}).`;
  const rows = state.snap ? installedVersions(state.snap) : [];
  const rel = state.fw ? latestMain(state.fw.rows, { rc: false }) : null;
  const beta = state.fw ? latestMain(state.fw.rows, { rc: true }) : null;
  $('#fw-release-label').textContent = rel ? `${rowVersion(rel)} (${(rel.bytes / 1048576).toFixed(1)} MB)` : '(list not loaded)';
  $('#fw-beta-label').textContent = beta ? `${rowVersion(beta)} (${(beta.bytes / 1048576).toFixed(1)} MB)` : '(none)';
  $$('input[name=fw-pick]')[1].disabled = !beta;

  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" class="muted">Connect a unit to see its versions.</td></tr>';
  }
  let banner = null;
  for (const v of rows) {
    const tr = document.createElement('tr');
    let latest = '-'; let status = ''; let cls = 'status-info';
    if (v.subsystem === 'Main') {
      const inst = mainVersionOf(state.snap);
      if (rel) {
        latest = rowVersion(rel);
        if (inst?.dev) { status = 'Developer build: update over USB'; cls = 'status-old'; banner = banner || `This unit runs a developer build (${inst.raw}). The current release is ${rowVersion(rel)}; writing it over USB takes about four minutes.`; }
        else if (inst && compareMain(inst, rel) < 0) { status = 'Update available below'; cls = 'status-old'; banner = banner || `Main firmware ${rowVersion(rel)} is available (this unit has ${inst.raw}). Updating over USB takes about four minutes.`; }
        else if (inst) { status = 'Current'; cls = 'status-ok'; }
      }
    } else if (state.fw) {
      const row = latestFor(state.fw.rows, v.chip);
      if (row) {
        latest = rowVersion(row);
        const c = compareSubsystem(v.version, row);
        if (c === null) status = 'Not comparable';
        else if (c < 0) { status = 'Update available over WiFi'; cls = 'status-old'; }
        else { status = 'Current'; cls = 'status-ok'; }
      }
    }
    tr.innerHTML = '<td></td><td></td><td></td><td class=""></td>';
    const cells = tr.children;
    cells[0].textContent = `${v.subsystem} (${v.chip})`; cells[0].dataset.label = 'Part';
    cells[1].textContent = v.version || '(unknown)'; cells[1].dataset.label = 'Installed';
    cells[2].textContent = latest; cells[2].dataset.label = 'Latest release';
    cells[3].textContent = status; cells[3].dataset.label = 'Status'; cells[3].className = cls;
    tb.appendChild(tr);
  }
  $('#fw-banner').classList.toggle('hidden', !banner || !state.rx);
  if (banner) $('#fw-banner-text').textContent = banner;
  updateFlashButton();
}

function updateFlashButton() {
  const pick = $('input[name=fw-pick]:checked')?.value;
  const row = state.fw ? latestMain(state.fw.rows, { rc: pick === 'beta' }) : null;
  $('#btn-flash').disabled = state.busy || !row || !$('#fw-ack').checked || !state.rx;
}

function flashLog(text, partial = false) {
  const el = $('#flash-log');
  el.classList.remove('hidden');
  if (partial) el.textContent += text; else el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

async function onFlash() {
  if (!state.rx || state.busy || !state.fw) return;
  const pick = $('input[name=fw-pick]:checked')?.value;
  const row = latestMain(state.fw.rows, { rc: pick === 'beta' });
  if (!row) return;
  const inst = mainVersionOf(state.snap);
  const ok = await askConfirm(`Write main firmware ${rowVersion(row)} to the unit${inst ? ` (currently ${inst.raw})` : ''}? The unit restarts and the cable must stay in for a few minutes.`, { yes: 'Write It' });
  showTab('update');
  if (!ok) return;

  setBusy(true, 'Updating the main firmware');
  $('#flash-log').textContent = '';
  const bar = $('#flash-bar');
  $('#flash-progress').classList.remove('hidden');
  bar.style.width = '0%';
  const d = $('#device-error');
  d.classList.add('hidden');
  try {
    flashLog(`Downloading ${row.file_name}`);
    const app = await downloadBinary(fileUrl(row), (got, total) => { bar.style.width = `${total ? Math.round((got / total) * 20) : 5}%`; });
    if (row.bytes && app.length !== row.bytes) throw new Error(`Downloaded ${app.length} bytes, expected ${row.bytes}`);
    if (row.crc32 !== null) {
      const c = crc32(app);
      if (c !== row.crc32) throw new Error(`Checksum mismatch (got ${c.toString(16)}, expected ${row.crc32.toString(16)})`);
      flashLog(`Checksum verified (${app.length} bytes).`);
    }
    flashLog('Downloading the boot record');
    const bootApp0 = await downloadBinary(CONFIG.bootApp0Url);
    bar.style.width = '22%';

    if (state.link.kind === 'sim') {
      flashLog('Simulated unit: pretending to write.');
      for (let i = 22; i <= 100; i += 6) { await sleep(150); bar.style.width = `${i}%`; }
      flashLog('Done (simulation).');
      return;
    }

    flashLog('Closing the console and entering the bootloader');
    try { await state.rx.restoreLoraTimeout(); await state.rx.exitMenu(); } catch { /* ignore */ }
    const link = state.link;
    const port = state.port;
    stopLiveCard();
    await link.close();
    try {
      await flashMain({
        port, app, bootApp0, baud: 115200,
        log: flashLog,
        progress: (idx, written, total, count) => {
          const base = 22 + (78 * idx) / count;
          bar.style.width = `${Math.round(base + (78 / count) * (written / total))}%`;
        },
      });
    } finally {
      flashLog('Reopening the console');
      await sleep(1500);
      await link.open(port, CONFIG.consoleBaud);
      state.rx.inMenu = false; state.rx.inCli = false; state.rx.rebootSeen = false;
      startLiveCard();
    }
    bar.style.width = '100%';
    flashLog('Update finished. Waiting for the unit to start, then checking it again.');
    await sleep(8000);
    setBusy(false);
    await runCheck();
    showTab('check');
  } catch (e) {
    flashLog(`Update failed: ${e.message}`);
    d.classList.remove('hidden');
    d.innerHTML = `<b>The update did not complete.</b> ${e.message}. The unit normally still starts with its old firmware. If it does not, the <a href="${CONFIG.docs.esp32Update}" target="_blank" rel="noopener">SparkFun uploader</a> can rewrite it fully.`;
  } finally {
    setBusy(false);
  }
}

function wifiLog(text) {
  const el = $('#wifi-log');
  el.classList.remove('hidden');
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

async function onWifiUpdate() {
  const rx = state.rx;
  if (!rx || state.busy) return;
  const ssid = $('#wifi-ssid').value.trim();
  const pass = $('#wifi-pass').value;
  const ok = await askConfirm('Ask the unit to check SparkFun\'s servers over WiFi and install newer firmware for its receiver, radio and tilt sensor? It restarts when done.', { yes: 'Start' });
  showTab('update');
  if (!ok) return;
  setBusy(true, 'Asking the unit to update over WiFi');
  $('#wifi-log').textContent = '';
  try {
    if (ssid) {
      wifiLog(`Saving WiFi network "${ssid}" on the unit`);
      await rx.set('wifiNetwork_0SSID', ssid);
      await rx.set('wifiNetwork_0Password', pass);
      await rx.save();
    }
    await rx.goSub('f', /^Menu: Firmware Update/);
    const menuLines = rx.linesSince(Math.max(0, rx.log.length - 40));
    if (!menuLines.some((l) => /^P\) Update to latest product/.test(l))) {
      wifiLog('This firmware has no automatic product update in its menu. The firmware menu is open in the Console tab; the options it offers are listed there.');
      showTab('console');
      return;
    }
    const from = rx.log.length;
    await rx.send('P\r');
    wifiLog('Update requested. The unit connects to WiFi, downloads and writes each newer part. This can take 10 minutes or more.');
    const t0 = Date.now();
    let lastShown = from;
    let outcome = null;
    while (Date.now() - t0 < 15 * 60 * 1000) {
      await sleep(1000);
      if (!state.rx) { outcome = 'lost'; break; }
      const lines = rx.linesSince(lastShown);
      lastShown = rx.log.length;
      for (const l of lines) {
        wifiLog(l);
        if (/update completed successfully|updated successfully|Rebooting/i.test(l)) outcome = 'done';
        if (/No Internet|firmware update failed|ERROR/i.test(l)) outcome = outcome || 'failed';
        if (/No new firmware|is current|up to date/i.test(l)) outcome = outcome || 'current';
      }
      if (rx.rebootSeen) { outcome = 'done'; break; }
      if (outcome === 'failed' || outcome === 'current') break;
    }
    if (outcome === 'done') wifiLog('The unit restarted after the update. Running the check again.');
    else if (outcome === 'failed') wifiLog('The unit could not complete the update. The most common cause is no internet on the WiFi network, or a 5 GHz only network; the unit needs 2.4 GHz.');
    else if (outcome === 'current') wifiLog('Nothing newer was found for this unit.');
    else if (outcome === 'lost') wifiLog('The connection was lost while waiting.');
    else wifiLog('No clear outcome was seen in 15 minutes. The Console tab shows everything the unit printed.');
    if (state.rx) {
      state.rx.inMenu = false; state.rx.inCli = false;
      if (outcome === 'done') { await sleep(6000); setBusy(false); await runCheck(); }
      else { try { await rx.send('x\r'); await rx.exitMenu(); } catch { /* ignore */ } }
    }
  } catch (e) {
    wifiLog(`Could not start the update: ${e.message}`);
  } finally {
    setBusy(false);
  }
}

init();

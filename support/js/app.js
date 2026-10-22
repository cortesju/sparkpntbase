// Page wiring: connect, check, console, report, update.

import { CONFIG } from './config.js?v=1792700804';
import { SerialLink } from './link.js?v=1792700804';
import { SimLink } from './sim.js?v=1792700804';
import { Receiver, NoAnswerError, sleep } from './receiver.js?v=1792700804';
import { runChecks, stateWord } from './checks.js?v=1792700804';
import {
  loadFirmwareList, latestMain, latestFor, rowVersion, fileUrl, downloadBinary, crc32, flashMain,
  installedVersions, mainVersionOf, compareMain, compareSubsystem,
} from './firmware.js?v=1792700804';
import { buildReport, reportFileName, downloadText, emailSummary, mailtoUrl, shareReport } from './report.js?v=1792700804';

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
  $('#footer-mail').href = `mailto:${CONFIG.supportEmail}`;
  $('#footer-mail').textContent = CONFIG.supportEmail;

  const params = new URLSearchParams(location.search);
  state.sim = params.get('sim');

  if (!SerialLink.supported() && !state.sim) {
    const h = $('#browser-hint');
    h.classList.remove('hidden');
    h.innerHTML = 'This browser cannot open USB ports. Please use <b>Chrome</b> or <b>Edge</b> on a computer (Windows, macOS, Linux or ChromeOS). Phones and tablets cannot run this page yet.';
    $('#btn-connect').disabled = true;
    $('#btn-connect-any').disabled = true;
  }
  if (state.sim) {
    $('#btn-connect').textContent = `Connect The Simulated ${state.sim.toUpperCase()}`;
    $('#btn-connect-any').classList.add('hidden');
  }

  $('#btn-connect').addEventListener('click', () => connect(false));
  $('#btn-connect-any').addEventListener('click', () => connect(true));
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
  $('#btn-share').addEventListener('click', onShare);
  $('#fw-ack').addEventListener('change', updateFlashButton);
  $$('input[name=fw-pick]').forEach((r) => r.addEventListener('change', updateFlashButton));
  $('#btn-flash').addEventListener('click', onFlash);
  $('#btn-wifi-update').addEventListener('click', onWifiUpdate);
  if (navigator.share) $('#btn-share').classList.remove('hidden');

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
    state.link = link;
    state.port = port;
    state.rx = new Receiver(link);
    state.rx.onLog(appendTerm);
    link.onClose((e) => onLinkLost(e ? 'The connection dropped.' : 'The port closed.'));
    $('#view-connect').classList.add('hidden');
    $('#view-device').classList.remove('hidden');
    $('#dev-kind').textContent = link.kind === 'sim' ? 'Simulated Unit' : `Connected On ${link.label()}`;
    $('#dev-name').textContent = 'Reading the unit';
    $('#dev-sub').textContent = '';
    startLiveCard();
    await runCheck();
  } catch (e) {
    if (e && e.name === 'NotFoundError') return; // user closed the chooser
    err.classList.remove('hidden');
    if (e && /Failed to open|already open|in use|Access denied/i.test(e.message)) {
      err.innerHTML = `<b>The port is busy.</b> Another program (a terminal, the firmware uploader, a GNSS tool) has it open. Close that program and try again.`;
    } else {
      err.textContent = `Could not connect: ${e.message || e}`;
    }
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
        tried.push(`${link.label()}: ${/open|busy|denied|in use/i.test(e.message) ? 'busy' : e.message}`);
        continue;
      }
      const rx = new Receiver(link);
      let header = null;
      try { header = await rx.openMenu(20000); } catch { /* silent port */ }
      if (!header) {
        tried.push(`${link.label()}: no answer (${link.rxBytes} bytes)`);
        await link.close();
        continue;
      }
      state.link = link; state.port = port; state.rx = rx;
      rx.onLog(appendTerm);
      for (const e of rx.log) appendTerm(e);
      link.onClose((e) => onLinkLost(e ? 'The connection dropped.' : 'The port closed.'));
      $('#view-connect').classList.add('hidden');
      $('#view-device').classList.remove('hidden');
      $('#dev-kind').textContent = `Connected On ${link.label()}`;
      $('#dev-name').textContent = 'Reading the unit';
      $('#dev-sub').textContent = '';
      startLiveCard();
      await runCheck();
      return;
    }
    err.classList.remove('hidden');
    err.innerHTML = `<b>No allowed port answered.</b> ${tried.join('; ')}. Check that the unit is on, then try again or use Connect A Unit to pick a port.`;
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
  $('#findings-summary').textContent = 'Waiting for the first check.';
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

function setBusy(on, text = '') {
  state.busy = on;
  $('#progress').classList.toggle('hidden', !on);
  $('#progress-text').textContent = text;
  $$('.key').forEach((b) => { b.disabled = on; });
  $('#btn-recheck').disabled = on;
  $('#btn-flash').disabled = on || !$('#fw-ack').checked;
  $('#btn-wifi-update').disabled = on;
}

async function runCheck() {
  if (!state.rx || state.busy) return;
  const d = $('#device-error');
  d.classList.add('hidden');
  setBusy(true, 'Opening the configuration menu');
  try {
    state.snap = await state.rx.fullCheck((t) => { $('#progress-text').textContent = t; });
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
    html = `<b>This looks like the GNSS data port, not the console.</b> The unit shows two ports; disconnect and pick the other <i>USB-Enhanced-SERIAL</i> entry.`;
  } else if (rx > 100) {
    html = `<b>The unit is sending data but did not open its menu.</b> If the lines in the Console tab start with $G, this is the GNSS data port: disconnect and pick the other port. Otherwise try Run Check Again.`;
  } else {
    html = `<b>Nothing came back from the unit.</b> Check that it is powered on, that the cable carries data (not a charge-only cable), and that you picked the port ending in B. On Windows an unknown device in Device Manager means the <a href="${CONFIG.docs.ch340Driver}" target="_blank" rel="noopener">CH340 driver</a> is missing.`;
  }
  d.innerHTML = html;
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
}

function renderFindings() {
  const box = $('#findings');
  box.innerHTML = '';
  const f = state.findings;
  const worry = f.filter((x) => x.level === 'bad' || x.level === 'warn').length;
  const sum = $('#findings-summary');
  if (!f.length) sum.textContent = 'Nothing to report.';
  else if (!worry) sum.textContent = `Everything we checked looks fine. ${f.length} items below.`;
  else sum.textContent = `${worry} thing${worry > 1 ? 's' : ''} to look at, ${f.length - worry} fine.`;
  const marks = { ok: '✓', info: 'i', warn: '!', bad: '×' };
  for (const x of f) {
    const el = document.createElement('div');
    el.className = `finding ${x.level}`;
    el.innerHTML = `<div class="mark">${marks[x.level]}</div><div><h4></h4><p></p></div>`;
    el.querySelector('h4').textContent = x.title;
    el.querySelector('p').textContent = x.detail || '';
    if (x.action) {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = x.action.label;
      b.addEventListener('click', () => runAction(x.action));
      el.appendChild(b);
    }
    box.appendChild(el);
  }
  const dot = worry ? '<span class="dot"></span>' : '';
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
    // Keep the receiver's idea of where we are roughly right.
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
      else { rx.inMenu = false; rx.inCli = false; sysLine('Menu closed. The unit is back to normal operation; use Main Menu to reopen it.'); }
    });
    case 'leave': return guarded('Leaving the menu', async () => {
      await rx.goMain();
      await rx.send('x\r');
      rx.inMenu = false; rx.inCli = false;
      await sleep(300);
      sysLine('Menu closed. The unit is back to normal operation.');
    });
    case 'rover': return guarded('Switching to rover mode', () => switchMode('R', 'ROVER'));
    case 'base': return guarded('Switching to base mode', () => switchMode('B', 'BASE'));
    case 'bt-on': return guarded('Turning Bluetooth on', async () => {
      if (!confirm('Turn Bluetooth Low Energy on and restart the unit?')) return;
      await rx.set('bluetoothRadioType', 1);
      await rx.save();
      await rx.exe('REBOOT');
      sysLine('Bluetooth set to Low Energy. The unit is restarting.');
      await afterRestart();
    });
    case 'reboot': return guarded('Restarting the unit', async () => {
      if (!confirm('Restart the unit now? It loses its current fix and comes back in a few seconds.')) return;
      await rx.exe('REBOOT');
      sysLine('Restart requested.');
      await afterRestart();
    });
    case 'factory': return guarded('Factory reset', async () => {
      const typed = prompt('This erases every setting on the unit (WiFi, NTRIP, profiles) and restarts it. Type RESET to continue.');
      if (typed !== 'RESET') { sysLine('Factory reset cancelled.'); return; }
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
  $('#progress-text').textContent = 'Waiting for the unit to come back';
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
      if (!confirm(`Set ${name} to "${value}" on the unit?`)) return;
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

function currentReport() {
  return buildReport({
    snap: state.snap, findings: state.findings, log: state.rx?.log || [],
    problem: $('#problem').value, contact: $('#contact').value, fw: state.fw,
  });
}

function refreshReport() {
  if (state.tab !== 'report' && !state.snap) return;
  $('#report-preview').value = currentReport();
}

function onDownload() {
  const name = reportFileName(state.snap);
  downloadText(name, currentReport());
  $('#report-help').textContent = `Saved as ${name} in your downloads. Now press Email Us and attach that file to the message that opens.`;
}

function onEmail() {
  const fileName = reportFileName(state.snap);
  const sum = emailSummary({ snap: state.snap, findings: state.findings, problem: $('#problem').value, fileName });
  location.href = mailtoUrl(sum);
  $('#report-help').textContent = `Your mail program opened a message to ${CONFIG.supportEmail}. Attach the report file you downloaded (${fileName}) before sending.`;
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(currentReport());
    $('#report-help').textContent = 'The report is on the clipboard. Paste it into an email or a forum post.';
  } catch (e) {
    $('#report-help').textContent = `Could not copy: ${e.message}`;
  }
}

async function onShare() {
  try {
    const ok = await shareReport(reportFileName(state.snap), currentReport(), 'SparkPNT support report');
    if (!ok) $('#report-help').textContent = 'Sharing files is not available here. Use Download Report instead.';
  } catch (e) {
    if (e.name !== 'AbortError') $('#report-help').textContent = `Could not share: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Update

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
  for (const v of rows) {
    const tr = document.createElement('tr');
    let latest = '-'; let status = ''; let cls = 'status-info';
    if (v.subsystem === 'Main') {
      const inst = mainVersionOf(state.snap);
      if (rel) {
        latest = rowVersion(rel);
        if (inst?.dev) { status = 'Developer build'; cls = 'status-old'; }
        else if (inst && compareMain(inst, rel) < 0) { status = 'Update available'; cls = 'status-old'; }
        else if (inst) { status = 'Current'; cls = 'status-ok'; }
      }
    } else if (state.fw) {
      const row = latestFor(state.fw.rows, v.chip);
      if (row) {
        latest = rowVersion(row);
        const c = compareSubsystem(v.version, row);
        if (c === null) status = 'Not comparable';
        else if (c < 0) { status = 'Update available'; cls = 'status-old'; }
        else { status = 'Current'; cls = 'status-ok'; }
      }
    }
    tr.innerHTML = `<td></td><td></td><td></td><td class="${cls}"></td>`;
    tr.children[0].textContent = `${v.subsystem} (${v.chip})`;
    tr.children[1].textContent = v.version || '(unknown)';
    tr.children[2].textContent = latest;
    tr.children[3].textContent = status;
    tb.appendChild(tr);
  }
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
  const msg = `Write main firmware ${rowVersion(row)} to the unit${inst ? ` (currently ${inst.raw})` : ''}? The unit restarts and the cable must stay in for a few minutes.`;
  if (!confirm(msg)) return;

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
  if (!confirm('Ask the unit to check SparkFun\'s servers over WiFi and install newer firmware for its receiver, radio and tilt sensor? It restarts when done.')) return;
  setBusy(true, 'Asking the unit to update over WiFi');
  $('#wifi-log').textContent = '';
  try {
    if (ssid) {
      wifiLog(`Saving WiFi network "${ssid}" on the unit`);
      await rx.set('wifiNetwork_0SSID', ssid);
      await rx.set('wifiNetwork_0Password', pass);
      await rx.save();
    }
    await rx.exitCli();
    if (!rx.inMenu) await rx.openMenu();
    let from = rx.log.length;
    await rx.send('f\r');
    await rx.expect(/^x\) Exit/, 4000, from);
    const menuLines = rx.linesSince(from);
    if (!menuLines.some((l) => /^P\) Update to latest product/.test(l))) {
      wifiLog('This firmware has no automatic product update in its menu. The firmware menu is open in the Console tab; the options it offers are listed there.');
      showTab('console');
      return;
    }
    from = rx.log.length;
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

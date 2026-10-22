// Builds the support report, and the ways to get it to us.

import { CONFIG } from './config.js?v=1792701697';
import { CLI_KEYS } from './receiver.js?v=1792701697';
import { installedVersions } from './firmware.js?v=1792701697';
import { stateWord, formatUptime } from './checks.js?v=1792701697';

export function buildReport({ snap, findings, log, problem, contact, fw }) {
  const L = [];
  const line = (s = '') => L.push(s);
  const kv = (k, v) => line(`${(k + ':').padEnd(26)}${v === null || v === undefined || v === '' ? '-' : v}`);
  const unit = snap?.header ? `${snap.header.brand} ${snap.header.product}` : 'unknown unit';

  line(`${CONFIG.siteName} report`);
  line('='.repeat(60));
  kv('Created', new Date().toISOString());
  kv('Page version', CONFIG.siteVersion);
  kv('Browser', navigator.userAgent);
  kv('Connection', snap?.linkKind === 'sim' ? 'SIMULATED UNIT (not real hardware)' : 'USB serial');
  line();
  line('Problem description');
  line('-'.repeat(60));
  line(problem?.trim() ? problem.trim() : '(not filled in)');
  if (contact?.trim()) kv('Contact', contact.trim());
  line();

  if (!snap) {
    line('No unit was read. The console log is below.');
  } else {
    line('Unit');
    line('-'.repeat(60));
    kv('Product', unit);
    kv('Main firmware', snap.header?.version);
    kv('Mode', snap.header?.mode);
    kv('Bluetooth', snap.header?.bluetooth === 'Off' ? 'Off' : `${snap.header?.bluetooth || '-'} as ${snap.header?.bluetoothName || '-'}`);
    kv('Device id', snap.cli?.deviceId?.value);
    kv('Bluetooth id', snap.cli?.bluetoothId?.value);
    kv('Restarted on connect', snap.rebootSeen ? 'yes' : 'no');
    line();
    line('Firmware');
    line('-'.repeat(60));
    for (const v of installedVersions(snap)) kv(`${v.subsystem} (${v.chip})`, v.version || '(unknown)');
    if (fw) kv('Firmware list', `${fw.url} (${fw.loadedAt.toISOString()})`);
    line();
    line('System status');
    line('-'.repeat(60));
    const s = snap.system;
    if (s) {
      kv('Battery', s.battery !== null ? `${s.battery}% / ${s.voltage} V` : s.fuelGauge);
      kv('microSD', s.microSd);
      kv('Display', s.display);
      kv('Bluetooth radio', s.bluetooth ? `${s.bluetooth} (${s.serial}) ${s.bluetoothConnected ? 'connected' : 'not connected'}` : null);
      kv('Uptime', s.uptimeSeconds !== undefined ? `${formatUptime(s.uptimeSeconds)} (resets: ${s.resets})` : null);
      kv('NTRIP client', s.ntripClient);
      for (const srv of s.ntripServers) kv(`NTRIP server ${srv.index}`, srv.status);
      kv('Parser filtered', s.parserFiltered ? `${s.parserFiltered.nmea} NMEA / ${s.parserFiltered.rtcm} RTCM / ${s.parserFiltered.ubx} UBX` : null);
      for (const o of s.other) line(`  ${o}`);
    } else line('(not read)');
    line();
    line('GNSS receiver');
    line('-'.repeat(60));
    kv('Chip', snap.gnss?.chip);
    kv('Version line', snap.gnss?.versionLine);
    kv('Module id', snap.gnss?.moduleId);
    line();
    line('Live position (last lines seen)');
    line('-'.repeat(60));
    const live = snap.live.filter((l) => l.kind !== 'battery').slice(-6);
    if (!live.length) line('(none printed while watching)');
    for (const l of live) {
      if (l.kind === 'rover') line(`  ${stateWord(l.state)}  accuracy ${l.accuracy} ${l.units}  SIV ${l.siv}`);
      else line(`  ${l.state}  SIV ${l.siv}`);
    }
    line();
    line('Settings read');
    line('-'.repeat(60));
    for (const [key, label] of CLI_KEYS) {
      const v = snap.cli?.[key];
      if (!v) continue;
      kv(label, v.error ? `(${v.error})` : v.value);
    }
    line();
    line('Settings that differ from defaults');
    line('-'.repeat(60));
    if (snap.changed?.error) line(`(${snap.changed.error})`);
    else if (!snap.changed?.rows?.length) line('(none)');
    else for (const r of snap.changed.rows) line(`  ${r.name} = ${maskSecret(r.name, r.value)}`);
    line();
    if (snap.errors.length) {
      line('Readings that failed');
      line('-'.repeat(60));
      for (const e of snap.errors) line(`  ${e}`);
      line();
    }
  }

  line('Findings');
  line('-'.repeat(60));
  if (!findings?.length) line('(no check was run)');
  for (const f of findings || []) {
    line(`[${f.level.toUpperCase().padEnd(4)}] ${f.title}`);
    if (f.detail) line(`       ${f.detail}`);
  }
  line();
  line('Console log (what the unit printed, oldest first)');
  line('-'.repeat(60));
  const tail = (log || []).slice(-1500);
  for (const e of tail) {
    const t = new Date(e.t).toISOString().slice(11, 23);
    const text = e.dir === 'tx' ? `> ${JSON.stringify(e.text)}` : e.text;
    line(`${t} ${maskLogSecrets(text)}`);
  }
  line();
  line('Raw snapshot (JSON)');
  line('-'.repeat(60));
  line(JSON.stringify(stripSecrets(snap), null, 1));
  return L.join('\n');
}

const SECRET_RE = /(PW|Password|Token|Key|ClientID)$/i;
function maskSecret(name, value) {
  return SECRET_RE.test(name) && value ? '(hidden)' : value;
}
function maskLogSecrets(text) {
  return text.replace(/(\$SPLST,[^,]*(?:PW|Password|Token|Key|ClientID),[^,]*,)[^*]*/gi, '$1(hidden)');
}
function stripSecrets(snap) {
  if (!snap) return null;
  const copy = JSON.parse(JSON.stringify(snap));
  if (copy.changed?.rows) for (const r of copy.changed.rows) r.value = maskSecret(r.name, r.value);
  if (copy.cli) for (const k of Object.keys(copy.cli)) if (SECRET_RE.test(k) && copy.cli[k].value) copy.cli[k].value = '(hidden)';
  return copy;
}

export function reportFileName(snap, ext = 'txt') {
  const who = (snap?.header?.bluetoothName || snap?.header?.product || 'unit').replace(/[^A-Za-z0-9-]+/g, '-');
  const d = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `SparkPNT-report-${who}-${d}.${ext}`;
}

export function downloadFile(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const downloadText = downloadFile;

// ---- Branded HTML report -----------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let logoCache = null;
async function logoSvg() {
  if (logoCache !== null) return logoCache;
  try {
    const res = await fetch('assets/sparkpnt-logo-black.svg');
    logoCache = res.ok ? await res.text() : '';
  } catch { logoCache = ''; }
  return logoCache;
}

// A self-contained page: SparkPNT header, summary, findings, versions, status, settings,
// then the console log and raw data folded away, and the plain-text report at the end for support.
export async function buildReportHtml(inputs) {
  const { snap, findings, problem, contact } = inputs;
  const text = buildReport(inputs);
  const logo = await logoSvg();
  const h = snap?.header || {};
  const unit = h.product ? `${h.brand} ${h.rtkPrefix ? 'RTK ' : ''}${h.product}` : 'Unknown unit';
  const live = (snap?.live || []).filter((l) => l.kind !== 'battery').slice(-1)[0];
  const fix = live ? (live.kind === 'rover' ? stateWord(live.state) : live.state) : '-';
  const acc = live && live.kind === 'rover' ? `${live.beyond ? '> ' : ''}${live.accuracy} ${live.units}` : '-';
  const batt = snap?.cli?.batteryLevelPercent?.value ?? snap?.system?.battery;
  const when = new Date();
  const marks = { ok: '✓', info: 'i', warn: '!', bad: '×', note: '·' };
  const rowsKv = (pairs) => pairs.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const versions = snap ? installedVersions(snap).map((v) => `<tr><th>${esc(v.subsystem)} (${esc(v.chip)})</th><td>${esc(v.version || '(unknown)')}</td></tr>`).join('') : '';
  const s = snap?.system;
  const status = s ? rowsKv([
    ['Battery', s.battery !== null ? `${s.battery}% / ${s.voltage} V` : s.fuelGauge],
    ['microSD', s.microSd], ['Display', s.display],
    ['Bluetooth radio', s.bluetooth ? `${s.bluetooth} (${s.serial}) ${s.bluetoothConnected ? 'connected' : 'not connected'}` : null],
    ['Uptime', s.uptimeSeconds !== undefined ? `${formatUptime(s.uptimeSeconds)} (resets: ${s.resets})` : null],
    ['NTRIP client', s.ntripClient],
    ['Parser filtered', s.parserFiltered ? `${s.parserFiltered.nmea} NMEA / ${s.parserFiltered.rtcm} RTCM / ${s.parserFiltered.ubx} UBX` : null],
  ]) : '';
  const changed = (snap?.changed?.rows || []).map((r) => `<tr><th>${esc(r.name)}</th><td>${esc(maskSecret(r.name, r.value))}</td></tr>`).join('');
  const settings = CLI_KEYS.map(([key, label]) => { const v = snap?.cli?.[key]; return v ? `<tr><th>${esc(label)}</th><td>${esc(v.error ? `(${v.error})` : v.value)}</td></tr>` : ''; }).join('');
  const findingItems = (findings || []).map((f) => `<li class="${f.level}"><span class="mark">${marks[f.level] || ''}</span><div><b>${esc(f.title)}</b>${f.detail ? `<p>${esc(f.detail)}</p>` : ''}</div></li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SparkPNT support report: ${esc(unit)}</title>
<style>
body{margin:0;font:15px/1.45 Roboto,Arial,sans-serif;color:#333;background:#fff}
main{max-width:860px;margin:0 auto;padding:28px 24px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #D9D9D9;padding-bottom:16px;margin-bottom:24px}
header svg,header img{height:26px;width:auto}
header .t{font:600 14px Archivo,Arial,sans-serif;color:#171717;letter-spacing:.08em;text-transform:uppercase}
h1,h2{font-family:Archivo,Arial,sans-serif;font-weight:600;color:#171717;line-height:1.1;margin:0 0 8px}
h1{font-size:30px}h2{font-size:18px;margin-top:28px}
.muted{color:#737373}
.card{background:#FAFAFA;border-radius:14px;padding:18px 20px;margin:18px 0}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:12px}
.stats div{font:600 17px Archivo,Arial,sans-serif;color:#171717}
.stats small{display:block;font:500 10px Roboto,Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#737373;margin-bottom:2px}
.problem{white-space:pre-wrap;background:#FFDDBF;border-radius:12px;padding:14px 16px}
ul.findings{list-style:none;padding:0;margin:0}
ul.findings li{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:#FAFAFA;margin-bottom:6px}
ul.findings li.warn{background:#FFFBEB}ul.findings li.bad{background:#FFF1F2}
ul.findings .mark{flex:0 0 24px;height:24px;border-radius:50%;color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;background:#B45309}
ul.findings li.ok .mark{background:#4D7C0F}ul.findings li.bad .mark{background:#BE123C}ul.findings li.note .mark{background:#737373}
ul.findings p{margin:2px 0 0;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #EEE;vertical-align:top}
th{width:38%;font-weight:500;color:#171717}
details{margin-top:18px}summary{cursor:pointer;font-weight:500;color:#171717}
pre{background:#171717;color:#E6E6E6;border-radius:10px;padding:14px;font:12px/1.4 Consolas,Menlo,monospace;overflow:auto;white-space:pre-wrap;word-break:break-all;max-height:520px}
footer{margin-top:36px;border-top:1px solid #D9D9D9;padding-top:12px;font-size:12px;color:#737373}
@media print{details{display:block}details[open] pre{max-height:none}.noprint{display:none}}
@media (max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main>
<header>${logo || '<span class="t">SparkPNT</span>'}<span class="t">Device Support Report</span></header>
<h1>${esc(unit)}</h1>
<p class="muted">${esc(when.toLocaleString())} · ${esc(h.version ? `firmware ${h.version}` : '')}${h.bluetoothName ? ` · ${esc(h.bluetoothName)}` : ''}${snap?.linkKind === 'sim' ? ' · SIMULATED UNIT' : ''}</p>
<div class="card"><div class="stats">
<div><small>Mode</small>${esc((h.mode || '-').toUpperCase())}</div>
<div><small>Fix</small>${esc(fix)}</div>
<div><small>Satellites</small>${esc(live ? live.siv : '-')}</div>
<div><small>Accuracy</small>${esc(acc)}</div>
<div><small>Battery</small>${esc(batt !== undefined && batt !== null ? `${batt}%` : '-')}</div>
</div></div>
<h2>Problem Description</h2>
<div class="problem">${esc(problem?.trim() || '(not filled in)')}</div>
${contact?.trim() ? `<p class="muted">Contact: ${esc(contact.trim())}</p>` : ''}
<h2>Findings</h2>
<ul class="findings">${findingItems || '<li><div>(no check was run)</div></li>'}</ul>
<h2>Firmware</h2>
<table>${versions || '<tr><td>(not read)</td></tr>'}</table>
<h2>System Status</h2>
<table>${status || '<tr><td>(not read)</td></tr>'}</table>
<h2>Settings Changed From Defaults</h2>
<table>${changed || `<tr><td>${esc(snap?.changed?.error ? `(${snap.changed.error})` : '(none)')}</td></tr>`}</table>
<details><summary>All settings read</summary><table>${settings}</table></details>
<details><summary>Console log and raw data (for SparkPNT support)</summary><pre>${esc(text)}</pre></details>
<footer>Made with the SparkPNT Device Support page (v${esc(CONFIG.siteVersion)}). Send this file to ${esc(CONFIG.supportEmail)}. Passwords and keys are blanked out.</footer>
</main></body></html>`;
}

export function emailSummary({ snap, findings, problem, fileName }) {
  const unit = snap?.header ? `${snap.header.brand} ${snap.header.product} ${snap.header.version}` : 'my unit';
  const subject = `Support request: ${unit}${snap?.header?.bluetoothName ? ` (${snap.header.bluetoothName})` : ''}`;
  const lines = [];
  lines.push('Hello SparkPNT,');
  lines.push('');
  lines.push(problem?.trim() ? problem.trim() : 'Problem: (describe what happens)');
  lines.push('');
  lines.push(`Unit: ${unit}`);
  const worry = (findings || []).filter((f) => f.level !== 'ok').slice(0, 6);
  if (worry.length) {
    lines.push('The support page found:');
    for (const f of worry) lines.push(`- ${f.title}`);
  }
  lines.push('');
  lines.push(`The full report file ${fileName} is attached.`);
  lines.push('');
  return { subject, body: lines.join('\n') };
}

export function mailtoUrl({ subject, body }) {
  return `mailto:${encodeURIComponent(CONFIG.supportEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function shareReport(name, text, title) {
  if (!navigator.share) return false;
  const file = new File([text], name, { type: 'text/plain' });
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title, text: title });
  return true;
}

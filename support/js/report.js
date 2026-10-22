// Builds the support report, and the ways to get it to us.

import { CONFIG } from './config.js';
import { CLI_KEYS } from './receiver.js';
import { installedVersions } from './firmware.js';
import { stateWord, formatUptime } from './checks.js';

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

export function reportFileName(snap) {
  const who = (snap?.header?.bluetoothName || snap?.header?.product || 'unit').replace(/[^A-Za-z0-9-]+/g, '-');
  const d = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `SparkPNT-report-${who}-${d}.txt`;
}

export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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

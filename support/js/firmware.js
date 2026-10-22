// Firmware list, version comparison and the USB update of the main (ESP32) firmware.

import { CONFIG } from './config.js?v=1792700804';
import { parseEspVersion, parseSubsystemVersions, chipFromText } from './receiver.js?v=1792700804';

export async function loadFirmwareList() {
  let lastError = null;
  for (const url of CONFIG.firmwareCsvUrls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return { url, rows: parseCsv(text), loadedAt: new Date() };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('No firmware list configured');
}

export function parseCsv(text) {
  const rows = [];
  let header = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = line.split(',').map((c) => c.trim());
    if (!header) { header = cells; continue; }
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    if (row.model === 'Placeholder' || row.subsystem === 'None') continue;
    row.major = +row.version_major; row.minor = +row.version_minor;
    row.patch = +(row.version_patch || 0); row.revision = +(row.version_revision || 0);
    row.rc = row.release_candidate === '1';
    row.bytes = +(row.file_bytes || 0);
    row.crc32 = row.file_crc32 ? parseInt(row.file_crc32, 16) >>> 0 : null;
    rows.push(row);
  }
  return rows;
}

const MAIN_SUBSYSTEMS = new Set(['SOC', 'ESP32']);

// First matching row wins, as in the firmware's own product-release request.
export function latestMain(rows, { rc = false } = {}) {
  return rows.find((r) => MAIN_SUBSYSTEMS.has(r.subsystem) && r.rc === rc) || null;
}

export function latestFor(rows, chip, { rc = false } = {}) {
  const c = chip.toLowerCase();
  return rows.find((r) => r.chip.toLowerCase() === c && r.rc === rc) || null;
}

export function rowVersion(r) {
  if (r.chip.toLowerCase() === 'um980') return `Build ${r.major}${r.rc ? ' (beta)' : ''}`;
  return `${r.major}.${r.minor}${r.patch || r.revision ? `.${r.patch}.${r.revision}` : ''}${r.rc ? ' (beta)' : ''}`;
}

export function fileUrl(row) {
  const name = row.file_name;
  if (/^https?:\/\//.test(name)) return name;
  if (name.includes('/')) return CONFIG.binariesBase + name;
  if (MAIN_SUBSYSTEMS.has(row.subsystem)) return CONFIG.binariesBase + CONFIG.esp32Folder + name;
  return CONFIG.binariesBase + name;
}

// -1 when installed is older than row, 0 same, 1 newer.
export function compareMain(installed, row) {
  const a = [installed.major, installed.minor, installed.patch, installed.revision];
  const b = [row.major, row.minor, row.patch, row.revision];
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

// Pull the installed versions out of a snapshot into a uniform table.
export function installedVersions(snap) {
  const out = [];
  const subs = parseSubsystemVersions(snap.cli?.subsystemVersions?.value);
  if (subs.length) {
    for (const s of subs) {
      out.push({ subsystem: normalizeSubsystem(s.subsystem), chip: s.chip, version: s.version, source: 'subsystemVersions' });
    }
  } else {
    const esp = snap.cli?.espFirmwareVersion?.value || snap.header?.version || snap.firmwareMenu?.current;
    if (esp) out.push({ subsystem: 'Main', chip: 'ESP32', version: esp, source: 'espFirmwareVersion' });
    let chip = snap.gnss?.chip;
    if (!chip || chip === 'ZED') chip = chipFromText(snap.cli?.gnssModuleInfo?.value) || guessChip(snap) || chip;
    if (chip === 'ZED') chip = 'ZED-F9P';
    const gv = snap.cli?.gnssFirmwareVersion?.value || gnssVersionFromLine(snap.gnss?.versionLine);
    if (chip) out.push({ subsystem: 'GNSS', chip, version: gv || '', source: gv ? 'gnss' : 'unknown' });
    const lora = snap.cli?.loraFirmwareVersionStr?.value;
    if (lora) out.push({ subsystem: 'LoRa', chip: 'STM32WL', version: lora, source: 'loraFirmwareVersionStr' });
    const imu = snap.cli?.imuFirmwareVersionStr?.value;
    if (imu) out.push({ subsystem: 'IMU', chip: 'IM19', version: imu, source: 'imuFirmwareVersionStr' });
  }
  return out;
}

function normalizeSubsystem(s) {
  const u = s.toUpperCase();
  if (u === 'SOC' || u === 'ESP32') return 'Main';
  if (u === 'LORA') return 'LoRa';
  return u;
}

function guessChip(snap) {
  // Product names follow the SparkPNT convention: third letter is the receiver (L, M, X, U, F).
  const p = (snap.header?.product || '').toUpperCase();
  if (p === 'TX2' || p === 'POSTCARD') return 'LG290P';
  if (p === 'TORCH') return 'UM980';
  if (p === 'EVK') return 'ZED-F9P';
  if (p.includes('X5')) return 'mosaic-X5';
  const m = /^[A-Z][A-Z]\d?([LMXUF])(?:-|$)/.exec(p);
  if (m) return { L: 'LG290P', M: 'mosaic-X5', X: 'ZED-X20P', U: 'UM980', F: 'ZED-F9P' }[m[1]];
  return null;
}

function gnssVersionFromLine(line) {
  if (!line) return null;
  let m;
  if ((m = /LG290P version: v?(\d+\.\d+)/i.exec(line))) return m[1];
  if ((m = /ZED firmware: (.*)$/i.exec(line))) return m[1].trim();
  if ((m = /Build\s*(\d+)/i.exec(line))) return `Build ${m[1]}`;
  if ((m = /(\d+\.\d+(?:\.\d+){0,2})/.exec(line))) return m[1];
  if ((m = /UM980 firmware: (\d+)/i.exec(line))) return `Build ${m[1]}`;
  if ((m = /(\d{3,})/.exec(line))) return m[1];
  return null;
}

// Compare an installed GNSS/LoRa/IMU version string with the CSV row. Returns -1/0/1 or null when unsure.
export function compareSubsystem(installed, row) {
  if (!installed || !row) return null;
  const nums = (installed.match(/\d+/g) || []).map(Number);
  if (!nums.length) return null;
  const chip = row.chip.toLowerCase();
  if (chip === 'um980') {
    // UM980 versions are build numbers (R4.10Build17548); the CSV keeps the build in version_major.
    const build = nums[nums.length - 1];
    return build === row.major ? 0 : build < row.major ? -1 : 1;
  }
  const hpg = /HPG\s*(\d+)\.(\d+)/i.exec(installed);
  const a = hpg ? [+hpg[1], +hpg[2], 0, 0] : [nums[0] || 0, nums[1] || 0, nums[2] || 0, nums[3] || 0];
  const b = [row.major, row.minor, row.patch, row.revision];
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function mainVersionOf(snap) {
  const inst = installedVersions(snap).find((v) => v.subsystem === 'Main');
  const v = parseEspVersion(inst?.version) || parseEspVersion(snap.header?.version);
  if (!v) return null;
  // subsystemVersions drops the "d" that marks a developer build; the menu header keeps it.
  const shown = parseEspVersion(snap.cli?.espFirmwareVersion?.value) || parseEspVersion(snap.header?.version);
  if (shown?.dev) { v.dev = true; v.raw = shown.raw; }
  if (v.major >= 99) v.dev = true; // 99.99 is the number a locally compiled build reports
  return v;
}

// ---- Download and flash ------------------------------------------------------

export async function downloadBinary(url, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = +(res.headers.get('content-length') || 0);
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got, total);
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Writes the OTA data image and the app with esptool-js. The port must be closed by the caller.
export async function flashMain({ port, app, bootApp0, baud = 115200, log = () => {}, progress = () => {} }) {
  const esptool = await import(CONFIG.esptoolUrl);
  const transport = new esptool.Transport(port, false);
  const terminal = {
    clean() {},
    writeLine(s) { log(s); },
    write(s) { log(s, true); },
  };
  const loader = new esptool.ESPLoader({ transport, baudrate: baud, terminal, debugLogging: false });
  let chip;
  try {
    chip = await loader.main();
    log(`Chip: ${chip}`);
    if (!/ESP32(?!-[SC])/i.test(chip)) throw new Error(`Unexpected chip ${chip}; this page only updates ESP32 based units`);
    const files = [];
    if (bootApp0) files.push({ data: bootApp0, address: CONFIG.flash.bootApp0 });
    files.push({ data: app, address: CONFIG.flash.app });
    await loader.writeFlash({
      fileArray: files,
      flashSize: 'keep',
      flashMode: 'keep',
      flashFreq: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => progress(fileIndex, written, total, files.length),
    });
    log('Write complete. Restarting the unit.');
    await loader.after('hard_reset');
  } finally {
    try { await transport.disconnect(); } catch { /* port already closed */ }
  }
  return chip;
}

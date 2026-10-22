// Talks to the RTK Everywhere firmware over its USB console:
// the serial configuration menus plus the $SP command line.

import { CONFIG } from './config.js';

export function spFrame(body) {
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEADER_RE = /^(SparkPNT|SparkFun) (RTK )?(.+?) ([vd]?\d+\.\d+(?:\.\d+\.\d+)?(?:-.*)?)\s*$/;
const MODE_RE = /^Mode: (.+?)\s*$/;
const BT_RE = /^\*\* Bluetooth (.+?) broadcasting as: (.+?) \*\*$/;
const BT_OFF_RE = /^\*\* Bluetooth Turned Off \*\*$/;
const ROVER_RE = /Rover Accuracy \(([^)]+)\): ([\d.]+), SIV: (\d+) GNSS State: (.+?)\s*$/;
const BASE_RE = /^Base (Caster )?Mode - SIV: (\d+)/;
const BATT_RE = /Batt \((\d+)%\)[:/ ]+Voltage: ([\d.]+)V/;
const BOOT_RE = /^(rst:0x|ets Jul 29 2019|ets Jun  8 2016|configsip:|entry 0x)/;

// Settings read in command mode. Unknown names on older firmware just answer with an error.
export const CLI_KEYS = [
  ['espFirmwareVersion', 'Main firmware'],
  ['subsystemVersions', 'All chip versions'],
  ['gnssFirmwareVersion', 'GNSS firmware'],
  ['loraFirmwareVersionStr', 'LoRa firmware'],
  ['imuFirmwareVersionStr', 'Tilt sensor firmware'],
  ['gnssModuleInfo', 'GNSS module'],
  ['deviceName', 'Device name'],
  ['deviceId', 'Device id'],
  ['bluetoothId', 'Bluetooth id'],
  ['batteryLevelPercent', 'Battery percent'],
  ['batteryVoltage', 'Battery voltage'],
  ['bluetoothRadioType', 'Bluetooth radio'],
  ['setState', 'Running mode'],
  ['lastState', 'Saved mode'],
  ['loggingState', 'Logging state'],
  ['enableLogging', 'Logging enabled'],
  ['enableNtripClient', 'NTRIP client'],
  ['ntripClientCasterHost', 'NTRIP caster'],
  ['ntripClientCasterPort', 'NTRIP port'],
  ['ntripClientMountPoint', 'NTRIP mount point'],
  ['ntripClientCasterUser', 'NTRIP user'],
  ['wifiNetwork_0SSID', 'WiFi network 1'],
  ['wifiNetwork_1SSID', 'WiFi network 2'],
  ['pointPerfectService', 'PointPerfect service'],
  ['measurementRateMs', 'Measurement rate (ms)'],
  ['minElev', 'Elevation mask'],
  ['minCN0', 'Minimum C/N0'],
  ['dynamicModel', 'Dynamic model'],
  ['antennaHeight', 'Antenna height (mm)'],
  ['profileNumber', 'Profile'],
  ['usbSerialBaud', 'USB console baud'],
  ['enableGnssToUsbSerial', 'NMEA on USB'],
  ['enableAutoFirmwareUpdate', 'Automatic updates'],
  // csvUrl is left out on purpose: the firmware's 200 byte reply buffer overflows on it.
  ['tiltState', 'Tilt state'],
  ['enablePrintRoverAccuracy', 'Live status lines'],
  ['loraSerialInteractionTimeout', 'LoRa console timeout (s)'],
];

export class NoAnswerError extends Error {}

export class Receiver {
  constructor(link) {
    this.link = link;
    this.log = []; // {t, dir, text}
    this.maxLog = 6000;
    this.waiters = [];
    this.live = []; // parsed live lines
    this.rebootSeen = false;
    this.inMenu = false;
    this.inCli = false;
    this.busy = false;
    this.loraTimeoutOriginal = null;
    this._logHandlers = new Set();
    link.onLine((l) => this._onLine(l));
    link.onRaw(() => this._checkPartial());
  }

  onLog(fn) { this._logHandlers.add(fn); return () => this._logHandlers.delete(fn); }

  _push(dir, text) {
    const e = { t: Date.now(), dir, text };
    this.log.push(e);
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
    for (const fn of this._logHandlers) fn(e);
  }

  _onLine(line) {
    this._push('rx', line);
    this._parseLive(line);
    for (const w of [...this.waiters]) {
      const m = w.re.exec(line);
      if (m) {
        this._settle(w, { match: m, line, index: this.log.length - 1 });
      }
    }
  }

  _checkPartial() {
    const p = this.link.partial();
    if (!p) return;
    for (const w of [...this.waiters]) {
      if (!w.partial) continue;
      const m = w.re.exec(p);
      if (m) this._settle(w, { match: m, line: p, index: this.log.length });
    }
  }

  _settle(w, value) {
    clearTimeout(w.timer);
    this.waiters = this.waiters.filter((x) => x !== w);
    w.resolve(value);
  }

  _parseLive(line) {
    let m;
    if ((m = ROVER_RE.exec(line))) {
      this.live.push({ t: Date.now(), kind: 'rover', units: m[1], accuracy: parseFloat(m[2]), siv: parseInt(m[3], 10), state: m[4].trim() });
    } else if ((m = BASE_RE.exec(line))) {
      this.live.push({ t: Date.now(), kind: 'base', caster: !!m[1], siv: parseInt(m[2], 10), state: m[1] ? 'BASE CASTER' : 'BASE' });
    } else if ((m = BATT_RE.exec(line))) {
      this.live.push({ t: Date.now(), kind: 'battery', percent: parseInt(m[1], 10), voltage: parseFloat(m[2]) });
    } else if (BOOT_RE.test(line)) {
      this.rebootSeen = true;
      this.inMenu = false;
      this.inCli = false;
    }
    if (this.live.length > 400) this.live.splice(0, this.live.length - 400);
  }

  lastLive(kind) {
    for (let i = this.live.length - 1; i >= 0; i--) if (this.live[i].kind === kind) return this.live[i];
    return null;
  }

  // Wait for a line (or the partial prompt) matching re. Lines already received
  // after `from` are checked first.
  expect(re, timeout = 2500, from = null, partial = false) {
    if (from !== null) {
      for (let i = from; i < this.log.length; i++) {
        const e = this.log[i];
        if (e.dir !== 'rx') continue;
        const m = re.exec(e.text);
        if (m) return Promise.resolve({ match: m, line: e.text, index: i });
      }
      if (partial) {
        const m = re.exec(this.link.partial());
        if (m) return Promise.resolve({ match: m, line: this.link.partial(), index: this.log.length });
      }
    }
    return new Promise((resolve, reject) => {
      const w = { re, resolve, partial };
      w.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new NoAnswerError(`No answer matching ${re}`));
      }, timeout);
      this.waiters.push(w);
    });
  }

  // The firmware clears its input buffer each time it starts waiting for a line,
  // so anything sent within a few ms of its last print is eaten. Leave a gap.
  async send(text) {
    const last = this.log.length ? this.log[this.log.length - 1] : null;
    if (last && last.dir === 'rx') {
      const gap = 150 - (Date.now() - last.t);
      if (gap > 0) await sleep(gap);
    }
    this._push('tx', text);
    await this.link.write(text);
  }

  linesSince(index, untilIndex = this.log.length) {
    const out = [];
    for (let i = index; i < untilIndex; i++) if (this.log[i].dir === 'rx') out.push(this.log[i].text);
    return out;
  }

  // ---- Menus -------------------------------------------------------------

  // Open the main menu. Any character opens it; "+++" when NMEA streams on this port.
  // Opening the port restarts the unit, and a Torch takes about 15 seconds to boot,
  // so keep knocking for a while before giving up.
  async openMenu(maxMs = 45000) {
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < maxMs) {
      const from = this.log.length;
      await this.send(n % 3 === 1 ? '+++' : '\r');
      n++;
      try {
        const r = await this.expect(/^x\) Exit/, 2500, from);
        const h = this._headerBefore(r.index);
        if (h) {
          this.inMenu = true;
          this.inCli = false;
          await sleep(250); // let the firmware settle into its input wait
          return h;
        }
      } catch (e) {
        if (!(e instanceof NoAnswerError)) throw e;
        // Still in command mode? The firmware answers our knocks with an error sentence.
        if (this.linesSince(from).some((l) => /,ERROR,(Unknown command|Bad command)/.test(l))) {
          this.inCli = true;
          await this.exitCli();
          continue;
        }
        // The menu may have printed while booting, split across two attempts.
        const h = this._headerBefore(this.log.length);
        if (h && this.log.slice(from).some((e) => e.dir === 'rx' && /^x\) Exit/.test(e.text))) {
          this.inMenu = true;
          this.inCli = false;
          return h;
        }
      }
      // Give up early on a port that streams data but never shows a menu.
      if (n >= 4 && this.link.rxBytes > 4000 && !this.log.some((e) => e.dir === 'rx' && /^Menu: /.test(e.text))) break;
    }
    throw new NoAnswerError('The unit did not open its menu');
  }

  // Header of the last main menu print that ended at or before log index `end`.
  _headerBefore(end) {
    let start = -1;
    for (let i = Math.min(end, this.log.length - 1); i >= 0 && i > end - 60; i--) {
      if (this.log[i].dir === 'rx' && /^Menu: Main/.test(this.log[i].text)) { start = i; break; }
    }
    if (start < 0) return null;
    const lines = this.linesSince(Math.max(0, start - 8), Math.min(this.log.length, end + 1));
    return parseHeader(lines);
  }

  async exitMenu() {
    if (this.inCli) await this.exitCli();
    if (this.inMenu) {
      await this.send('x\r');
      this.inMenu = false;
      await sleep(300);
    }
  }

  // Enter a submenu, capture what it prints, and return to the main menu.
  async readSubmenu(key, titleRe) {
    if (!this.inMenu) await this.openMenu();
    let lines = null;
    for (let attempt = 0; attempt < 2 && !lines; attempt++) {
      const from = this.log.length;
      await this.send(key + '\r');
      try {
        const r = await this.expect(/^x\) Exit/, 4000, from);
        const got = this.linesSince(from, r.index + 1);
        if (got.some((l) => titleRe.test(l))) lines = got;
        else if (got.some((l) => /^Menu: Main/.test(l))) continue; // main menu reprinted; try the key again
        else throw new Error(`Expected ${titleRe} but the unit printed something else`);
      } catch (e) {
        if (!(e instanceof NoAnswerError)) throw e;
        // No print at all: the key was swallowed or the menu had closed. Reopen and retry once.
        this.inMenu = false;
        await this.openMenu(8000);
      }
    }
    if (!lines) throw new NoAnswerError(`The ${titleRe} menu did not open`);
    await sleep(150);
    const back = this.log.length;
    await this.send('x\r');
    await this.expect(/^x\) Exit/, 3000, back);
    await sleep(150);
    return lines;
  }

  async readSystem() { return parseSystem(await this.readSubmenu('s', /^Menu: System/)); }
  async readGnss() { return parseGnss(await this.readSubmenu('1', /^Menu: GNSS Receiver/)); }
  async readFirmwareMenu() { return parseFirmwareMenu(await this.readSubmenu('f', /^Menu: Firmware Update/)); }

  // ---- Command line ------------------------------------------------------

  async enterCli() {
    if (this.inCli) return;
    if (!this.inMenu) await this.openMenu();
    const from = this.log.length;
    await this.send('+\r');
    await this.expect(/COMMAND MODE/, 3000, from);
    this.inCli = true;
  }

  async exitCli() {
    if (!this.inCli) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      const from = this.log.length;
      await this.send('exit\r');
      try {
        await this.expect(/^x\) Exit/, 3000, from);
        this.inCli = false;
        this.inMenu = true;
        return;
      } catch {
        if (this.linesSince(from).some((l) => /Exiting command mode/.test(l))) {
          this.inCli = false;
          this.inMenu = false;
          return;
        }
      }
    }
    this.inCli = false;
    this.inMenu = false;
  }

  async cli(body, replyRe, timeout = 3000) {
    await this.enterCli();
    const from = this.log.length;
    await this.send(spFrame(body) + '\r');
    return this.expect(replyRe, timeout, from);
  }

  // Returns {value} or {error}.
  async get(name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const r = await this.cli(`SPGET,${name}`, new RegExp(`^\\$SPGET,${esc},(.*)\\*[0-9A-Fa-f]{2}$`), 1500);
      return parseReply(r.match[1]);
    } catch (e) {
      if (e instanceof NoAnswerError) return { error: 'No answer' };
      throw e;
    }
  }

  async set(name, value) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r = await this.cli(`SPSET,${name},${value}`, new RegExp(`^\\$SPSET,${esc},(.*)\\*[0-9A-Fa-f]{2}$`));
    const p = parseReply(r.match[1]);
    if (p.error) throw new Error(`${name}: ${p.error}`);
    return p;
  }

  async exe(cmd, timeout = 5000) {
    const r = await this.cli(`SPEXE,${cmd}`, new RegExp(`^\\$SPEXE,${cmd},(.*)\\*[0-9A-Fa-f]{2}$`), timeout);
    const p = parseReply(r.match[1]);
    if (p.error) throw new Error(`${cmd}: ${p.error}`);
    if (cmd === 'REBOOT' || cmd === 'FACTORYRESET') { this.inCli = false; this.inMenu = false; }
    return p;
  }

  async save() { return this.exe('SAVE'); }

  // Identity rows plus every setting that differs from its default (firmware since Sep 2026).
  async changedSettings() {
    await this.enterCli();
    const from = this.log.length;
    await this.send(spFrame('SPGET,changedSettings') + '\r');
    let r;
    try {
      r = await this.expect(/^\$SPGET,changedSettings,(.*)\*[0-9A-Fa-f]{2}$/, 10000, from);
    } catch (e) {
      if (e instanceof NoAnswerError) return { error: 'Not supported', rows: [] };
      throw e;
    }
    const p = parseReply(r.match[1]);
    if (p.error) return { error: p.error, rows: [] };
    const rows = [];
    for (const l of this.linesSince(from, r.index)) {
      const m = /^\$SPLST,([^,]+),([^,]+),(.*)\*[0-9A-Fa-f]{2}$/.exec(l);
      if (m) rows.push({ name: m[1], type: m[2], value: m[3].replace(/^"|"$/g, '') });
    }
    return { count: parseInt(p.value, 10), rows };
  }

  // ---- Navigation that trusts prints, not guesses ---------------------------
  // Firmware rules: outside the menus any byte opens the main menu (the byte itself is
  // consumed); inside a menu an empty line closes that menu, silently when it is the main
  // menu; in command mode an empty line does nothing and "exit" returns to the main menu.

  // Wait briefly for anything to print after a probe. Resolves with the lines, or [] on silence.
  async _probe(text, quietMs = 1500) {
    const from = this.log.length;
    await this.send(text);
    const t0 = Date.now();
    let lastLen = from;
    while (Date.now() - t0 < quietMs) {
      await sleep(100);
      if (this.log.length !== lastLen) { lastLen = this.log.length; continue; }
      // something printed and then went quiet for 100 ms: wait a little more for a menu to finish
      if (lastLen > from) { await sleep(250); break; }
    }
    return this.linesSince(from);
  }

  // Get to the main menu from anywhere. Returns the header, or throws NoAnswerError.
  async goMain(maxMs = 12000) {
    const t0 = Date.now();
    // From a submenu "x" returns cleanly; an empty line only earns an "Unknown choice".
    let probe = this.inMenu && !this.inCli ? 'x\r' : '\r';
    let silent = 0;
    while (Date.now() - t0 < maxMs) {
      const lines = await this._probe(probe);
      if (lines.some((l) => /^Menu: Main/.test(l)) && lines.some((l) => /^x\) Exit/.test(l))) {
        this.inMenu = true; this.inCli = false;
        await sleep(200);
        return this._headerBefore(this.log.length) || parseHeader(lines);
      }
      if (lines.some((l) => /^Menu: /.test(l))) { probe = 'x\r'; continue; }          // in a submenu: back out
      if (lines.some((l) => /,ERROR,|^COMMAND MODE/.test(l))) { probe = 'exit\r'; continue; } // in command mode
      // silence: the menu just closed, we are outside it, we are in command mode, or the console is gone
      silent++;
      if (silent >= 4) break;
      probe = silent === 2 ? 'exit\r' : '\r';
    }
    this.inMenu = false; this.inCli = false;
    throw new NoAnswerError('The unit did not open its menu');
  }

  // Open a first-level submenu by its key and wait for its title. Returns the printed lines.
  async goSub(key, titleRe) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.goMain();
      const lines = await this._probe(key + '\r', 3000);
      if (lines.some((l) => titleRe.test(l))) { this.inMenu = true; this.inCli = false; return lines; }
    }
    throw new Error(`The unit did not open that menu`);
  }

  // ---- Torch LoRa console timeout --------------------------------------------
  // A Torch hands its USB console to the LoRa radio 30 seconds after power on,
  // whatever happens on the console. Raise the timeout for this session; put it back on disconnect.
  async raiseLoraTimeout(seconds = 600) {
    if (this.loraTimeoutOriginal !== null && this.loraTimeoutOriginal !== undefined) return;
    this.loraTimeoutOriginal = null;
    const r = await this.get('loraSerialInteractionTimeout');
    if (r.error || Number.isNaN(+r.value) || +r.value >= seconds) { await this.exitCli(); return; }
    await this.set('loraSerialInteractionTimeout', seconds);
    this.loraTimeoutOriginal = +r.value;
    await this.exitCli();
  }

  async restoreLoraTimeout() {
    if (this.loraTimeoutOriginal === null || this.loraTimeoutOriginal === undefined) return;
    const v = this.loraTimeoutOriginal;
    this.loraTimeoutOriginal = null;
    // The radio's clock restarts every time the main menu is left (measured on a Torch:
    // the console dropped exactly `timeout` seconds after an exit). So leave the menu first,
    // then write the old value and leave again: the second exit writes flash and restarts the
    // clock, which leaves the console alive for `v` more seconds, plenty for a disconnect.
    await this.exitCli();
    if (!this.inMenu) await this.openMenu(8000);
    await this.exitMenu(); // a real exit, even if the page thought it was already outside
    await this.openMenu(8000);
    await this.set('loraSerialInteractionTimeout', v);
    await this.exitCli();
    await this.exitMenu();
  }

  // ---- Full check ----------------------------------------------------------

  async fullCheck(progress = () => {}) {
    const snap = {
      startedAt: new Date().toISOString(),
      port: this.link.info(),
      linkKind: this.link.kind,
      header: null, system: null, gnss: null, firmwareMenu: null,
      cli: {}, changed: null, live: [], errors: [],
      rebootSeen: this.rebootSeen,
    };
    const tryStep = async (label, fn) => {
      progress(label);
      try { return await fn(); } catch (e) { snap.errors.push(`${label}: ${e.message}`); return null; }
    };
    snap.header = await (async () => { progress('Opening the configuration menu'); return this.openMenu(); })();
    await tryStep('Keeping the console awake', () => this.raiseLoraTimeout());
    snap.loraTimeoutRaised = this.loraTimeoutOriginal !== null;
    snap.system = await tryStep('Reading system status', () => this.readSystem());
    snap.gnss = await tryStep('Reading the GNSS receiver', () => this.readGnss());
    snap.firmwareMenu = await tryStep('Reading the firmware menu', () => this.readFirmwareMenu());
    await tryStep('Reading settings', async () => {
      await this.enterCli();
      for (const [key] of CLI_KEYS) {
        snap.cli[key] = await this.get(key);
      }
      snap.changed = await this.changedSettings();
      await this.exitCli();
    });
    await tryStep('Closing the menu', () => this.exitMenu());
    const liveFrom = this.live.length;
    progress(`Watching the position for ${CONFIG.liveWatchSeconds} seconds`);
    await sleep(CONFIG.liveWatchSeconds * 1000);
    snap.live = this.live.slice(liveFrom);
    snap.rebootSeen = this.rebootSeen;
    snap.finishedAt = new Date().toISOString();
    return snap;
  }
}

// ---- Parsers ---------------------------------------------------------------

export function parseReply(payload) {
  // payload is everything after "$SPGET,name," up to "*CS"
  if (payload.startsWith(',ERROR,')) return { error: payload.slice(7) };
  let v = payload;
  if (v.endsWith(',OK')) v = v.slice(0, -3);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
  return { value: v };
}

export function parseHeader(lines) {
  const h = { raw: lines, brand: null, product: null, version: null, mode: null, bluetooth: null, bluetoothName: null, menuItems: [] };
  for (const l of lines) {
    let m;
    if (!h.product && (m = HEADER_RE.exec(l))) {
      h.brand = m[1]; h.rtkPrefix = !!m[2]; h.product = m[3].trim(); h.version = m[4].trim();
    } else if ((m = MODE_RE.exec(l))) h.mode = m[1];
    else if ((m = BT_RE.exec(l))) { h.bluetooth = m[1]; h.bluetoothName = m[2]; }
    else if (BT_OFF_RE.test(l)) h.bluetooth = 'Off';
    else if (/^[0-9a-z+~]\) /.test(l)) h.menuItems.push(l);
  }
  return h;
}

export function parseSystem(lines) {
  const s = { raw: lines, battery: null, voltage: null, fuelGauge: null, microSd: null, display: null,
    bluetooth: null, bluetoothConnected: null, serial: null, uptime: null, resets: null,
    ntripClient: null, ntripServers: [], parserFiltered: null, other: [] };
  let inStatus = false;
  for (const l of lines) {
    if (/^System Status/.test(l)) { inStatus = true; continue; }
    if (/^Menu: System/.test(l)) { inStatus = false; continue; }
    if (!inStatus) continue;
    let m;
    if ((m = /^Fuel Gauge: (Online|Offline)/.exec(l))) {
      s.fuelGauge = m[1];
      const b = BATT_RE.exec(l);
      if (b) { s.battery = parseInt(b[1], 10); s.voltage = parseFloat(b[2]); }
    } else if ((m = /^microSD: (Online|Offline)/.exec(l))) s.microSd = m[1];
    else if ((m = /^Display: (Online|Offline)/.exec(l))) s.display = m[1];
    else if ((m = /^Bluetooth (SPP and Low Energy|SPP|Low Energy|Off) \(([^)]*)\)(?:: (Not Connected|Connected))?/.exec(l))) {
      s.bluetooth = m[1]; s.serial = m[2]; s.bluetoothConnected = m[3] === 'Connected';
    } else if ((m = /^System Uptime: (\d+) (\d+):(\d+):(\d+)\.(\d+) \(Resets: (\d+)\)/.exec(l))) {
      s.uptime = { days: +m[1], hours: +m[2], minutes: +m[3], seconds: +m[4] };
      s.uptimeSeconds = (+m[1]) * 86400 + (+m[2]) * 3600 + (+m[3]) * 60 + (+m[4]);
      s.resets = parseInt(m[6], 10);
    } else if ((m = /^NTRIP Client (.*)$/.exec(l))) s.ntripClient = m[1];
    else if ((m = /^NTRIP Server (\d+) ?(.*)$/.exec(l))) s.ntripServers.push({ index: +m[1], status: m[2] });
    else if ((m = /^Filtered by parser: (\d+) NMEA \/ (\d+) RTCM \/ (\d+) UBX/.exec(l))) {
      s.parserFiltered = { nmea: +m[1], rtcm: +m[2], ubx: +m[3] };
    } else if (!/^\d{1,2}\/\d{1,2}\/\d{4}|^\d{2}:\d{2}:\d{2}|^\d{4}-\d{2}-\d{2} /.test(l)) s.other.push(l);
  }
  return s;
}

export function parseGnss(lines) {
  const g = { raw: lines, versionLine: null, moduleId: null, chip: null, online: true };
  for (const l of lines) {
    let m;
    if ((m = /^GNSS Version: ?(.*)$/.exec(l))) { g.versionLine = m[1] || null; if (/^Offline/.test(m[1] || '')) g.online = false; }
    else if ((m = /^Module ID: (.*)$/.exec(l))) g.moduleId = m[1];
    else if (/version|firmware/i.test(l) && !g.versionLine) g.versionLine = l;
  }
  g.chip = chipFromText(lines.join('\n'));
  return g;
}

// Specific module names win over the bare family name.
export function chipFromText(text) {
  if (!text) return null;
  const specific = /(LG290P|ZED-X20P|ZED-F9P|UM980|mosaic-X5|mosaic-T)/i.exec(text);
  if (specific) return specific[1];
  if (/\bZED\b/i.test(text)) return 'ZED';
  return null;
}

export function parseFirmwareMenu(lines) {
  const f = { raw: lines, current: null, options: [] };
  for (const l of lines) {
    let m;
    if ((m = /^Current firmware: (.*)$/.exec(l))) f.current = m[1].trim();
    else if (/^[0-9A-Za-z]\) /.test(l)) f.options.push(l);
  }
  return f;
}

// "v3.4-Sep 17 2026", "d3.4-Sep 3 2026", "3.5.0.0-rc", "v3.5.1.0-Oct 21 2026"
export function parseEspVersion(str) {
  if (!str) return null;
  const m = /^([vd])?(\d+)\.(\d+)(?:\.(\d+)\.(\d+))?(?:-(.*))?$/.exec(str.trim());
  if (!m) return null;
  const tail = (m[6] || '').trim();
  return {
    raw: str.trim(),
    major: +m[2], minor: +m[3], patch: +(m[4] || 0), revision: +(m[5] || 0),
    dev: m[1] === 'd',
    rc: /rc/i.test(tail),
    date: /rc/i.test(tail) ? null : tail || null,
  };
}

// "SOC:ESP32:3.5.0.0-rc;GNSS:ZED-X20P:2.10.0.0;LoRa:STM32WL:3.0.1.0;IMU:IM19:11.4.1.0"
export function parseSubsystemVersions(str) {
  const out = [];
  if (!str) return out;
  for (const part of str.split(';')) {
    const [subsystem, chip, version] = part.split(':');
    if (subsystem && chip) out.push({ subsystem, chip, version: version || '' });
  }
  return out;
}

// A simulated unit for trying the page without hardware. Same interface as SerialLink.
// Open the page with ?sim=tx2, ?sim=fpx or ?sim=torch.

const PROFILES = {
  tx2: {
    brand: 'SparkPNT', product: 'TX2', version: 'v3.4-Sep 17 2026', mode: 'Rover',
    bt: 'Low-Energy', name: 'SparkPNT TX2-C3F107', serial: 'C3F1', deviceId: 'C3F1A2B4C607', btType: 1,
    battery: 78, voltage: 3.98, sd: null, gnssLine: 'LG290P version: v2.1 - 2026/02/14 10:22:41 LG290P03AANR02A01S',
    moduleId: 'LG290P03AANR02A01S', chip: 'LG290P',
    subsystems: null, gnssVersion: '2.1', fixState: 'RTK Fix', acc: 0.014, siv: 27,
    ntrip: 1, caster: 'rtk2go.com', mount: 'SPARKPNT1', wifi: 'OfficeWiFi', resets: 4, uptime: 1234,
    changed: [['enableNtripClient', '_bool', '1'], ['ntripClientCasterHost', 'tCharArry', '"rtk2go.com"'], ['ntripClientMountPoint', 'tCharArry', '"SPARKPNT1"'], ['wifiNetwork_0SSID', 'tCharArry', '"OfficeWiFi"'], ['wifiNetwork_0Password', 'tCharArry', '"hunter2"']],
  },
  fpx: {
    brand: 'SparkPNT', product: 'FPX-T', version: 'd3.4-Sep 3 2026', mode: 'Rover',
    bt: 'Low-Energy', name: 'SparkPNT FPX-T-896206', serial: '8962', deviceId: '896206AB3306', btType: 1,
    battery: 14, voltage: 3.62, sd: 'Offline', gnssLine: 'ZED firmware: HPG 2.00', moduleId: 'ZED-X20P', chip: 'ZED-X20P',
    subsystems: null, gnssVersion: 'HPG 2.00', fixState: '3D Fix', acc: 1.9, siv: 11,
    ntrip: 1, caster: 'ntrip.example.net', mount: 'MOUNT1', wifi: '', resets: 31, uptime: 95, ntripStatus: 'Disconnected',
    changed: [['enableNtripClient', '_bool', '1'], ['ntripClientCasterHost', 'tCharArry', '"ntrip.example.net"'], ['enableLogging', '_bool', '1'], ['minElev', '_uint8_t', '30']],
    enableLogging: 1, minElev: 30,
  },
  torch: {
    brand: 'SparkPNT', product: 'Torch', rtkPrefix: true, version: 'v3.3-Apr 17 2026', mode: 'Base',
    bt: null, name: null, serial: '7A2B', deviceId: '7A2B55D01003', btType: 3,
    battery: 55, voltage: 3.81, sd: null, gnssLine: 'UM980 firmware: R4.10Build11833', moduleId: 'UM980', chip: 'UM980',
    subsystems: null, gnssVersion: 'R4.10Build11833', fixState: null, acc: 0, siv: 19,
    ntrip: 0, caster: '', mount: '', wifi: '', resets: 2, uptime: 4000, lora: '2.0.2',
    changed: [['bluetoothRadioType', 'tBtRadio', '3'], ['lastState', 'tSysState', '1']],
    old: true,
  },
};

const menu = (p) => [
  '',
  `${p.brand} ${p.rtkPrefix ? 'RTK ' : ''}${p.product} ${p.version}`,
  `Mode: ${p.mode}`,
  p.btType === 3 ? '** Bluetooth Turned Off **' : `** Bluetooth ${p.bt} broadcasting as: ${p.name} **`,
  'Menu: Main',
  '1) Configure GNSS Receiver', '2) Configure GNSS Messages', '3) Configure Base', '4) Configure Ports',
  ...(p.product === 'Torch' ? [] : ['5) Configure Logging']),
  '6) Configure WiFi', '7) Configure TCP/UDP', 'f) Firmware Update', 'i) Configure Corrections Priorities',
  'p) Configure PointPerfect', 'r) Configure Radios', 's) Configure System', 't) Configure Instrument Setup',
  'u) Configure User Profiles', '+) Enter Command Line Mode', 'x) Exit',
];

const systemMenu = (p) => [
  '', 'System Status', '10/22/2026 15:04:31',
  `Fuel Gauge: Online - Batt (${p.battery}%) / Voltage: ${p.voltage.toFixed(2)}V`,
  ...(p.sd ? [`microSD: ${p.sd}`] : []),
  `Bluetooth ${p.btType === 3 ? 'Off' : 'Low Energy'} (${p.serial})${p.btType === 3 ? '' : ': Not Connected'}`,
  `System Uptime: 0 ${String(Math.floor(p.uptime / 3600)).padStart(2, '0')}:${String(Math.floor((p.uptime % 3600) / 60)).padStart(2, '0')}:${String(p.uptime % 60).padStart(2, '0')}.120 (Resets: ${p.resets})`,
  ...(p.ntrip && p.mode === 'Rover' ? [`NTRIP Client ${p.ntripStatus || 'Connected'} - ${p.caster}/${p.mount}:2101`] : []),
  'Filtered by parser: 12 NMEA / 0 RTCM / 0 UBX',
  '', 'Menu: System', '-----  Mode Switch  -----', `Mode: ${p.mode}`,
  'A) Switch to Base mode using Base Assist', 'B) Switch to Base mode', 'C) Switch to Base Caster mode',
  'R) Switch to Rover mode', 'W) Switch to Web Config mode', 'S) Shut down',
  '-----  Settings  -----', 'a) Automatic device reboot in minutes: Disabled', 'd) Debug software',
  'e) Echo User Input: On', 'h) Debug hardware', 'p) Configure periodic print messages',
  'r) Reset all settings to default', 'u) Printed measurement units: Meters', 'x) Exit',
];

const gnssMenu = (p) => [
  '', 'Menu: GNSS Receiver', `GNSS Version: ${p.gnssLine}`, `Module ID: ${p.moduleId}`,
  '1) Set measurement rate in Hz: 4.00000', '2) Set measurement rate in seconds between measurements: 0.25000',
  '3) Set dynamic model: Portable', '4) Set Constellations', `5) Minimum elevation for a GNSS satellite to be used in fix (degrees): ${p.minElev || 10}`,
  '6) Minimum satellite signal level for navigation (dBHz): 6', 'x) Exit',
];

const fwMenu = (p) => [
  '', 'Menu: Firmware Update', `Current firmware: ${p.version}`,
  'a) Automatic firmware updates: Disabled', 'c) Check for product firmware updates: Not requested',
  'd) Enable developer options', 'P) Update to latest product specific firmware', 'q) Cancel check and update requests', 'x) Exit',
];

export class SimLink {
  constructor(profileName = 'tx2') {
    this.kind = 'sim';
    this.profile = JSON.parse(JSON.stringify(PROFILES[profileName] || PROFILES.tx2));
    this.profileName = profileName;
    this.connected = false;
    this.rxBytes = 0; this.txBytes = 0; this.nonPrintable = 0;
    this._buf = '';
    this._lineHandlers = new Set(); this._rawHandlers = new Set(); this._closeHandlers = new Set();
    this.state = 'idle';
    this._inputBuf = '';
    this._timer = null;
  }

  static supported() { return true; }
  async requestPort() { return { getInfo: () => ({ usbVendorId: 0, usbProductId: 0 }), sim: true }; }
  info() { return { sim: this.profileName }; }
  label() { return `simulated ${this.profile.product}`; }
  partial() { return this._buf; }
  onLine(fn) { this._lineHandlers.add(fn); return () => this._lineHandlers.delete(fn); }
  onRaw(fn) { this._rawHandlers.add(fn); return () => this._rawHandlers.delete(fn); }
  onClose(fn) { this._closeHandlers.add(fn); return () => this._closeHandlers.delete(fn); }

  async open() {
    this.connected = true;
    this._timer = setInterval(() => this._tick(), 2000);
  }

  async close() {
    this.connected = false;
    clearInterval(this._timer);
  }

  _tick() {
    if (!this.connected || this.state !== 'idle') return;
    const p = this.profile;
    if (p.mode === 'Rover') {
      const acc = p.acc ? (p.acc * (0.9 + Math.random() * 0.2)).toFixed(3) : '0.000';
      this._emit(`Rover Accuracy (m): ${acc}, SIV: ${p.siv} GNSS State: ${p.fixState || 'No Fix'}`);
    } else {
      this._emit(`Base Mode - SIV: ${p.siv}`);
    }
  }

  _emit(line) {
    const text = line + '\r\n';
    this.rxBytes += text.length;
    for (const fn of this._rawHandlers) fn(text);
    if (line.length) for (const fn of this._lineHandlers) fn(line);
  }
  _emitAll(lines) { for (const l of lines) this._emit(l); }

  async write(text) {
    this.txBytes += text.length;
    await new Promise((r) => setTimeout(r, 30));
    for (const ch of text) {
      if (this.state === 'idle') {
        this.state = 'main';
        this._inputBuf = '';
        this._emitAll(menu(this.profile));
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        const cmd = this._inputBuf; this._inputBuf = '';
        if (cmd.length || this.state === 'cli') this._handle(cmd);
      } else this._inputBuf += ch;
    }
  }

  _handle(cmd) {
    const p = this.profile;
    const s = this.state;
    if (s === 'cli') return this._cli(cmd);
    if (s === 'main') {
      if (cmd === 's') { this.state = 'system'; this._emitAll(systemMenu(p)); }
      else if (cmd === '1') { this.state = 'gnss'; this._emitAll(gnssMenu(p)); }
      else if (cmd === 'f') { this.state = 'firmware'; this._emitAll(fwMenu(p)); }
      else if (cmd === '+') { this.state = 'cli'; this._emit('COMMAND MODE'); }
      else if (cmd === 'x') { this.state = 'idle'; }
      else { this._emit(`Unknown choice: ${cmd}`); this._emitAll(menu(p)); }
      return;
    }
    if (s === 'system') {
      if (cmd === 'x') { this.state = 'main'; this._emitAll(menu(p)); }
      else if (cmd === 'R') { p.mode = 'Rover'; this._emitAll(systemMenu(p)); }
      else if (cmd === 'B') { p.mode = 'Base'; this._emitAll(systemMenu(p)); }
      else if (cmd === 'r') { this.state = 'confirm-reset'; this._emit(''); this._emit("Resetting to factory defaults. Press 'y' to confirm:"); }
      else { this._emit(`Unknown choice: ${cmd}`); this._emitAll(systemMenu(p)); }
      return;
    }
    if (s === 'confirm-reset') {
      if (cmd === 'y') { this._emit('Settings erased successfully. Rebooting. Goodbye!'); this._reboot(); }
      else { this._emit('Reset aborted'); this.state = 'system'; this._emitAll(systemMenu(p)); }
      return;
    }
    if (s === 'gnss') { if (cmd === 'x') { this.state = 'main'; this._emitAll(menu(p)); } else this._emitAll(gnssMenu(p)); return; }
    if (s === 'firmware') {
      if (cmd === 'x') { this.state = 'main'; this._emitAll(menu(p)); }
      else if (cmd === 'P' || cmd === 'c') { this._emit('Checking for firmware updates...'); setTimeout(() => { this._emit('ERROR: No Internet'); this._emitAll(fwMenu(p)); }, 1500); }
      else this._emitAll(fwMenu(p));
    }
  }

  _reboot() {
    this.state = 'idle';
    setTimeout(() => {
      this._emit('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)');
      this._emit('configsip: 0, SPIWP:0xee');
      this.profile.uptime = 0; this.profile.resets += 1;
    }, 500);
  }

  _cli(cmd) {
    const p = this.profile;
    if (cmd === 'x' || cmd === 'exit') { this._emit('Exiting command mode'); this.state = 'main'; this._emitAll(menu(p)); return; }
    const body = cmd.startsWith('$') ? cmd.slice(1).replace(/\*[0-9A-Fa-f]{2}$/, '') : cmd;
    const parts = body.split(',');
    const frame = (b) => { let cs = 0; for (const c of b) cs ^= c.charCodeAt(0); return `$${b}*${cs.toString(16).toUpperCase().padStart(2, '0')}`; };
    const reply = (b) => this._emit(frame(b));
    const values = this._values();
    if (parts[0] === 'SPGET') {
      const k = parts[1];
      if (k === 'changedSettings') {
        reply(`SPLST,deviceName,char[20],"${p.name || p.product}"`);
        reply(`SPLST,deviceId,char[13],"${p.deviceId}"`);
        for (const [n, t, v] of p.changed) reply(`SPLST,${n},${t},${v}`);
        reply(`SPGET,changedSettings,${p.changed.length + 2},OK`);
      } else if (k in values) {
        const v = values[k];
        reply(typeof v === 'string' ? `SPGET,${k},"${v}"` : `SPGET,${k},${v}`);
      } else reply(`SPGET,${k},,ERROR,Unknown setting`);
    } else if (parts[0] === 'SPSET') {
      const k = parts[1], v = parts.slice(2).join(',');
      if (k === 'bluetoothRadioType') p.btType = +v;
      if (k === 'setState') p.mode = ['Rover', 'Base', 'NTP', 'Base Caster', 'Base Assist'][+v] || p.mode;
      if (k === 'wifiNetwork_0SSID') p.wifi = v;
      reply(/^-?\d+(\.\d+)?$/.test(v) ? `SPSET,${k},${v},OK` : `SPSET,${k},"${v}",OK`);
    } else if (parts[0] === 'SPEXE') {
      const c = parts[1];
      if (c === 'REBOOT') { reply('SPEXE,REBOOT,OK'); this._reboot(); }
      else if (c === 'FACTORYRESET') { reply('SPEXE,FACTORYRESET,OK'); this._reboot(); }
      else if (c === 'UPDATEFIRMWARE') reply('SPEXE,UPDATEFIRMWARE,ERROR,No Internet');
      else if (['SAVE', 'APPLY', 'EXIT', 'LIST'].includes(c)) { reply(`SPEXE,${c},OK`); if (c === 'EXIT') { this.state = 'main'; this._emitAll(menu(p)); } }
      else reply(`SPEXE,${c},ERROR,Unknown command`);
    } else reply('SP,ERROR,Bad command structure or checksum');
  }

  _values() {
    const p = this.profile;
    const v = {
      espFirmwareVersion: p.version,
      gnssModuleInfo: p.moduleId,
      deviceName: p.name || p.product,
      deviceId: p.deviceId,
      bluetoothId: p.deviceId.slice(0, 12),
      batteryLevelPercent: p.battery,
      batteryVoltage: p.voltage,
      bluetoothRadioType: p.btType,
      lastState: p.mode === 'Rover' ? 0 : 1,
      enableLogging: p.enableLogging || 0,
      enableNtripClient: p.ntrip,
      ntripClientCasterHost: p.caster,
      ntripClientCasterPort: 2101,
      ntripClientMountPoint: p.mount,
      ntripClientCasterUser: p.ntrip ? 'user@example.com' : '',
      wifiNetwork_0SSID: p.wifi,
      wifiNetwork_1SSID: '',
      pointPerfectService: 0,
      measurementRateMs: 250,
      minElev: p.minElev || 10,
      minCN0: 6,
      dynamicModel: 0,
      antennaHeight: 0,
      profileNumber: 0,
      enableGnssToUsbSerial: 0,
      enableAutoFirmwareUpdate: 0,
      csvUrl: 'https://raw.githubusercontent.com/sparkfun/SparkFun_RTK_Everywhere_Firmware_Binaries/main/RTK-Everywhere-Variants.csv',
      enablePrintRoverAccuracy: 1,
    };
    if (!p.old) {
      v.gnssFirmwareVersion = p.gnssVersion;
      v.tiltState = p.product.endsWith('-T') ? 3 : 0;
    }
    if (p.lora) v.loraFirmwareVersionStr = p.lora;
    return v;
  }
}

// Web Bluetooth link to the receiver's $SP command channel.
// Same shape as SerialLink (onLine, onRaw, onClose, write, close) so the Receiver can use it,
// plus onNmea for the position sentences the unit streams on its data channel.
//
// The unit offers two Bluetooth Low Energy services: a data service that carries NMEA out and
// corrections in (what phone apps use), and a command service that takes $SP sentences and
// answers them. There is no text menu over Bluetooth; the menus exist only on the USB console.

export const DATA_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const DATA_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // computer -> unit
export const DATA_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // unit -> computer
export const CMD_SERVICE = '7e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const CMD_RX = '7e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const CMD_TX = '7e400003-b5a3-f393-e0a9-e50e24dcca9e';

const enc = new TextEncoder();

export class BleLink {
  constructor() {
    this.kind = 'ble';
    this.device = null;
    this.server = null;
    this.connected = false;
    this.rxBytes = 0;
    this.txBytes = 0;
    this.nonPrintable = 0;
    this.nmeaLines = 0;
    this._cmdRx = null;
    this._dataRx = null;
    this._cmdBuf = '';
    this._dataBuf = '';
    this._decoder = new TextDecoder('utf-8', { fatal: false });
    this._lineHandlers = new Set();
    this._rawHandlers = new Set();
    this._nmeaHandlers = new Set();
    this._closeHandlers = new Set();
    this._writeQueue = Promise.resolve();
    this._closing = false;
  }

  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  // Opens the browser's device chooser. Units advertise the data service and a
  // "SparkPNT ..." or "SparkFun ..." name.
  async requestDevice() {
    return navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'SparkPNT' }, { namePrefix: 'SparkFun' }, { services: [DATA_SERVICE] }],
      optionalServices: [DATA_SERVICE, CMD_SERVICE],
    });
  }

  async open(device) {
    this.device = device;
    this._closing = false;
    this._cmdBuf = '';
    this._dataBuf = '';
    if (this._listening !== device) {
      device.addEventListener('gattserverdisconnected', () => this._onDisconnected());
      this._listening = device;
    }
    this.server = await device.gatt.connect();

    let cmd;
    try {
      cmd = await this.server.getPrimaryService(CMD_SERVICE);
    } catch {
      try { device.gatt.disconnect(); } catch { /* ignore */ }
      const e = new Error('This unit has no Bluetooth command channel. Its firmware is too old for Bluetooth checks; use the USB cable.');
      e.name = 'NoCommandService';
      throw e;
    }
    this._cmdRx = await cmd.getCharacteristic(CMD_RX);
    const cmdTx = await cmd.getCharacteristic(CMD_TX);
    cmdTx.addEventListener('characteristicvaluechanged', (ev) => this._onCmdChunk(ev.target.value));
    await cmdTx.startNotifications();

    // The data channel is optional for us: it only feeds the live position.
    try {
      const data = await this.server.getPrimaryService(DATA_SERVICE);
      this._dataRx = await data.getCharacteristic(DATA_RX);
      const dataTx = await data.getCharacteristic(DATA_TX);
      dataTx.addEventListener('characteristicvaluechanged', (ev) => this._onDataChunk(ev.target.value));
      await dataTx.startNotifications();
    } catch { /* no live position then */ }

    this.connected = true;
  }

  info() {
    return { bluetoothName: this.device?.name || null, bluetoothId: this.device?.id || null };
  }

  label() { return this.device?.name || 'Bluetooth unit'; }

  onLine(fn) { this._lineHandlers.add(fn); return () => this._lineHandlers.delete(fn); }
  onRaw(fn) { this._rawHandlers.add(fn); return () => this._rawHandlers.delete(fn); }
  onNmea(fn) { this._nmeaHandlers.add(fn); return () => this._nmeaHandlers.delete(fn); }
  onClose(fn) { this._closeHandlers.add(fn); return () => this._closeHandlers.delete(fn); }

  partial() { return this._cmdBuf; }

  _onCmdChunk(view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    this.rxBytes += bytes.length;
    const text = this._decoder.decode(bytes, { stream: true });
    for (const fn of this._rawHandlers) fn(text);
    this._cmdBuf += text;
    const parts = this._cmdBuf.split(/\r\n|\r|\n/);
    this._cmdBuf = parts.pop();
    for (const line of parts) {
      if (!line.length) continue;
      for (const fn of this._lineHandlers) fn(line);
    }
  }

  _onDataChunk(view) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let text = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b > 126 || (b < 32 && b !== 10 && b !== 13)) { this.nonPrintable++; continue; } // RTCM or UBX bytes
      text += String.fromCharCode(b);
    }
    this._dataBuf += text;
    const parts = this._dataBuf.split(/\r\n|\r|\n/);
    this._dataBuf = parts.pop();
    if (this._dataBuf.length > 400) this._dataBuf = '';
    for (const line of parts) {
      if (!line.startsWith('$')) continue;
      this.nmeaLines++;
      for (const fn of this._nmeaHandlers) fn(line);
    }
  }

  // The firmware's command task only runs a line once it ends in CR LF.
  async write(text) {
    if (!this.connected || !this._cmdRx) throw new Error('Not connected');
    let t = text;
    if (t.endsWith('\r')) t += '\n';
    else if (!t.endsWith('\n')) t += '\r\n';
    const bytes = enc.encode(t);
    this.txBytes += bytes.length;
    const c = this._cmdRx;
    // 20 byte pieces fit the smallest Bluetooth MTU, and the firmware reassembles them.
    this._writeQueue = this._writeQueue.then(async () => {
      for (let o = 0; o < bytes.length; o += 20) {
        const piece = bytes.slice(o, o + 20);
        if (c.writeValueWithoutResponse) await c.writeValueWithoutResponse(piece);
        else await c.writeValue(piece);
      }
    });
    await this._writeQueue;
  }

  _onDisconnected() {
    if (!this.connected) return;
    this.connected = false;
    if (!this._closing) for (const fn of this._closeHandlers) fn(new Error('Bluetooth disconnected'));
  }

  async close() {
    this._closing = true;
    this.connected = false;
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch { /* ignore */ }
  }
}

// ---- NMEA bits the page needs: fix quality, satellites and accuracy ------------

const QUALITY = { 0: 'No Fix', 1: '3D Fix', 2: 'DGPS Fix', 3: 'PPS Fix', 4: 'RTK Fix', 5: 'RTK Float', 6: 'Dead Reckoning', 7: 'Manual', 8: 'Simulation' };

// Returns {kind:'gga', quality, state, siv, hdop} or {kind:'gst', accuracy} or null.
export function parseNmea(line) {
  const star = line.indexOf('*');
  const body = star > 0 ? line.slice(1, star) : line.slice(1);
  const f = body.split(',');
  const type = f[0].slice(2);
  if (type === 'GGA') {
    const q = parseInt(f[6], 10);
    if (Number.isNaN(q)) return null;
    return { kind: 'gga', quality: q, state: QUALITY[q] || `Quality ${q}`, siv: parseInt(f[7], 10) || 0, hdop: parseFloat(f[8]) || null };
  }
  if (type === 'GST') {
    const latSd = parseFloat(f[6]);
    const lonSd = parseFloat(f[7]);
    if (Number.isNaN(latSd) || Number.isNaN(lonSd)) return null;
    return { kind: 'gst', accuracy: Math.round(Math.sqrt(latSd * latSd + lonSd * lonSd) * 1000) / 1000 };
  }
  return null;
}

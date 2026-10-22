// Web Serial link to the receiver's USB console.
// Emits complete lines and raw text; keeps the partial line for prompt matching.

import { CONFIG } from './config.js?v=1792701697';

export class SerialLink {
  constructor() {
    this.kind = 'serial';
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.connected = false;
    this.rxBytes = 0;
    this.txBytes = 0;
    this.nonPrintable = 0;
    this._buf = '';
    this._decoder = new TextDecoder('utf-8', { fatal: false });
    this._lineHandlers = new Set();
    this._rawHandlers = new Set();
    this._closeHandlers = new Set();
    this._closing = false;
    this._loopDone = Promise.resolve();
  }

  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async requestPort(allPorts = false) {
    const filters = allPorts ? [] : [{ usbVendorId: CONFIG.usbVendorId }];
    return navigator.serial.requestPort({ filters });
  }

  async open(port, baudRate = CONFIG.consoleBaud) {
    this.port = port;
    this._closing = false;
    this._buf = '';
    await port.open({ baudRate, bufferSize: 65536 });
    // DTR and RTS reach the ESP32 reset and boot pins through the auto-reset circuit.
    // Chrome asserts both on open, which holds the unit in reset; release them at once.
    // The unit still restarts on open, so callers must wait for it to boot.
    try { await port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch { /* not every bridge has them */ }
    this.connected = true;
    this.writer = port.writable.getWriter();
    this._loopDone = this._readLoop();
  }

  info() {
    try {
      return this.port && this.port.getInfo ? this.port.getInfo() : {};
    } catch {
      return {};
    }
  }

  label() {
    const i = this.info();
    if (!i.usbVendorId) return 'serial port';
    const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
    return `USB ${hex(i.usbVendorId)}:${hex(i.usbProductId || 0)}`;
  }

  onLine(fn) { this._lineHandlers.add(fn); return () => this._lineHandlers.delete(fn); }
  onRaw(fn) { this._rawHandlers.add(fn); return () => this._rawHandlers.delete(fn); }
  onClose(fn) { this._closeHandlers.add(fn); return () => this._closeHandlers.delete(fn); }

  partial() { return this._buf; }

  async _readLoop() {
    let lost = false;
    while (this.connected && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this._onChunk(value);
        }
      } catch (e) {
        // Framing, parity and overrun errors are not fatal: the port stays open and hands out a
        // fresh readable stream. The reset pulse on open produces one on some units.
        const fatal = !this.port.readable || e.name === 'NetworkError' || /lost|disconnect/i.test(e.message || '');
        if (fatal) { lost = true; this._error = e; }
      } finally {
        try { this.reader.releaseLock(); } catch { /* already released */ }
        this.reader = null;
      }
      if (lost || this._closing) break;
    }
    if (!this._closing) {
      this.connected = false;
      for (const fn of this._closeHandlers) fn(this._error || null);
    }
  }

  _onChunk(bytes) {
    this.rxBytes += bytes.length;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b > 126 || (b < 32 && b !== 10 && b !== 13 && b !== 9)) this.nonPrintable++;
    }
    const text = this._decoder.decode(bytes, { stream: true });
    for (const fn of this._rawHandlers) fn(text);
    this._buf += text;
    const parts = this._buf.split(/\r\n|\r|\n/);
    this._buf = parts.pop();
    for (const line of parts) {
      if (line.length === 0) continue;
      for (const fn of this._lineHandlers) fn(line);
    }
  }

  async write(text) {
    if (!this.writer) throw new Error('Not connected');
    const bytes = new TextEncoder().encode(text);
    this.txBytes += bytes.length;
    await this.writer.write(bytes);
  }

  // Release the port so another library (the flasher) can open it.
  async close() {
    this._closing = true;
    this.connected = false;
    try { if (this.reader) await this.reader.cancel(); } catch { /* ignore */ }
    try { await this._loopDone; } catch { /* ignore */ }
    try { if (this.writer) { this.writer.releaseLock(); } } catch { /* ignore */ }
    this.writer = null;
    try { if (this.port) await this.port.close(); } catch { /* ignore */ }
  }
}

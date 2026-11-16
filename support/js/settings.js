// What somebody changed on this unit, as opposed to what it ships with.
//
// The unit answers "which settings differ from defaults" by comparing with the defaults for its
// own receiver type (the firmware builds that snapshot itself). The answer still carries the
// unit's identity, two values the firmware rewrites on first start, and a few values a model
// sets for itself while starting. This module sorts the unit's list into those groups, so the
// page and the report show what was actually changed.

// Identity, not settings. The unit, firmware and receiver rows of the report already carry them.
const IDENTITY = new Set(['deviceName', 'bluetoothId', 'deviceId', 'profileNumber', 'espFirmwareVersion', 'gnssFirmwareVersion', 'gnssModuleInfo']);

// Rewritten by the firmware itself the first time any unit starts.
const FIRST_START = { clearBtPairings: 'false', profileName: 'Profile1' };

// Values a model sets for itself while starting, which the firmware's own snapshot misses. A row only counts
// as factory when its value matches; the same setting with another value is a change.
// Sources: FPX-T from two units (v3.4 and the October 2026 build), Torch from two units (v3.4).
// Neither is confirmed on a factory-reset unit yet. A model missing here has no list.
const MODEL_FACTORY = {
  'FPX-T': { dataPortBaud: '115200', constellation_GLONASS: '0' },
  TORCH: {},
};

// name: [label, firmware default (display text) or null, why it matters or null]
const INFO = {
  enableEspNow: ['ESP-NOW Radio Link', 'Off', 'Shares the unit\'s radio with Bluetooth and WiFi. Leave it off unless a base sends corrections this way.'],
  espnowPeerCount: ['ESP-NOW Paired Units', '0', null],
  enableNtripClient: ['NTRIP Client', 'Off', 'The unit fetches corrections itself over WiFi. The phone app should not send corrections too.'],
  ntripClientCasterHost: ['NTRIP Client Caster', 'rtk2go.com', null],
  ntripClientCasterPort: ['NTRIP Client Port', '2101', null],
  ntripClientMountPoint: ['NTRIP Client Mount Point', 'bldr_SparkFun1', null],
  ntripClientCasterUser: ['NTRIP Client User', 'test@test.com', null],
  enableNtripServer: ['NTRIP Server', 'Off', 'In base mode the unit sends its corrections to a caster.'],
  enableNtripCaster: ['NTRIP Caster', 'Off', null],
  pointPerfectService: ['PointPerfect Service', '0 (disabled)', 'Corrections come from PointPerfect and need valid keys.'],
  measurementRateMs: ['Measurement Rate (ms)', '250', 'Faster rates send more data over Bluetooth and can overload some apps.'],
  minElev: ['Elevation Mask (degrees)', '10', 'A high mask drops low satellites and can slow the fix.'],
  minCN0: ['Minimum Signal Strength (dB-Hz)', '6', 'A high value drops weak satellites.'],
  dynamicModel: ['Dynamic Model', null, 'The wrong motion model can hold the position back.'],
  antennaHeight: ['Antenna Height (mm)', '1800', 'Apps that take the pole height from the unit use this value.'],
  bluetoothRadioType: ['Bluetooth Radio', 'Classic And Low Energy', 'Decides which apps can connect. iPhone apps need Low Energy, most Android apps use Classic.'],
  dataPortBaud: ['Data Port Baud Rate', '230400', 'Must match the device on the data port.'],
  radioPortBaud: ['Radio Port Baud Rate', '57600', 'Must match the radio on the radio port.'],
  usbSerialBaud: ['USB Console Baud Rate', null, null],
  enableGnssToUsbSerial: ['Receiver Data On USB', 'Off', 'The USB port carries raw receiver data instead of the console.'],
  enableLogging: ['Logging To microSD', 'On', 'Nothing is recorded to the microSD card.'],
  enableLora: ['LoRa Radio', 'Off', 'The LoRa radio is on and can take over the USB console.'],
  loraSerialInteractionTimeout: ['LoRa Console Timeout (s)', '30', null],
  loraCoordinationFrequency: ['LoRa Frequency (MHz)', '910.000', 'Both ends of a LoRa link must use the same frequency.'],
  enableTiltCompensation: ['Tilt Compensation', 'On', 'Tilt correction is off.'],
  enableAutoFirmwareUpdate: ['Automatic Firmware Updates', 'Off', null],
  enableTcpServer: ['TCP Server', 'Off', null],
  tcpServerPort: ['TCP Server Port', '2948', null],
  enableUdpServer: ['UDP Server', 'Off', null],
  fixedBase: ['Fixed Base Position', 'Off', 'In base mode the unit uses a typed-in position instead of surveying in.'],
  fixedBaseCoordinateType: ['Fixed Base Coordinate Type', null, null],
  fixedEcefX: ['Fixed Base ECEF X (m)', null, 'Used as the base position when Fixed Base is on.'],
  fixedEcefY: ['Fixed Base ECEF Y (m)', null, 'Used as the base position when Fixed Base is on.'],
  fixedEcefZ: ['Fixed Base ECEF Z (m)', null, 'Used as the base position when Fixed Base is on.'],
  fixedLat: ['Fixed Base Latitude', null, 'Used as the base position when Fixed Base is on.'],
  fixedLong: ['Fixed Base Longitude', null, 'Used as the base position when Fixed Base is on.'],
  fixedAltitude: ['Fixed Base Altitude (m)', null, 'Used as the base position when Fixed Base is on.'],
  observationSeconds: ['Survey-In Time (s)', '60', null],
  surveyInStartingAccuracy: ['Survey-In Starting Accuracy (m)', '1.0', null],
  enableExtCorrRadio: ['External Corrections Radio', null, null],
  enableBeeper: ['Beeper', 'On', null],
  timeZoneHours: ['Time Zone (hours)', '0', null],
  shutdownNoChargeTimeoutMinutes: ['Shut Down When Not Charging (min)', '0', 'The unit turns itself off after this long on battery.'],
  wifiConfigOverAP: ['WiFi Setup Over Its Own Network', 'On', null],
  enableCaptivePortal: ['WiFi Setup Captive Portal', 'On', null],
  mdnsEnable: ['rtk.local Address', 'On', null],
  profileName: ['Profile Name', 'Profile1', null],
  clearBtPairings: ['Clear Bluetooth Pairings', 'On', null],
  lastState: ['Saved Mode', null, null],
  enableMultipathMitigation: ['Multipath Mitigation', 'On', null],
  enablePrintRoverAccuracy: ['Live Status Lines', 'On', null],
};

const BT_RADIO = { 0: 'Classic', 1: 'Low Energy', 2: 'Classic And Low Energy', 3: 'Off' };
const SECRET_RE = /(PW|Password|Token|Key|ClientID)$/i;

export function isSecret(name) { return SECRET_RE.test(name); }

function titleFromName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bWifi\b/g, 'WiFi').replace(/\bNtrip\b/g, 'NTRIP').replace(/\bGnss\b/g, 'GNSS').replace(/\bLora\b/g, 'LoRa')
    .replace(/\bEspnow\b/g, 'ESP-NOW').replace(/\bTcp\b/g, 'TCP').replace(/\bUdp\b/g, 'UDP').replace(/\bUsb\b/g, 'USB').replace(/\bSd\b/g, 'SD');
}

function isBoolRow(row) {
  return /bool/i.test(row.type || '') || row.value === 'true' || row.value === 'false';
}
function boolOf(v) { return v === 'true' || v === '1'; }

// label, value and default as the page shows them
function describe(row, factory) {
  const { name } = row;
  const info = INFO[name];
  let label = info?.[0] || null;
  let def = info?.[1] ?? null;
  let why = info?.[2] ?? null;
  let value = row.value;
  let m;

  if ((m = /^wifiNetwork_(\d+)SSID$/.exec(name))) { label = `WiFi Network ${+m[1] + 1} Name`; def = '(empty)'; }
  else if ((m = /^wifiNetwork_(\d+)Password$/.exec(name))) { label = `WiFi Network ${+m[1] + 1} Password`; def = '(empty)'; }
  else if ((m = /^constellation_(.+)$/.exec(name))) {
    label = `${m[1]} Satellites`;
    value = boolOf(value) ? 'On' : 'Off';
    def = 'On';
    why = value === 'Off' ? 'Fewer satellites to work with.' : null;
  } else if ((m = /^espnowPeer_(\d+)$/.exec(name))) { label = `ESP-NOW Paired Unit ${+m[1] + 1}`; def = '(none)'; }
  else if (/^debug/.test(name) || /Debug$/.test(name)) { why = 'Debug prints are on. They add text to the console and slow the unit a little.'; }

  if (name === 'bluetoothRadioType' && BT_RADIO[value] !== undefined) value = BT_RADIO[value];
  else if (name === 'enableExtCorrRadio') value = value === '0' ? 'Off' : value === '1' ? 'On' : value;
  else if (isBoolRow(row) && !/^constellation_/.test(name)) {
    const on = boolOf(value);
    value = on ? 'On' : 'Off';
    if (def === null) def = on ? 'Off' : 'On'; // a changed switch has only one other position
    // reasons are written for the non-default position
    if (def === value) why = null;
  }
  if (isSecret(name) && value) value = '(hidden)';
  if (value === '') value = '(empty)';
  // this model starts with its own value for the setting
  if (factory && factory[name] !== undefined) {
    const f = { name, type: row.type, value: factory[name] };
    def = describe(f, null).value;
  }
  if (!label) {
    const n = /^(.+)_(\d+)$/.exec(name);
    label = n ? `${titleFromName(n[1])} ${+n[2] + 1}` : titleFromName(name);
  }
  return { name, label, value, def, why };
}

export function modelKey(snap) {
  return (snap?.header?.product || '').trim().toUpperCase();
}

// Sorts the unit's own list. Returns
//   { supported, error, model, hasFactoryList, changed: [...], shipped: [...] }
// where every row is { name, label, value, def, why }.
export function classifyChanged(snap) {
  const model = snap?.header?.product || '';
  const factory = MODEL_FACTORY[modelKey(snap)];
  const out = { supported: true, error: null, model, hasFactoryList: !!factory, changed: [], shipped: [] };
  const src = snap?.changed;
  if (!src) { out.supported = false; out.error = 'Not read'; return out; }
  if (src.error) { out.supported = false; out.error = src.error; return out; }

  for (const row of src.rows || []) {
    if (IDENTITY.has(row.name)) continue;
    if (row.name === 'loraSerialInteractionTimeout' && snap.loraTimeoutRaised) {
      // This page raises the value itself while it is connected. Show what the unit had.
      const orig = snap.loraTimeoutOriginal;
      if (orig === null || orig === undefined || String(orig) === '30') continue;
      out.changed.push(describe({ ...row, value: String(orig) }, factory));
      continue;
    }
    const first = FIRST_START[row.name];
    const fact = factory ? factory[row.name] : undefined;
    if ((first !== undefined && row.value === first) || (fact !== undefined && row.value === fact)) {
      out.shipped.push(describe(row, null));
      continue;
    }
    out.changed.push(describe(row, factory));
  }
  // rows with a reason first, the unit's own order otherwise
  out.changed = [...out.changed.filter((r) => r.why), ...out.changed.filter((r) => !r.why)];
  return out;
}

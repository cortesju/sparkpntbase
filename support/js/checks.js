// Diagnostic rules. Each finding: {id, level, title, detail, action?}
// level: ok | info | warn | bad. action: {label, kind, args}

import { installedVersions, latestMain, latestFor, compareMain, compareSubsystem, mainVersionOf, rowVersion } from './firmware.js';
import { parseEspVersion } from './receiver.js';

const BT_TYPES = { 0: 'Bluetooth Classic (SPP)', 1: 'Bluetooth Low Energy', 2: 'Bluetooth Classic and Low Energy', 3: 'Off' };
const STATES = { 0: 'ROVER', 1: 'BASE', 2: 'NTP', 3: 'BASE CASTER', 4: 'BASE ASSIST' };

export function stateWord(raw) {
  if (!raw) return null;
  const s = raw.trim();
  if (/rtk fix/i.test(s)) return 'RTK FIX';
  if (/rtk float/i.test(s)) return 'RTK FLOAT';
  if (/ppp converged/i.test(s)) return 'PPP';
  if (/ppp converging/i.test(s)) return 'PPP CONVERGING';
  if (/dgps/i.test(s)) return 'DGNSS';
  if (/3d fix/i.test(s)) return 'GNSS';
  if (/no fix/i.test(s)) return 'NO FIX';
  return s.toUpperCase();
}

const val = (snap, key) => {
  const v = snap.cli?.[key];
  return v && v.value !== undefined ? v.value : null;
};
const num = (snap, key) => { const v = val(snap, key); return v === null || v === '' || Number.isNaN(+v) ? null : +v; };

export function runChecks(snap, fw) {
  const f = [];
  const add = (id, level, title, detail, action) => f.push({ id, level, title, detail, action });
  const product = snap.header?.product || 'unit';

  // Identity
  if (snap.header?.product) {
    add('identity', 'ok', `Talking to a ${snap.header.brand} ${product}`,
      `Firmware ${snap.header.version}${snap.header.bluetoothName ? `, Bluetooth name ${snap.header.bluetoothName}` : ''}.`);
  } else {
    add('identity', 'warn', 'The unit answered, but not with the expected menu',
      'The page read something it did not recognize. The Console tab shows exactly what the unit printed.');
  }
  if (snap.rebootSeen) {
    add('reboot', 'info', 'The unit restarted when this page opened the port',
      'Opening a USB port pulses the reset line on these units. That is normal and nothing is wrong, but the fix it had was lost and it is reacquiring now.');
  }
  if (snap.errors.length) {
    add('partial', 'info', 'Some readings did not complete', snap.errors.join(' '));
  }

  // Main firmware
  const inst = mainVersionOf(snap);
  if (inst && fw) {
    const rel = latestMain(fw.rows, { rc: false });
    const beta = latestMain(fw.rows, { rc: true });
    if (inst.dev) {
      add('fw-dev', 'warn', `Main firmware is a developer build (${inst.raw})`,
        'Developer builds report themselves as newer than the matching release, so the unit never installs updates over WiFi. Updating over USB from this page puts a release build on it.',
        { label: 'Open Update', kind: 'tab', args: 'update' });
    } else if (rel && compareMain(inst, rel) < 0) {
      add('fw-old', 'warn', `Main firmware ${inst.raw} is behind the current release ${rowVersion(rel)}`,
        'Newer firmware fixes known problems. It can be installed from this page over the USB cable, or by the unit itself over WiFi.',
        { label: 'Open Update', kind: 'tab', args: 'update' });
    } else if (rel) {
      add('fw-ok', 'ok', `Main firmware ${inst.raw} is current`,
        beta && compareMain(inst, beta) < 0 ? `A beta build ${rowVersion(beta)} exists for testing.` : 'Nothing newer is published.');
    }
  } else if (inst) {
    add('fw-nolist', 'info', `Main firmware ${inst.raw}`, 'The firmware list could not be loaded, so this page cannot tell whether an update exists.');
  }

  // Other chips
  if (fw) {
    for (const v of installedVersions(snap)) {
      if (v.subsystem === 'Main') continue;
      const row = latestFor(fw.rows, v.chip);
      if (!row) continue;
      const cmp = compareSubsystem(v.version, row);
      if (cmp === null) {
        add(`sub-${v.chip}`, 'info', `${v.chip} firmware version not readable`,
          `The latest published ${v.chip} firmware is ${rowVersion(row)}. The firmware menu on the unit can check and update it over WiFi.`);
      } else if (cmp < 0) {
        add(`sub-${v.chip}`, 'warn', `${v.chip} firmware ${v.version} is behind ${rowVersion(row)}`,
          `The ${subsystemWord(v.subsystem)} has newer firmware. The unit installs it itself over WiFi from the Update tab.`,
          { label: 'Open Update', kind: 'tab', args: 'update' });
      } else {
        add(`sub-${v.chip}`, 'ok', `${v.chip} firmware ${v.version} is current`, '');
      }
    }
  }

  // Battery
  const batt = num(snap, 'batteryLevelPercent') ?? snap.system?.battery ?? null;
  const volt = num(snap, 'batteryVoltage') ?? snap.system?.voltage ?? null;
  if (snap.system?.fuelGauge === 'Offline') {
    add('battery-gauge', 'warn', 'The battery gauge is not responding', 'The unit cannot report its charge. Mention this in the report; it points at a hardware fault if it persists after a restart.');
  } else if (batt !== null) {
    const vtxt = typeof volt === 'number' ? ` (${volt.toFixed(2)} V)` : '';
    if (batt < 10) add('battery', 'bad', `Battery at ${batt}%${vtxt}`, 'Charge the unit before anything else. A nearly empty battery causes restarts and lost fixes.');
    else if (batt < 25) add('battery', 'warn', `Battery at ${batt}%${vtxt}`, 'Charge soon. Below about 10% the unit shuts down on its own.');
    else add('battery', 'ok', `Battery at ${batt}%${vtxt}`, '');
  }

  // Mode
  const running = num(snap, 'setState');
  const modeText = snap.header?.mode || (running !== null ? STATES[running] : null);
  if (modeText) {
    const up = modeText.toUpperCase();
    if (/BASE/.test(up)) {
      add('mode', 'info', `The unit is in ${up.replace(/\s*MODE$/, '')} mode`,
        'A base sends corrections and does not move. If you expected it to work as a rover, switch it back from the Console tab.',
        { label: 'Switch To Rover', kind: 'rover' });
    } else {
      add('mode', 'ok', `The unit is in ${up.replace(/\s*MODE$/, '')} mode`, '');
    }
  }

  // Bluetooth
  const btType = num(snap, 'bluetoothRadioType');
  if (btType === 3 || snap.header?.bluetooth === 'Off' || snap.system?.bluetooth === 'Off') {
    add('bt-off', 'warn', 'Bluetooth is turned off',
      'Phone apps, including SparkPNT Link, cannot see the unit. Turning Bluetooth Low Energy on restarts the unit.',
      { label: 'Turn Bluetooth On', kind: 'bt-on' });
  } else if (btType !== null) {
    add('bt', 'ok', `${BT_TYPES[btType] || 'Bluetooth'} is on`,
      snap.system?.bluetoothConnected ? 'A phone or computer is connected right now.' : 'No phone is connected right now, which is fine while the cable is in.');
  }

  // Position
  const rover = [...snap.live].reverse().find((l) => l.kind === 'rover');
  const base = [...snap.live].reverse().find((l) => l.kind === 'base');
  const ntripOn = val(snap, 'enableNtripClient') === '1' || val(snap, 'enableNtripClient') === 'true';
  const ntripHost = val(snap, 'ntripClientCasterHost');
  const ntripStatus = snap.system?.ntripClient || '';
  const wifi = val(snap, 'wifiNetwork_0SSID') || val(snap, 'wifiNetwork_1SSID');
  const pp = num(snap, 'pointPerfectService');
  if (rover) {
    const st = stateWord(rover.state);
    const sivs = snap.live.filter((l) => l.kind === 'rover').map((l) => l.siv);
    const maxSiv = Math.max(...sivs);
    const acc = `${rover.accuracy} ${rover.units}`;
    if (st === 'NO FIX' && maxSiv < 4) {
      add('fix', 'warn', `NO FIX, ${maxSiv} satellites in view`,
        'The antenna sees almost no sky. Indoors this is expected; outside, hold the unit upright with a clear view of the sky and give it a minute.');
    } else if (st === 'NO FIX') {
      add('fix', 'info', `NO FIX with ${maxSiv} satellites in view`, 'Satellites are tracked but no position yet. Usually a few more seconds outdoors fixes this.');
    } else if (st === 'RTK FIX') {
      add('fix', 'ok', `RTK FIX, about ${acc}, ${rover.siv} satellites`, 'Corrections are arriving and the position is centimeter level.');
    } else if (st === 'RTK FLOAT') {
      add('fix', 'info', `RTK FLOAT, about ${acc}, ${rover.siv} satellites`, 'Corrections arrive and the solution is converging. Stay still with open sky; it usually fixes within a minute.');
    } else if (st === 'PPP') {
      add('fix', 'ok', `PPP converged, about ${acc}, ${rover.siv} satellites`, 'The receiver is using satellite-broadcast corrections (Galileo HAS or PointPerfect over L-band).');
    } else if (st === 'PPP CONVERGING') {
      add('fix', 'info', `PPP CONVERGING, about ${acc}, ${rover.siv} satellites`, 'The receiver is converging on satellite-broadcast corrections (Galileo HAS or PointPerfect over L-band). With open sky this takes several minutes and ends at decimeter level or better.');
    } else {
      // GNSS or DGNSS: no corrections being used
      if (ntripOn && !/\bConnected\b/i.test(ntripStatus)) {
        add('fix', 'warn', `${st}, about ${acc}: the NTRIP client is set up but not connected`,
          `Caster ${ntripHost || '(none)'}. ${wifi ? `The unit expects WiFi network "${wifi}".` : 'No WiFi network is saved, and the NTRIP client needs one.'} Check the network, caster address, user and mount point.`);
      } else if (ntripOn && !ntripHost) {
        add('fix', 'warn', `${st}: NTRIP is enabled with no caster address`, 'Enter the caster host, port, mount point and credentials, or get corrections from a phone app instead.');
      } else if (!ntripOn && !pp) {
        add('fix', 'info', `${st}, about ${acc}: no corrections configured on the unit`,
          'Without corrections the unit stays at meter level. Corrections can come from a phone app over Bluetooth (for example SparkPNT Link with an NTRIP or PointPerfect account), or be configured on the unit itself.');
      } else {
        add('fix', 'info', `${st}, about ${acc}`, 'Corrections are configured but not applied yet. Give it a minute outdoors; if it stays like this, the correction source is the thing to check.');
      }
    }
  } else if (base) {
    add('fix', 'ok', `${base.state} with ${base.siv} satellites in view`, '');
  } else if (val(snap, 'enablePrintRoverAccuracy') === '0' || val(snap, 'enablePrintRoverAccuracy') === 'false') {
    add('fix', 'info', 'Live status lines are switched off on this unit', 'The unit was not printing its position while this page watched. Nothing is wrong; the fix state is simply not visible here.');
  } else if (snap.gnss && !snap.gnss.online) {
    add('gnss-offline', 'bad', 'The GNSS receiver inside the unit is offline', 'The main processor cannot talk to the GNSS receiver. Restart the unit; if it stays offline, send us the report.');
  } else {
    add('fix', 'info', 'No live position lines were seen', 'The unit printed nothing about its position while this page watched. Restart it and run the check again.');
  }

  // Restarts
  if (snap.system?.resets !== null && snap.system?.resets !== undefined) {
    const up = snap.system.uptimeSeconds || 0;
    if (snap.system.resets >= 20) {
      add('resets', 'info', `The unit has restarted ${snap.system.resets} times`, `Up for ${formatUptime(up)} since the last one. Frequent restarts with a good battery are worth mentioning in the report.`);
    }
  }

  // Parser
  const pf = snap.system?.parserFiltered;
  if (pf && pf.nmea + pf.rtcm + pf.ubx > 2000) {
    add('parser', 'warn', 'Many bytes from the receiver could not be parsed', `${pf.nmea} NMEA, ${pf.rtcm} RTCM, ${pf.ubx} UBX since power on. This usually means a baud rate mismatch after a receiver firmware update; a factory reset of the unit sets both sides back to defaults.`);
  }

  // Logging
  const logging = val(snap, 'enableLogging');
  if (snap.system?.microSd === 'Offline' && (logging === '1' || logging === 'true')) {
    add('sd', 'warn', 'Logging is on but no microSD card is online', 'Insert a FAT32 formatted card, or turn logging off if you do not need log files.');
  }
  const logState = num(snap, 'loggingState');
  if (logState === 0 && snap.system?.microSd !== 'Offline') add('sd', 'info', 'No microSD card', 'Not a problem unless you need log files on the unit.');

  // USB and console
  if (snap.loraTimeoutRaised) {
    add('lora-console', 'info', 'The LoRa radio takes over the USB console 30 seconds after power on',
      'A Torch cannot talk to USB and to its LoRa radio at the same time, so a terminal goes silent half a minute after the unit starts, until the cable is unplugged and plugged back in. While this page is connected it raises that timeout to 10 minutes (the setting is called loraSerialInteractionTimeout) and puts it back when you press Disconnect. If you just unplug, the 10 minutes stay until the next proper disconnect.');
  }
  const nmeaUsb = val(snap, 'enableGnssToUsbSerial');
  if (nmeaUsb === '1' || nmeaUsb === 'true') add('usb-nmea', 'info', 'The unit streams NMEA on this USB port', 'Terminal programs need +++ to open the menu. This page handles that for you.');
  const usbBaud = num(snap, 'usbSerialBaud');
  if (usbBaud && usbBaud !== 115200) add('usb-baud', 'info', `USB console runs at ${usbBaud} baud`, 'Other terminal programs must be set to the same rate.');

  // Settings
  const elev = num(snap, 'minElev');
  if (elev !== null && elev >= 25) add('elev', 'info', `Elevation mask is ${elev} degrees`, 'High masks drop satellites and make fixes slower. 10 to 15 degrees is typical.');
  const cn0 = num(snap, 'minCN0');
  if (cn0 !== null && cn0 >= 20) add('cn0', 'info', `Minimum signal strength is ${cn0} dB-Hz`, 'High values drop usable satellites. Default is 6.');
  const profile = num(snap, 'profileNumber');
  if (profile) add('profile', 'info', `Profile ${profile + 1} is active`, 'Settings profiles switch the whole configuration. Check that the one you expect is active.');
  if (snap.changed?.rows?.length) {
    const n = snap.changed.rows.filter((r) => !['deviceName', 'deviceId', 'bluetoothId', 'espFirmwareVersion', 'gnssFirmwareVersion', 'gnssModuleInfo'].includes(r.name)).length;
    if (n) add('changed', 'info', `${n} settings differ from factory defaults`, 'They are listed in the report so we can see how the unit is configured. A factory reset is available in the Console tab if you want a clean start.');
  }

  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  f.sort((a, b) => order[a.level] - order[b.level]);
  return f;
}

function subsystemWord(s) {
  if (s === 'GNSS') return 'GNSS receiver';
  if (s === 'LoRa') return 'LoRa radio';
  if (s === 'IMU') return 'tilt sensor';
  return s;
}

export function formatUptime(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

export { parseEspVersion };

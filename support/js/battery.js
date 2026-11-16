// Battery test: does the unit take charge from a given power source?
//
// The unit reports its battery level, voltage and charge rate. The rate is percent per hour,
// positive while current flows into the battery and negative while it flows out. On the two-cell
// packs it follows the measured battery current, averaged by the fuel gauge over about a minute,
// so a verdict uses the readings from the end of a phase.

import { sleep } from './receiver.js?v=1794854845';

export const CHARGERS = ['Supplied Charger', 'Phone Charger', 'Laptop USB-C Charger', 'Computer USB Port', 'Power Bank', 'Other Charger'];

const num = (r) => (r && !r.error && r.value !== '' && !Number.isNaN(+r.value) ? +r.value : null);

// One reading. rate is null when the firmware does not report it.
export async function readBattery(rx) {
  const percent = num(await rx.get('batteryLevelPercent'));
  const voltage = num(await rx.get('batteryVoltage'));
  let rate = num(await rx.get('batteryChargingPercentPerHour'));
  // The command answers in whole percent. The unit's own status line carries two decimals,
  // so use it when one arrived in the last few seconds.
  const line = rx.lastLive ? rx.lastLive('battery') : null;
  if (rate !== null && line && line.rate !== null && line.rate !== undefined && Date.now() - line.t < 7000 && Math.abs(line.rate - rate) <= 1) rate = line.rate;
  return { t: Date.now(), percent, voltage, rate };
}

// Reads every `every` seconds for `seconds`. Stops early when shouldStop() turns true.
export async function samplePhase(rx, { seconds, every = 5, onSample = () => {}, shouldStop = () => false }) {
  const samples = [];
  const start = Date.now();
  const end = start + seconds * 1000;
  for (;;) {
    const s = await readBattery(rx);
    samples.push(s);
    onSample(s, Math.min(1, (Date.now() - start) / (seconds * 1000)), samples);
    if (Date.now() >= end || shouldStop()) break;
    const next = Math.min(end, s.t + every * 1000);
    while (Date.now() < next && !shouldStop()) await sleep(200);
    if (shouldStop()) break;
  }
  return samples;
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// What a phase showed. The rate is the median of the last third, after the gauge has settled.
export function summarize(samples) {
  const ok = samples.filter((s) => s.percent !== null || s.voltage !== null);
  if (!ok.length) return { answered: false, count: samples.length };
  const tail = ok.slice(-Math.max(3, Math.ceil(ok.length / 3)));
  const rates = tail.map((s) => s.rate).filter((r) => r !== null);
  const first = ok[0];
  const last = ok[ok.length - 1];
  const r = median(rates);
  return {
    answered: true,
    count: samples.length,
    seconds: Math.round((last.t - first.t) / 1000),
    percentStart: first.percent, percentEnd: last.percent,
    voltageStart: first.voltage, voltageEnd: last.voltage,
    rate: r === null ? null : Math.round(r * 100) / 100,
  };
}

export function fmtRate(r) {
  if (r === null || r === undefined) return '-';
  const v = Math.abs(r) >= 10 || Number.isInteger(r) ? Math.round(r) : Math.round(r * 10) / 10;
  return `${v > 0 ? '+' : ''}${v}% per hour`;
}

function fmtDuration(hours) {
  const min = Math.round(hours * 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Turns the numbers into a verdict: { level, title, detail }.
// baseline is the phase on battery alone (null over USB), plugged the phase with the charger.
export function judge({ baseline, plugged }) {
  if (!plugged || !plugged.answered) {
    return { level: 'warn', title: 'The battery gauge did not answer', detail: 'The unit could not report its battery during the test. Restart it and try again. If it stays this way, mention it in the report.' };
  }
  const pct = plugged.percentEnd;
  const rate = plugged.rate;
  const base = baseline && baseline.answered ? baseline : null;

  if (rate === null) {
    // No charge rate from this firmware: the voltage is the only sign, and it only means
    // something next to a reading taken on battery alone.
    if (!base || base.voltageEnd === null || plugged.voltageEnd === null) {
      return { level: 'info', title: 'Charging could not be judged', detail: 'This firmware does not report the charge rate. Update the firmware, or connect over Bluetooth so the page can compare the battery with and without the charger.' };
    }
    const dv = Math.round((plugged.voltageEnd - base.voltageEnd) * 100) / 100;
    const why = 'This firmware does not report the charge rate, so the result comes from the voltage alone.';
    if (dv >= 0.05) return { level: 'info', title: `Probably charging: the voltage rose by ${dv.toFixed(2)} V`, detail: why };
    return { level: 'warn', title: 'No sign of charging: the voltage did not rise', detail: `${why} Update the firmware for a firm answer.` };
  }

  if (pct !== null && pct >= 97 && rate > -1 && rate < 2) {
    return { level: 'ok', title: `Battery is full at ${pct}%`, detail: 'A full battery takes no more charge. Run the test again below about 90% to see the charge rate.' };
  }
  if (rate >= 2) {
    const left = pct !== null && pct < 100 ? ` About ${fmtDuration((100 - pct) / rate)} to full from ${pct}%.` : '';
    if (rate < 5) return { level: 'info', title: `Charging slowly at ${fmtRate(rate)}`, detail: `This power source gives the unit little current.${left}` };
    return { level: 'ok', title: `Charging at ${fmtRate(rate)}`, detail: left.trim() };
  }
  if (rate > -1) {
    return {
      level: 'warn',
      title: 'Plugged in but not charging',
      detail: `The level holds at ${pct ?? '?'}% and does not rise.${base && base.rate !== null && base.rate <= -2 ? ` On battery alone the unit used ${fmtRate(base.rate).replace(/^-/, '')}, so this charger covers what the unit uses and nothing more.` : ''}`,
    };
  }
  if (base && base.rate !== null && rate > base.rate + 1) {
    return { level: 'bad', title: `Plugged in but still draining at ${fmtRate(rate)}`, detail: `The charger supplies some power, less than the unit uses (${fmtRate(base.rate)} on battery alone). Try the supplied charger and cable.` };
  }
  return {
    level: 'bad',
    title: `Plugged in but still draining at ${fmtRate(rate)}`,
    detail: 'The unit takes no power from this charger. If the same charger and cable work on another device, this points at the unit\'s charge circuit or battery.',
  };
}

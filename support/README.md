# SparkPNT Device Support

A static web page that talks to SparkPNT and SparkFun RTK units over USB from the browser. It reads the unit's state, points out problems, gives a friendly way into the configuration menus, writes a support report, and updates firmware.

No build step, no server code. Chrome or Edge on a computer is required (Web Serial).

## What it does

| Tab | What happens |
| --- | --- |
| Check | Opens the unit's serial menu, reads system status, the GNSS receiver, the firmware menu and about 35 settings over the `$SP` command line, watches the live position for 8 seconds, then lists findings with plain-language advice. |
| Console | The unit's own menu with buttons for the common moves (main menu, system status, rover/base, Bluetooth on, restart, factory reset) and a line to type anything. |
| Report | A text report with identity, versions, status, settings that differ from defaults, the findings and the console log. Download, copy, share, or open a prefilled email. Passwords and keys are blanked. |
| Update | Installed versus latest versions from the SparkFun firmware list. Main (ESP32) firmware is written over USB with esptool-js. Receiver, LoRa and tilt firmware go through the unit's own WiFi update. |

## Files

```
index.html        page
css/style.css     SparkPNT look (Archivo + Roboto, red pill buttons)
js/config.js      support email, firmware list URLs, CDN links
js/link.js        Web Serial link
js/receiver.js    menu driving, $SP commands, parsers
js/checks.js      diagnostic rules
js/firmware.js    firmware list, version compare, esptool-js flash
js/report.js      report text, download, mailto, share
js/sim.js         simulated units (?sim=tx2, ?sim=fpx, ?sim=torch)
js/app.js         page wiring
assets/           logo
```

## Run locally

Any static server works. For example:

```bash
python -m http.server 8110 -d device-support
```

Then open `http://localhost:8110/`. Web Serial needs `localhost` or HTTPS.

## Publish on GitHub Pages

1. Create a repository (for example `sparkpnt/device-support`) and push the contents of this folder to `main`.
2. Settings, Pages, Source: Deploy from a branch, `main` / root.
3. The page is live at `https://<org>.github.io/device-support/`. Pages serves HTTPS, which Web Serial requires.

Before publishing, confirm `supportEmail` in `js/config.js`.

## How the unit is driven

- Any character on the USB console (115200 baud) opens the main menu. When the unit streams NMEA on USB, `+++` opens it instead; the page tries both.
- `s`, `1` and `f` open the System, GNSS Receiver and Firmware menus; `x` goes back. Every menu ends with `x) Exit`, which the page uses to know the print is complete.
- `+` enters command mode. Commands are NMEA framed (`$SPGET,name*CS`). `exit` leaves it.
- `$SPGET,changedSettings` returns identity rows and every non-default setting (firmware since September 2026).
- With the menu closed the unit prints `Rover Accuracy (m): 0.014, SIV: 27 GNSS State: RTK Fix` every 2 seconds, which gives the live fix.

## Hardware facts the page depends on

- **Opening the port restarts the unit.** The CH342 bridge's DTR and RTS lines drive the ESP32 reset and boot pins. Chrome asserts both on open, which holds the unit in reset until the page releases them (`setSignals` right after `open`). The unit then boots; a Torch needs about 16 seconds, so the page keeps knocking for up to 45 seconds. Terminal programs that assert DTR/RTS show a silent unit for the same reason.
- **The firmware clears its input buffer before every line read**, so anything sent within a few milliseconds of its last print is lost. Every send waits 150 ms after the last received line.
- **A Torch hands the console to its LoRa radio** `loraSerialInteractionTimeout` seconds (default 30) after the radio starts or after the main menu was last left (measured: exit at 22.4 s with a 20 s value, console gone at 43.5 s). The page raises the setting to 600 right after the first menu opens and restores it on Disconnect by leaving the menu, reopening, writing the old value and leaving again (the second exit writes flash and restarts the clock). Writing the old value without leaving first drops the console within a second. Unplugging the cable also restores the console.
- **`csvUrl` is never read over the CLI**: the firmware's 200 byte reply buffer overflows on it and garbles the following replies.
- Verified on 22 Oct 2026 against a SparkPNT RTK Torch on firmware v3.4 (UM980 build 17548, LoRa 3.0.1, IMU 11.4.1): full check, console keys, mode switch.

## Firmware update over USB

The page downloads the release listed first in `RTK-Everywhere-Variants.csv` from the SparkFun binaries repository, verifies size and CRC32, then writes `boot_app0.bin` at `0xE000` and the app at `0x10000` at 115200 baud (the CH342 bridge does not take 921600). The bootloader and partition table already on the unit are kept. The SparkFun uploader GUI remains the fallback for a unit that does not boot.

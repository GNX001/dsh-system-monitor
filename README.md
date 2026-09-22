# dsh-system-monitor

English | [中文](README.zh.md)

A floating system-monitor tile for the **DeepSeek Harness** web GUI: live CPU,
memory and every GPU on the machine — utilization, temperature, VRAM and power
draw — in one draggable glass tile that stays out of the way.

```
┌──────────────────────────────────────┐
│ ⣿  SYSTEM MONITOR        ⟳   ⌄   ✕  │   ← drag anywhere
├──────────────────────────────────────┤
│ CPU  Ryzen 7 8845HS            23%   │
│ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░          │
│ 81.9°C                               │
│ MEM                            61%   │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░          │
│ 19.4 GB / 32.0 GB                    │
│ GPU  RTX 5070 Ti               42%   │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░          │
│ 61°C    4.0 GB / 12.0 GB             │
│ ● dev-box            Updated 04:31   │
└──────────────────────────────────────┘
```

*(A layout sketch, not a screenshot — the tile is rendered by your own theme, so
its exact colors follow your DSH appearance settings.)*

## Features

- **CPU** — aggregate and per-core utilization, plus a CPU temperature where the
  platform exposes one.
- **Memory** — used / total and a load bar, using the same "available" accounting
  Windows Task Manager and macOS Activity Monitor show.
- **Every GPU** — one row per adapter with utilization, temperature, VRAM used /
  total and (optionally) power draw. A hybrid laptop reports both the discrete
  and the integrated GPU.
- **Floating and draggable** — park it anywhere; the position, size, opacity and
  visible sections persist across reloads.
- **Honest about missing data** — a counter the platform does not implement shows
  `—`, never a fabricated `0`. The tile is resilient: a missing vendor tool
  degrades one metric, it never blanks the widget.
- **Loopback-only, read-only** — the host half serves two GET routes fenced to
  the local machine. No writes, no network egress, no elevation, no drivers.
- **Bilingual** — English and Chinese, following the DSH locale setting.

## Requirements

| | |
| --- | --- |
| DeepSeek Harness | `>= 0.1.5-rc.1`, `web` or `desktop` profile |
| Node | `>= 20` (the version Harness itself ships is fine) |
| Runtime dependencies | **none** |

Platform coverage for each reading:

| Reading | Windows | Linux | macOS |
| --- | --- | --- | --- |
| CPU utilization | ✅ `os.cpus()` | ✅ | ✅ |
| CPU temperature | ✅ ACPI thermal zones via `typeperf` | ✅ `/sys/class/thermal` + `coretemp`/`k10temp` | ❌ needs root (`powermetrics`) |
| Memory | ✅ | ✅ | ✅ |
| GPU utilization / temp / VRAM / power | ✅ NVIDIA via `nvidia-smi`; utilization-only fallback via Windows GPU performance counters | ✅ NVIDIA via `nvidia-smi`; AMD via `amdgpu` sysfs | ❌ |

Row by row: **CPU usage and memory work everywhere Node runs.** GPU and CPU
temperature need a source the operating system actually publishes; where it
does not exist, that one reading is blank and the rest keep working.

## Install

### Straight from this repository (recommended)

```sh
dsh plugin --profile web add github:GNX001/dsh-system-monitor
```

No build step is needed: the bundled browser half (`lib/client.js`) is committed,
so installing from git is enough. There is no npm release yet.

### From a local checkout

```sh
git clone https://github.com/GNX001/dsh-system-monitor.git
cd dsh-system-monitor
dsh plugin --profile web add link:$(pwd)
```

### From npm (once published)

```sh
dsh plugin --profile web add dsh-system-monitor
```

Restart `dsh web` (or DSH Desktop) after installing. The tile appears in the
top-right corner, and **Settings → System monitor tile** gains a section for it.

> **DSH Desktop note.** The desktop shell starts the Harness server itself, so a
> plugin install only takes effect on the next restart of DSH Desktop. If `dsh`
> is not on your `PATH`, the same command works through the copy the desktop
> ships — for example
> `node "$env:APPDATA\dsh-desktop\harness\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add github:GNX001/dsh-system-monitor`.

## Usage

| Action | How |
| --- | --- |
| Move the tile | Drag its header bar |
| Collapse / expand | The `⌄` button, or double-click the header |
| Refresh immediately | The `⟳` button (forces a fresh hardware probe) |
| Hide the tile | The `✕` button — reopen it in **Settings → System monitor tile** |
| Configure | **Settings → System monitor tile** |

Everything configurable lives in DSH's own Settings, not in a popover on the
widget:

| Setting | Default | Notes |
| --- | --- | --- |
| Show the floating tile | on | The way back after hiding it |
| Refresh interval | 1.5 s | 1 s – 10 s |
| Opacity | 94 % | 40 % – 100 % |
| CPU / CPU temperature / Memory / GPU | on | Section visibility |
| GPU temperature / VRAM / power draw | temp + VRAM on, power off | |
| Per-core usage | off | Adds a per-core bar strip |
| Compact mode | off | Tighter rows |
| Reset position / Restore defaults | — | |

## Configuration

The tile's own options live in the browser. The **host half** is configured in
the profile's `cordis.patch.yml`, under the row this plugin inserts:

```yaml
- insert:
    - id: system-monitor
      name: dsh-system-monitor
      config:
        # All optional; these are the defaults.
        tickMs: 1000                  # CPU/memory cadence (in-process, cheap)
        gpuMs: 1500                   # GPU probe cadence (spawns nvidia-smi)
        cpuTemperatureMs: 5000        # CPU temperature cadence (spawns typeperf)
        cpuTemperatureScale: auto     # auto | kelvin | decikelvin | decicelsius
        gpu: true                     # false = never probe GPUs
        cpuTemperature: true          # false = never probe CPU temperature
        allowRefresh: true            # false = reject ?refresh=1
        nvidiaSmiPath: nvidia-smi     # name or absolute path
        enabled: true                 # false = mount nothing at all
```

`cpuTemperatureScale` exists because ACPI thermal zones are reported in
different units by different providers; `auto` detects the unit from the
magnitude, and the override is there for sources that disagree. See
[How each number is obtained](#how-each-number-is-obtained).

## HTTP API

Both routes are `GET`, loopback-only, and `Cache-Control: no-store`.

| Route | Purpose |
| --- | --- |
| `/api/dsh-system-monitor/snapshot` | The current reading (served from a cached sample; no IO in the request path) |
| `/api/dsh-system-monitor/snapshot?refresh=1` | Force a fresh hardware probe before answering |
| `/api/dsh-system-monitor/health` | Plugin identity, version, cadence — never touches hardware |

`snapshot` returns:

```jsonc
{
  "ok": true,
  "version": "0.1.0",
  "ts": 1780000000000,
  "host": { "hostname": "dev-box", "platform": "win32", "arch": "x64", "uptimeSec": 3600, "pid": 42 },
  "cpu": {
    "usage": 23.4,                 // percent, null until a second sample exists
    "perCore": [10, 90, 50, 0],
    "cores": 4,
    "model": "AMD Ryzen 7 8845HS w/ Radeon 780M Graphics",
    "speedMHz": 3800,
    "temperature": 81.9,           // Celsius, null when unavailable
    "temperatureSource": "acpi-thermal-zone",
    "temperatureZones": [{ "name": "\\_SB.ECTZ", "celsius": 81.9 }]
  },
  "memory": { "totalBytes": 34359738368, "usedBytes": 20820942848, "freeBytes": 13538795520, "usage": 60.6 },
  "gpus": [{
    "index": 0,
    "name": "NVIDIA GeForce RTX 5070 Ti Laptop GPU",
    "vendor": "nvidia",
    "source": "nvidia-smi",
    "usage": 42,
    "temperature": 61,
    "powerWatts": 88.5,
    "memory": { "usedBytes": 4294967296, "totalBytes": 12884901888, "usage": 33.3 }
  }],
  "gpuSource": "nvidia-smi",
  "errors": []                     // per-metric diagnostics, capped at 6
}
```

Every numeric field is `null` rather than `0` when the reading is unavailable.

## Privacy and security

- **Loopback only.** Every request must arrive from a direct `127.0.0.1` / `::1`
  peer; anything else is `403` before a single metric is read. A request carrying
  a proxy's `X-Forwarded-For` / `Forwarded` header is refused too, so a
  reverse-proxied LAN client cannot reach the plugin by pretending to be local.
- **Read-only.** There are no mutation routes. Nothing this plugin exposes can
  change a file, a setting, or a process — so there is no CSRF surface to defend.
- **No network egress.** The plugin makes no outbound requests and sends no
  telemetry. It never contacts a vendor API or the internet.
- **No elevation.** Nothing runs as administrator/root, no driver is installed,
  no system service is registered.
- **Nothing leaves the machine.** Readings are served to the browser you are
  already looking at and are never written to disk.

The snapshot does reveal host inventory (CPU/GPU model names, memory pressure) to
whatever can reach the loopback port. That is inherent to a system monitor; the
fence is what keeps it local.

## How each number is obtained

This plugin installs no drivers and reads no undocumented memory. Every reading
comes from one of three places, and each is labelled with its `source` field.

**CPU utilization** — `os.cpus()` cumulative per-core jiffies, differenced
between ticks. The first sample after start has no baseline, so `usage` is `null`
until the second.

**Memory** — `os.totalmem()` / `os.freemem()`. On Windows this is
`GlobalMemoryStatusEx.ullAvailPhys` (the "available" figure), which is why the
percentage matches Task Manager rather than a raw free-page count.

**CPU temperature, Windows** — the PDH counter set
`\Thermal Zone Information(*)\Temperature`, read with the built-in `typeperf`
tool. Windows exposes no CPU die temperature to a non-elevated process
(`MSAcpi_ThermalZoneTemperature` and the vendor WMI namespaces are refused or
absent without drivers), so the ACPI thermal zones are what is available.

> **On the unit.** The PDH counter is widely documented as "degrees Kelvin", but
> ACPI's underlying `_TMP` is deci-Kelvin — and deci-Kelvin is impossible for the
> values a real machine reports (355 deci-Kelvin is 35.5 K). Measured on a
> Windows 11 AMD laptop: the counter idles at ~355 and plateaus at ~367 under
> sustained 4-thread load. Read as Kelvin that is 82 °C → 94 °C, i.e. a laptop
> CPU settling just under its 95 °C throttle. Read as deci-Celsius the same trace
> would be a 1.2 °C rise under full load, which no physical package does. This
> plugin therefore reads Kelvin, and `cpuTemperatureScale` lets you override it
> for a source that behaves differently.

**CPU temperature, Linux** — `/sys/class/thermal/thermal_zone*/temp` and the
`hwmon` chips whose driver name is a CPU sensor (`coretemp`, `k10temp`,
`zenpower`, `cpu_thermal`, `acpitz`). The hottest zone is reported as the
headline figure and every zone is listed in `temperatureZones`.

**GPU, NVIDIA (Windows and Linux)** — `nvidia-smi
--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,name
--format=csv,noheader,nounits`, invoked with a fixed argument vector. `name` is
requested **last** on purpose: GPU marketing names contain commas, and a trailing
free-text column can be re-joined safely whereas a middle one cannot.

**GPU, Windows without `nvidia-smi`** — the vendor-neutral PDH counters
`\GPU Engine(*)\Utilization Percentage` and `\GPU Adapter Memory(*)\Dedicated
Usage`, grouped per adapter. Utilization is the **maximum** across an adapter's
engine instances, not the sum: the counters are per-engine percentages, so
summing a frame that is both rendered and copied would exceed 100%. This counter
set carries no temperature and no VRAM capacity, so those stay `null`.

**GPU, AMD on Linux** — `amdgpu` sysfs: `gpu_busy_percent`, `mem_info_vram_used`
/ `mem_info_vram_total`, and the `hwmon` temperature nodes. No process needed.

**Zero is treated as "no reading"** for every temperature path: ACPI reports `0`
for an absent sensor and kernel drivers publish `0` for an unpopulated one.
Reporting that as a genuine 0 °C would be worse than reporting nothing.

## Troubleshooting

**The tile never appears.**
The browser half needs the host half. Check `GET /api/dsh-system-monitor/health`
in the same browser: a JSON reply means the host half is up and the problem is
client-side (reload the app). A 404 means the plugin did not load — confirm the
row is in the profile's `cordis.patch.yml` and restart `dsh web`.

**GPU shows `No GPU detected`.**
Nothing answered. Verify `nvidia-smi` is on `PATH`
(`nvidia-smi --query-gpu=name --format=csv,noheader`); if it lives elsewhere, set
`nvidiaSmiPath` to the absolute path. On Windows the vendor-neutral fallback
still reports utilization for AMD/Intel adapters, but without temperature or a
VRAM total — that data is simply not published by the platform.

**CPU temperature shows `—`.**
On Windows the ACPI thermal-zone counter is absent on some virtual machines and
some older firmware. On Linux no CPU `hwmon` chip was found. On macOS there is
no non-root source at all. Check the `errors` array in the snapshot for the
specific reason.

**The temperature looks wrong by a fixed factor.**
Set `cpuTemperatureScale` — see the unit discussion above.

**The tile responds slowly, or a machine feels busier.**
Raise `cpuTemperatureMs` (the `typeperf` probe is the most expensive reading) or
set `cpuTemperature: false`. CPU and memory cost nothing measurable.

## Development

```sh
npm install --ignore-scripts   # --ignore-scripts avoids esbuild's postinstall probe
npm run build                  # bundles src/client/** into lib/client.js
npm test                       # node --test test/
npm run verify                 # build, then test
npm run test:inline            # the same suites in one process
npm run dev                    # host half on :43199 + a page that boots the real tile
```

`npm test` needs the test runner to spawn a child process per file. Sandboxes and
restricted environments can refuse that; `npm run test:inline` imports the same
suites into a single process instead.

`npm run dev` mounts the real host half on `http://127.0.0.1:43199/` and serves a
page that boots the real `lib/client.js` with the same `__ModuleLoader__`
contract the shell uses — so the tile can be exercised against actual hardware
without installing into a DSH profile and restarting the app. It is a development
tool and is not part of the published package.

The host half (`lib/index.js` and `lib/metrics/**`) is plain ESM and needs no
build. Only the browser half is bundled, because the DSH client module system
wants a single classic script that calls
`window.__ModuleLoader__.load({ id, factory })`; the build wraps esbuild's `cjs`
output in exactly that factory and keeps `react` / `react-dom/client` external to
the shell's module table.

### Layout

| Path | What it is |
| --- | --- |
| `lib/index.js` | Host half — the cordis plugin entry |
| `lib/routes.js`, `lib/http.js`, `lib/trust.js` | Routes, JSON writer, loopback fence |
| `lib/metrics/` | Collectors: `parse`, `exec`, `cpu`, `memory`, `cputemp`, `gpu`, `monitor` |
| `src/client/` | Browser half sources: `model` (pure logic), `tile`, `settings`, `styles`, `locales` |
| `lib/client.js` | **Built** browser half (committed so a `link:` install needs no build) |
| `test/` | `node:test` suites, including a jsdom run of the built bundle |
| `tools/` | Development only: `dev-server.mjs`, `run-tests.mjs` |

### Testing notes

`test/client-bundle.test.mjs` loads the **built** `lib/client.js` in jsdom
through the real `__ModuleLoader__` contract, with a `require` shim that only
answers the modules the shell actually provides — so a bad external (or a stale
bundle) fails the suite rather than the app. `test/fixtures/` holds real
`typeperf` and `nvidia-smi` output captured from a hybrid-GPU Windows laptop, so
the parsers are tested against what the tools actually print, not idealized input.

Run `npm run build` before `npm test` after touching anything under `src/client/`.

## License

MIT — see [LICENSE](LICENSE).

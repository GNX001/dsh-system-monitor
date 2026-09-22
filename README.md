# dsh-system-monitor

**作者：DeepSeek + DeepSeek-Harness**

中文 | [English](README.en.md)

给 **DeepSeek Harness** Web 界面用的悬浮状态条：CPU、内存、每一块 GPU 与网速，
全部排成一行纯文字。

```
  ⣿ CPU 9.6% 78.9°C 丨 MEM 43% 13.4/31.2 GB 丨 GPU 0% 51°C 0/11.9 GB 丨 网速 ↓ 1.3 MB/s ↑ 240 KB/s  ⟳ ✕
```

*（这是排版示意图，不是截图。实际配色来自你自己的 DSH 主题，详见
[主题与层叠](#主题与层叠)。）*

## 功能

- **一行纯文字** —— 一条横向状态条：拖动把手，然后是各项指标（用 `丨` 分隔），最后是
  刷新与隐藏按钮。没有进度条、仪表盘或迷你图；它是读数，不是图表。窗口太窄时会折到
  第二行，而不是把某一项裁掉。
- **CPU** —— 占用率与温度。完整的型号名与线程数放在该项的 tooltip 里，所以这一行很短
  但信息没丢。
- **内存** —— 已用/总量共用同一单位，采用与 Windows 任务管理器、macOS 活动监视器
  一致的「可用内存」口径。
- **每一块 GPU** —— 每块适配器一项，显示占用率、温度、显存，可选功耗。双显卡笔记本会
  同时显示独显与核显。
- **网速 / NET** —— 下行与上行速率，取自操作系统自身的网络计数器；回环与虚拟适配器
  已被排除，所以总量不会被重复计算。
- **跟随你的 DSH 主题** —— 每个颜色都是 DSH 的设计 token，所以内置的明暗切换和
  Catppuccin 这类第三方主题都能对上，切主题的瞬间就会重新上色。
- **悬浮可拖动** —— 在状态条上任意位置（按钮除外）都能拖动；位置与不透明度在刷新后
  保留。
- **对缺失数据诚实** —— 平台未实现的计数器显示 `—`，绝不会伪造一个 `0`。某个厂商工具
  缺失只会让一项指标降级，不会让整条状态条变空白。
- **仅回环、只读** —— 宿主半边只提供两个受本机回环围栏保护的 GET 路由。不写任何
  东西、不对外联网、不提权、不装驱动。
- **中英双语** —— 跟随 DSH 的语言设置。

## 环境要求

| | |
| --- | --- |
| DeepSeek Harness | `>= 0.1.5-rc.1`，`web` 或 `desktop` profile |
| Node | `>= 20`（Harness 自带的版本即可） |
| 运行时依赖 | **无** |

各指标的平台覆盖情况：

| 指标 | Windows | Linux | macOS |
| --- | --- | --- | --- |
| CPU 占用率 | ✅ `os.cpus()` | ✅ | ✅ |
| CPU 温度 | ✅ 经 `typeperf` 读取 ACPI 热区 | ✅ `/sys/class/thermal` + `coretemp`/`k10temp` | ❌ 需 root（`powermetrics`） |
| 内存 | ✅ | ✅ | ✅ |
| GPU 占用/温度/显存/功耗 | ✅ NVIDIA 经 `nvidia-smi`；无 nvidia-smi 时用 Windows GPU 性能计数器（仅占用率） | ✅ NVIDIA 经 `nvidia-smi`；AMD 经 `amdgpu` sysfs | ❌ |
| 网速 | ✅ 经 `typeperf` 读取 PDH 网络计数器 | ✅ `/proc/net/dev` | ❌ |

逐项说明：**CPU 占用率与内存在任何能跑 Node 的地方都可用。** GPU 与 CPU 温度需要
操作系统确实公开了数据源；如果平台没有，就只空出那一项，其余照常工作。

## 安装

### 直接从本仓库安装（推荐）

```sh
dsh plugin --profile web add github:GNX001/dsh-system-monitor
```

无需构建：浏览器半边的产物 `lib/client.js` 已随仓库提交，所以从 git 安装即可。目前
还没有 npm 发布。

### 从本地克隆安装

```sh
git clone https://github.com/GNX001/dsh-system-monitor.git
cd dsh-system-monitor
dsh plugin --profile web add link:$(pwd)
```

### 从 npm 安装（发布之后）

```sh
dsh plugin --profile web add dsh-system-monitor
```

安装后重启 `dsh web`（或 DSH Desktop）。磁贴会出现在右上角，并在
**设置 → 系统监视磁贴** 中出现对应的配置分区。

> **DSH Desktop 说明。** 桌面版自己拉起 Harness 服务，所以插件安装要等下次重启
> DSH Desktop 才生效。如果你的 `PATH` 里没有 `dsh`，用桌面版自带的那份也能跑，例如
> `node "$env:APPDATA\dsh-desktop\harness\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add github:GNX001/dsh-system-monitor`。

## 使用

| 操作 | 方式 |
| --- | --- |
| 移动状态条 | 在状态条上任意位置拖动（按钮除外） |
| 立即刷新 | 点 `⟳` 按钮（强制重新探测硬件） |
| 隐藏状态条 | 点 `✕` 按钮；之后在 **设置 → 系统监视磁贴** 里重新打开 |
| 修改配置 | **设置 → 系统监视磁贴** |

所有可配置项都在 DSH 自己的设置里，磁贴上不弹浮层：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 显示悬浮状态条 | 开 | 隐藏之后的恢复入口 |
| 刷新间隔 | 1.5 秒 | 1–10 秒 |
| 不透明度 | 94% | 40%–100% |
| CPU / CPU 温度 / 内存 / GPU | 开 | 各项显隐 |
| GPU 温度 / 显存 / 功耗 | 温度与显存开，功耗关 | |
| 网速（上行与下行） | 开 | 两个方向总是一起显示 |
| 紧凑模式 | 关 | 内边距与字号更紧 |
| 重置位置 / 恢复默认设置 | — | |

## 主题与层叠

**配色。** 磁贴没有自己的调色板。每个颜色都是 DSH 的设计 token
（`--dsw-alias-bg-layer-2`、`--dsw-alias-label-primary`、`--dsw-alias-state-warn-primary`
等），由主题插件声明在 `body`（浅色）与 `body[data-ds-dark-theme]`（深色）上。磁贴是
`body` 的子节点，因此直接继承这些声明，切主题时由浏览器重新解析——没有监听器、也不
需要重渲染；Catppuccin、neu-theme 这类第三方主题之所以也能对上，是因为它们改写的
就是同一批 token。每个引用都带字面量兜底，所以在 token 缺失的环境里依然能正常显示。

**层叠。** 磁贴固定为 `z-index: 900`，必须夹在两层之间：会话内容（代码块与工具卡用
`z-index: 1`–`12`，而它们的祖先都没有创建层叠上下文，所以会盖住 `z-index: auto` 的
固定定位元素）以及 DSH 自己的菜单与弹窗（`1000` 以上）。于是磁贴能盖住代码块，而
打开菜单时菜单仍会盖住磁贴。

## 配置

磁贴自身的选项存在浏览器里。**宿主半边**在 profile 的 `cordis.patch.yml` 中配置，
就在本插件插入的那一行下面：

```yaml
- insert:
    - id: system-monitor
      name: dsh-system-monitor
      config:
        # 全部可选，下列为默认值。
        tickMs: 1000                  # CPU/内存采样间隔（进程内计算，开销极低）
        gpuMs: 1500                   # GPU 探测间隔（会启动 nvidia-smi）
        cpuTemperatureMs: 5000        # CPU 温度探测间隔（会启动 typeperf）
        networkMs: 3000               # 网速探测间隔（会启动 typeperf）
        cpuTemperatureScale: auto     # auto | kelvin | decikelvin | decicelsius
        gpu: true                     # false = 完全不探测 GPU
        cpuTemperature: true          # false = 完全不探测 CPU 温度
        network: true                 # false = 完全不探测网速
        networkExclude: []            # 要忽略的适配器名片段（见下）
        networkInclude: []            # 即使被排除也强制计入的片段
        allowRefresh: true            # false = 拒绝 ?refresh=1
        nvidiaSmiPath: nvidia-smi     # 可填命令名或绝对路径
        enabled: true                 # false = 什么都不挂载
```

`networkExclude` 默认是一组回环、VPN/覆盖网络与虚拟适配器的名片段（`loopback`、
`pseudo`、`virtual`、`isatap`、`teredo`、`vmware`、`wsl`、`wireguard`、
`tailscale`、`docker` 等），外加 Windows 上重名的 `_2` 副本实例。这一点很关键：回环或
VPN 适配器承载的是与物理网卡**同一批**数据包，两边都算就会翻倍——而光是一个本地开发
服务器就能造出几个 GB 的回环流量。快照里会列出每个适配器及其 `counted` 标记，所以你
可以在覆盖之前先看清到底算了哪些。

`cpuTemperatureScale` 之所以存在，是因为不同 provider 上报 ACPI 热区时的单位并不
一致；`auto` 会按数值量级判断单位，量级不符时可用它手动覆盖。详见
[各项数值是怎么来的](#各项数值是怎么来的)。

## HTTP 接口

两个路由都是 `GET`、仅回环、且带 `Cache-Control: no-store`。

| 路由 | 用途 |
| --- | --- |
| `/api/dsh-system-monitor/snapshot` | 当前读数（读缓存快照，请求路径内不做 IO） |
| `/api/dsh-system-monitor/snapshot?refresh=1` | 先强制重新探测硬件再返回 |
| `/api/dsh-system-monitor/health` | 插件身份、版本、采样节奏——不碰硬件 |

`snapshot` 返回：

```jsonc
{
  "ok": true,
  "version": "0.1.0",
  "ts": 1780000000000,
  "host": { "hostname": "dev-box", "platform": "win32", "arch": "x64", "uptimeSec": 3600, "pid": 42 },
  "cpu": {
    "usage": 23.4,                 // 百分比；在拿到第二次采样前为 null
    "perCore": [10, 90, 50, 0],
    "cores": 4,
    "model": "AMD Ryzen 7 8845HS w/ Radeon 780M Graphics",
    "speedMHz": 3800,
    "temperature": 81.9,           // 摄氏度；不可用时为 null
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
  "errors": []                     // 逐项诊断，最多 6 条
}
```

任何数值在读数不可用时都是 `null` 而不是 `0`。

## 隐私与安全

- **仅回环。** 每个请求都必须来自直连的 `127.0.0.1` / `::1` 对端；否则在读取任何
  指标之前就返回 `403`。带 `X-Forwarded-For` / `Forwarded` 头的请求同样被拒绝，
  所以反向代理后面的局域网客户端无法伪装成本机来访问。
- **只读。** 没有任何写路由。这个插件暴露的接口无法改动文件、设置或进程——因此也
  不存在需要防御的 CSRF 面。
- **不对外联网。** 插件不发起任何外发请求，也不上报任何遥测；不联系厂商 API，也不
  访问互联网。
- **不提权。** 不以管理员/root 运行，不安装驱动，不注册系统服务。
- **数据不出本机。** 读数只发给你正在看的那个浏览器，不写入磁盘。

快照确实会暴露主机资产信息（CPU/GPU 型号名、内存压力）给任何能访问到回环端口的
东西——这对一个系统监视器来说是无法避免的，而围栏保证它只留在本机。

## 各项数值是怎么来的

本插件不安装驱动，也不读任何未公开的内存。每个读数都来自下面三类来源之一，并且都
带 `source` 字段标明出处。

**CPU 占用率** —— `os.cpus()` 的逐核心累计 jiffies，按 tick 差分。启动后的第一次采样
没有基线，所以在第二次采样前 `usage` 为 `null`。

**内存** —— `os.totalmem()` / `os.freemem()`。在 Windows 上这对应
`GlobalMemoryStatusEx.ullAvailPhys`（即「可用」值），所以百分比与任务管理器一致，
而不是一个原始的空闲页计数。

**CPU 温度（Windows）** —— PDH 计数器集
`\Thermal Zone Information(*)\Temperature`，用系统自带的 `typeperf` 读取。Windows
不会把 CPU 核心温度暴露给非提权进程（`MSAcpi_ThermalZoneTemperature` 和厂商 WMI
命名空间在没有驱动的情况下要么被拒绝、要么根本不存在），所以能拿到的就是 ACPI 热区。

> **关于单位。** PDH 计数器在文档里普遍被写作「开尔文」，但 ACPI 底层的 `_TMP` 是
> 分度开尔文（deci-Kelvin）——而分度开尔文对真实机器上报的数值来说是不可能的
> （355 分度开尔文 = 35.5 K）。在一台 Windows 11 AMD 笔记本上实测：该计数器空闲时约
> 为 355，4 线程持续满载后稳定在约 367。按开尔文读，就是 82 °C → 94 °C，正是一颗
> 笔记本 CPU 恰好卡在 95 °C 温控阈值下方；按分度摄氏度读，同一段曲线就变成满载下只
> 上升 1.2 °C，而任何物理封装都不会这样。因此本插件按开尔文读取，并提供
> `cpuTemperatureScale` 让你在遇到行为不同的数据源时手动覆盖。

**CPU 温度（Linux）** —— `/sys/class/thermal/thermal_zone*/temp`，以及驱动名属于 CPU
传感器的 `hwmon` 芯片（`coretemp`、`k10temp`、`zenpower`、`cpu_thermal`、`acpitz`）。
最热的那个区作为主数值，全部热区列在 `temperatureZones` 中。

**GPU（NVIDIA，Windows 与 Linux）** —— `nvidia-smi
--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,name
--format=csv,noheader,nounits`，参数向量固定。`name` 是**故意放在最后**的：GPU 型号名
里带逗号，末尾的自由文本列可以安全地重新拼接，夹在中间则不行。

**GPU（Windows，无 `nvidia-smi` 时）** —— 厂商中立的 PDH 计数器
`\GPU Engine(*)\Utilization Percentage` 与 `\GPU Adapter Memory(*)\Dedicated
Usage`，按适配器分组。占用率取适配器各 engine 实例的**最大值**而非求和：这些计数器
是逐 engine 的百分比，把同一帧的渲染与拷贝相加会超过 100%。该计数器集不含温度，也
不含显存容量，所以这两项保持 `null`。

**GPU（Linux，AMD）** —— `amdgpu` sysfs：`gpu_busy_percent`、
`mem_info_vram_used` / `mem_info_vram_total`，以及 `hwmon` 温度节点，无需启动进程。

**网速（Windows）** —— PDH 计数器 `\Network Interface(*)\Bytes Received/sec` 与
`\Bytes Sent/sec`，与热区用同一套 `typeperf` 调用方式。这些计数器本身就是**速率**，所以
不需要差分；列序是「按计数器分组」的（先所有 `Received` 实例，再所有 `Sent` 实例），
因此方向是从每个表头路径读出来的，而不是按列位置猜的。只有通过排除过滤的适配器会被
计入。

**网速（Linux）** —— `/proc/net/dev`，里面是**累计**字节数。这是唯一一项需要差分而不是
直接使用的读数，所以启动后的第一次采样没有可比区间，显示 `—`，与 CPU 占用率一致。

**网速不做温度式的告警** —— 它没有有意义的阈值，所以数值永远不会变黄或变红。

**所有温度路径都把 0 视为「没有读数」**：ACPI 对不存在的传感器上报 `0`，内核驱动对
未接的传感器也发布 `0`。把它当成真实的 0 °C 上报，比什么都不报更糟。

## 疑难排查

**状态条一直不出现。**
浏览器半边需要宿主半边。用同一个浏览器打开 `GET /api/dsh-system-monitor/health`：返回
JSON 说明宿主半边已就位、问题在客户端（刷新页面）；返回 404 说明插件没加载——确认
profile 的 `cordis.patch.yml` 里有那一行，然后重启 `dsh web`。

**GPU 显示「未检测到 GPU」。**
没有任何数据源应答。确认 `nvidia-smi` 在 `PATH` 上
（`nvidia-smi --query-gpu=name --format=csv,noheader`）；如果它在别处，把
`nvidiaSmiPath` 设为绝对路径。在 Windows 上厂商中立的兜底路径仍能给出 AMD/Intel
适配器的占用率，但没有温度和显存总量——那些数据平台根本没公开。

**CPU 温度显示 `—`。**
Windows 上某些虚拟机和较老的固件没有 ACPI 热区计数器；Linux 上没找到 CPU `hwmon`
芯片；macOS 上则完全没有非 root 的数据源。具体原因看快照里的 `errors` 数组。

**温度数值差了一个固定倍数。**
设置 `cpuTemperatureScale`——见上面的单位讨论。

**网速显示 `—` 或一直是 0 B/s。**
`0 B/s` 表示计数器读到了、机器确实空闲，这是正确结果。`—` 表示量不到：macOS 没有非 root
的数据源（不支持），或者 Linux 上第一次采样还没有区间——下一次轮询就会补上。想看看到底
算了哪些适配器，读快照里的 `network.interfaces`，每项都带 `counted` 标记。如果你的流量
走的是被默认过滤规则排除的适配器（VPN，或虚拟交换机），把对应片段加到 `networkInclude`。

**状态条响应变慢，或感觉机器更忙了。**
`gpuMs`、`cpuTemperatureMs`、`networkMs` 各自控制一个短命辅助进程。调大间隔，或把
`gpu: false` / `cpuTemperature: false` / `network: false` 关掉对应探测。CPU、内存与 CPU
速率计数器则几乎没有可测量的开销。

## 开发

```sh
npm install --ignore-scripts   # --ignore-scripts 跳过 esbuild 的 postinstall 探测
npm run build                  # 把 src/client/** 打包成 lib/client.js
npm test                       # node --test test/
npm run verify                 # 先构建，再测试
npm run test:inline            # 同样的套件，全部跑在单个进程里
npm run dev                    # 在 :43199 挂上宿主半边，并提供一个能跑真磁贴的页面
```

`npm test` 需要测试运行器为每个文件派生一个子进程。沙箱和受限环境可能拒绝这种派生；
`npm run test:inline` 则把同一批套件导入单个进程来跑。

`npm run dev` 会把真实的宿主半边挂在 `http://127.0.0.1:43199/`，并提供一个用同样
`__ModuleLoader__` 契约加载真实 `lib/client.js` 的页面——这样无需装进 DSH profile、也
无需重启应用，就能对着真实硬件试磁贴。该页面会内联外壳**自己**的 `:root` / `body` /
`body[data-ds-dark-theme]` 规则块（从 `@deepseek-ai/dsh-client-ui-theme` 抽取，可用
`DSM_THEME_CLIENT` 覆盖），并提供一个主题切换按钮，所以「跟随主题」这件事是可以当场
验证的，而不必只凭信任。它还会在启动时把磁贴各行以文字打印出来，这是不用浏览器就能
最快看清排版的方式。它是开发工具，不属于发布包。

宿主半边（`lib/index.js` 与 `lib/metrics/**`）是纯 ESM，无需构建。只有浏览器半边需要
打包，因为 DSH 的客户端模块系统要求一个调用
`window.__ModuleLoader__.load({ id, factory })` 的经典脚本；构建脚本把 esbuild 的 `cjs`
产物正好包进这个 factory，并把 `react` / `react-dom/client` 保持为外壳模块表里的外部
依赖。

### 目录结构

| 路径 | 说明 |
| --- | --- |
| `lib/index.js` | 宿主半边 —— cordis 插件入口 |
| `lib/routes.js`、`lib/http.js`、`lib/trust.js` | 路由、JSON 输出、回环围栏 |
| `lib/metrics/` | 采集器：`parse`、`exec`、`cpu`、`memory`、`cputemp`、`gpu`、`monitor` |
| `src/client/` | 浏览器半边源码：`model`（纯逻辑）、`tile`、`settings`、`styles`、`locales` |
| `lib/client.js` | **构建产物**（浏览器半边；一并提交，`link:` 安装就无需构建） |
| `test/` | `node:test` 套件，含一个在 jsdom 里跑构建产物的测试 |
| `tools/` | 仅开发用：`dev-server.mjs`、`run-tests.mjs` |

### 测试说明

`test/client-bundle.test.mjs` 会在 jsdom 中按真实的 `__ModuleLoader__` 契约加载
**构建产物** `lib/client.js`，且 `require` 桩只应答外壳确实提供的模块——因此错误的外部
依赖（或过期的构建产物）会在测试里失败，而不是在你的应用里失败。`test/fixtures/` 保存
了从一台双显卡 Windows 笔记本上实测抓取的 `typeperf` 与 `nvidia-smi` 输出，所以解析器
是对着工具真正打印的内容测试的，而不是理想化输入。

改动 `src/client/` 下任何内容后，跑 `npm test` 之前先跑 `npm run build`。

## 许可证

**The Unlicense** —— 完全自由开源，无任何使用条件。

本仓库放弃全部著作权，将软件释入公有领域：任何人都可以出于任何目的、以任何方式自由复制、
修改、发布、使用、编译、出售或分发本软件（源码或二进制形式均可，商业或非商业均可），
**无需署名、无需保留任何声明、无需遵守任何条款**。

全文见 [LICENSE](LICENSE)，或 <https://unlicense.org>。和任何公有领域释出一样，软件按
「原样」提供，不附带任何担保。

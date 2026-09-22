# dsh-system-monitor

[English](README.md) | 中文

给 **DeepSeek Harness** Web 界面用的悬浮系统监视磁贴：把本机 CPU、内存和每一块
GPU 的占用率、温度、显存与功耗收进一块可拖动的玻璃质感小磁贴，安静地待在角落里。

```
┌──────────────────────────────────────┐
│ ⣿  系统监视              ⟳   ⌄   ✕  │   ← 按住标题栏可拖动
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
│ ● dev-box            更新于 04:31    │
└──────────────────────────────────────┘
```

*（这是排版示意图，不是截图——磁贴颜色跟随你自己的 DSH 主题，所以实际观感取决于
你的外观设置。）*

## 功能

- **CPU** —— 总体与逐核心占用率，以及平台能提供时的 CPU 温度。
- **内存** —— 已用 / 总量与占用条，采用与 Windows 任务管理器、macOS 活动监视器
  一致的「可用内存」口径。
- **每一块 GPU** —— 每块适配器一行，显示占用率、温度、显存已用/总量，可选功耗。
  双显卡笔记本会同时显示独显与核显。
- **悬浮可拖动** —— 想放哪放哪；位置、尺寸、不透明度与显示项都会在刷新后保留。
- **对缺失数据诚实** —— 平台未实现的计数器显示 `—`，绝不会伪造一个 `0`。磁贴本身
  很抗造：某个厂商工具缺失只会让一项指标降级，不会让整个组件变空白。
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
| 移动磁贴 | 拖动标题栏 |
| 折叠 / 展开 | 点 `⌄` 按钮，或双击标题栏 |
| 立即刷新 | 点 `⟳` 按钮（强制重新探测硬件） |
| 隐藏磁贴 | 点 `✕` 按钮；之后在 **设置 → 系统监视磁贴** 里重新打开 |
| 修改配置 | **设置 → 系统监视磁贴** |

所有可配置项都在 DSH 自己的设置里，磁贴上不弹浮层：

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| 显示悬浮磁贴 | 开 | 隐藏之后的恢复入口 |
| 刷新间隔 | 1.5 秒 | 1–10 秒 |
| 不透明度 | 94% | 40%–100% |
| CPU / CPU 温度 / 内存 / GPU | 开 | 分区显隐 |
| GPU 温度 / 显存 / 功耗 | 温度与显存开，功耗关 | |
| 每核心占用 | 关 | 追加一条逐核心占用条 |
| 紧凑模式 | 关 | 行距更紧 |
| 重置位置 / 恢复默认设置 | — | |

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
        cpuTemperatureScale: auto     # auto | kelvin | decikelvin | decicelsius
        gpu: true                     # false = 完全不探测 GPU
        cpuTemperature: true          # false = 完全不探测 CPU 温度
        allowRefresh: true            # false = 拒绝 ?refresh=1
        nvidiaSmiPath: nvidia-smi     # 可填命令名或绝对路径
        enabled: true                 # false = 什么都不挂载
```

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

**所有温度路径都把 0 视为「没有读数」**：ACPI 对不存在的传感器上报 `0`，内核驱动对
未接的传感器也发布 `0`。把它当成真实的 0 °C 上报，比什么都不报更糟。

## 疑难排查

**磁贴一直不出现。**
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

**磁贴响应变慢，或感觉机器更忙了。**
调大 `cpuTemperatureMs`（`typeperf` 是最贵的一项），或设置 `cpuTemperature: false`。
CPU 与内存的开销低到测不出来。

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
无需重启应用，就能对着真实硬件试磁贴。它是开发工具，不属于发布包。

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

MIT —— 见 [LICENSE](LICENSE)。

/**
 * Bilingual copy. Registered with the DSH locale service under
 * {@link LOCALE_NS}; the tile and the settings panel read strings through the
 * bound `t`. Keys are flat and identical across both dictionaries —
 * `test/locales.test.mjs` asserts the two stay in sync.
 */

export const zh = {
  title: '系统监视',
  settingsTitle: '系统监视磁贴',
  settingsHint:
    '悬浮磁贴显示本机 CPU、内存与所有 GPU 的占用率；温度来自 Windows ACPI 热区计数器或 Linux 内核传感器，显存与功耗来自厂商工具（如 nvidia-smi）。所有数据仅在本机回环地址上读取。',
  enable: '显示悬浮磁贴',
  enableHint: '关闭后磁贴会隐藏，可随时在此重新打开。',
  interval: '刷新间隔',
  intervalSecond: '{n} 秒',
  opacity: '不透明度',
  sections: '显示内容',
  showCpu: 'CPU',
  showCpuTemperature: 'CPU 温度',
  showMemory: '内存',
  showGpu: 'GPU',
  showGpuTemperature: 'GPU 温度',
  showGpuMemory: '显存',
  showPower: 'GPU 功耗',
  appearance: '外观',
  compact: '紧凑模式',
  resetPosition: '重置位置',
  resetAll: '恢复默认设置',
  refresh: '立即刷新',
  collapse: '折叠',
  expand: '展开',
  hide: '隐藏磁贴',
  show: '显示监视磁贴',
  openSettings: '打开设置',
  loading: '读取中…',
  offline: '无法连接宿主，重试中',
  noGpu: '未检测到 GPU',
  updatedAt: '更新于 {time}',
  never: '尚未更新',
  hostUnavailable: '宿主插件未响应',
  pluginsDisabled: '不支持此界面',
}

export const en = {
  title: 'System monitor',
  settingsTitle: 'System monitor tile',
  settingsHint:
    'The floating tile shows live CPU, memory and every GPU on this machine. Temperatures come from Windows ACPI thermal-zone counters or Linux kernel sensors; VRAM and power come from vendor tools such as nvidia-smi. Every reading is served over loopback only.',
  enable: 'Show the floating tile',
  enableHint: 'Turning this off hides the tile; reopen it here at any time.',
  interval: 'Refresh interval',
  intervalSecond: '{n}s',
  opacity: 'Opacity',
  sections: 'Sections',
  showCpu: 'CPU',
  showCpuTemperature: 'CPU temperature',
  showMemory: 'Memory',
  showGpu: 'GPU',
  showGpuTemperature: 'GPU temperature',
  showGpuMemory: 'VRAM',
  showPower: 'GPU power draw',
  appearance: 'Appearance',
  compact: 'Compact mode',
  resetPosition: 'Reset position',
  resetAll: 'Restore defaults',
  refresh: 'Refresh now',
  collapse: 'Collapse',
  expand: 'Expand',
  hide: 'Hide the tile',
  show: 'Show the system monitor',
  openSettings: 'Open settings',
  loading: 'Reading…',
  offline: 'Host unreachable, retrying',
  noGpu: 'No GPU detected',
  updatedAt: 'Updated {time}',
  never: 'Not updated yet',
  hostUnavailable: 'Host plugin not answering',
  pluginsDisabled: 'Not supported in this interface',
}

/** Substitution-based formatter used when the DSH locale service is absent. */
export function format(template, params) {
  if (params === undefined) return template
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  )
}

/** Build a standalone `t` for one dictionary. */
export function bindDictionary(dictionary) {
  return (key, params) => {
    const template = dictionary[key]
    if (typeof template !== 'string') return key
    return format(template, params)
  }
}

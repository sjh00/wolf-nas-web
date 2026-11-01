/**
 * 旧品牌 localStorage 键迁移。
 *
 * 历史版本的键以 `nexus-` / `nexus.` 开头，品牌更名为 WolfNas 后新键统一用
 * `wolfnas-` / `wolfnas.`。为避免升级后用户配置（服务端地址、通知设置、视图偏好）
 * 丢失，读取时回退到旧键，并在命中后写回新键。
 *
 * 纯缓存类键（搜索结果、滚动游标、指纹摘要）不做迁移——丢失后可自然重建。
 */

const LEGACY_PREFIXES = ['nexus-', 'nexus.'] as const;

/** 旧键名映射：新键 -> 旧键（仅用于需要保留用户数据的键） */
const LEGACY_KEY_MAP: Record<string, string> = {
  'wolfnas-backend-url': 'nexus-backend-url',
  'wolfnas-notify-settings': 'nexus-notify-settings',
  'wolfnas-agent-notified-ids': 'nexus-agent-notified-ids',
  'wolfnas.discovery.preference': 'nexus.discovery.preference',
  'wolfnas.unknown.view': 'nexus.unknown.view',
};

function legacyKeyOf(key: string): null | string {
  const mapped = LEGACY_KEY_MAP[key];
  if (mapped) return mapped;
  // 未显式登记的键：按前缀推导（wolfnas-xxx -> nexus-xxx）
  for (const prefix of LEGACY_PREFIXES) {
    const newPrefix = prefix === 'nexus-' ? 'wolfnas-' : 'wolfnas.';
    if (key.startsWith(newPrefix)) {
      return `${prefix}${key.slice(newPrefix.length)}`;
    }
  }
  return null;
}

/** 读取值；新键不存在时回退旧键，并把值迁移到新键。 */
export function getMigratedItem(key: string): null | string {
  if (typeof localStorage === 'undefined') return null;
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = legacyKeyOf(key);
  if (!legacy) return null;
  const old = localStorage.getItem(legacy);
  if (old === null) return null;
  try {
    localStorage.setItem(key, old);
    localStorage.removeItem(legacy);
  } catch {
    // 隐私模式/配额不足时忽略迁移失败，仍返回旧值
  }
  return old;
}

/** 移除键（新旧键一并清除）。 */
export function removeMigratedItem(key: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key);
  const legacy = legacyKeyOf(key);
  if (legacy) localStorage.removeItem(legacy);
}

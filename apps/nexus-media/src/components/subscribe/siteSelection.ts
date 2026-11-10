/**
 * 订阅站点（订阅站点 / 搜索站点）的提交规则。
 *
 * 站点的「没勾选」有两种完全不同的含义，必须区分开：
 * - 用户没动过 → 不提交该字段，由后端沿用默认设置或已存值
 * - 用户主动取消全选 → 提交空数组，按「一个站点都不用」保存
 *
 * 如果两种情况都提交空数组，取消全选会被回退成「全部站点」，等于把用户的选择
 * 反过来执行；如果都不提交，用户又无法真的清空。
 */

export type SitePayload = Record<string, string[]>;

/**
 * 生成站点字段的提交片段。
 *
 * @param key 字段名（rss_sites / search_sites）
 * @param touched 用户是否改动过该组站点
 * @param values 当前勾选的站点
 * @returns 改动过时返回 `{ [key]: values }`（可为空数组），未改动时返回空对象
 */
export function sitesPayload(
  key: string,
  touched: boolean,
  values: string[],
): SitePayload {
  if (!touched) return {};
  return { [key]: [...values] };
}

/** 默认设置里保存站点时用：未改动回传读到的原值（null 表示从未设置过） */
export function sitesPayloadWithFallback(
  key: string,
  touched: boolean,
  values: string[],
  loaded: null | string[],
): Record<string, null | string[]> {
  return { [key]: touched ? [...values] : loaded };
}

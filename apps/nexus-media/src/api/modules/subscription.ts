/**
 * 媒体订阅 API
 * 对应后端: /api/subscription/*, /api/rss-automation/*
 */
import { useUserStore } from '@vben/stores';

import { requestClient } from '#/api/request';

function toRssId(
  value: null | number | string | undefined,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return typeof value === 'number' ? value : Number(value);
}

export namespace SubscriptionApi {
  export interface Subscription {
    id: number;
    name: string;
    type: 'anime' | 'movie' | 'tv';
    status: number;
    last_update?: string;
    rss_url?: string;
    keywords?: string;
    exclude?: string;
    image?: string;
    year?: string;
    tmdbid?: string;
    identity_id?: string;
    anchor_provider?: string;
    anchor_external_id?: string;
    provider?: string;
    metadata_ref?: string;
    mediaid?: string;
    keyword?: string;
    overview?: string;
    poster?: string;
    content_profile?: string;
    metadata_policy?: string;
    naming_profile?: string;
    source_label?: string;
    state?: string;
    season?: string;
    total?: number;
    lack?: number;
    over_edition?: boolean | number | string;
    user_id?: null | number;
    username?: null | string;
    vote?: number | string;
    filter_restype?: string;
    filter_pix?: string;
    filter_team?: string;
    filter_rule?: number | string;
    filter_include?: string;
    filter_exclude?: string;
    filter_free?: boolean;
    download_setting?: number | string;
    rss_sites?: string[];
    search_sites?: string[];
  }

  export interface SubscriptionHistory {
    id: number | string;
    title: string;
    type: 'anime' | 'movie' | 'tv';
    date: string;
    status: string;
    IMAGE?: string;
    NAME?: string;
    YEAR?: string;
    SEASON?: string;
    TMDBID?: string;
    TOTAL?: number;
    START?: number;
    DESC?: string;
    FINISH_TIME?: string;
    ID?: number | string;
  }

  export interface RssAutomationItem {
    id: number;
    name: string;
    address: string;
    parser?: string;
    status: number;
  }
}

/** 下载订阅日历 ICS 文件 */
export async function downloadSubscriptionCalendarIcsApi() {
  return requestClient.post<{ data: string }>(
    '/subscription/calendar/ical/download',
  );
}

/** 获取订阅日历事件（含非 TMDB 来源分集播出日期） */
export async function getSubscriptionCalendarEventsApi() {
  return requestClient.post<any[]>('/subscription/calendar/ical', {});
}

/** 获取订阅日历 Webcal URL */
export async function getSubscriptionCalendarWebcalUrlApi() {
  return requestClient.get<{ data: { token: string } }>(
    '/subscription/calendar/webcal_url',
  );
}

/** 获取订阅总数（全部内容画像） */
export async function getSubscriptionCountApi() {
  return requestClient.post<{
    movie: number;
    new_today: number;
    profiles?: Record<string, number>;
    total: number;
    tv: number;
  }>('/subscription/count', {});
}

/** 获取电影订阅（superadmin 可传 userId；可按内容画像过滤） */
export async function getMovieSubscriptionApi(
  userId?: number,
  contentProfile?: string,
) {
  return requestClient.post<SubscriptionApi.Subscription[]>(
    '/subscription/movie/list',
    {
      ...(userId ? { user_id: userId } : {}),
      ...(contentProfile ? { content_profile: contentProfile } : {}),
    },
  );
}

/** 获取剧集订阅（superadmin 可传 userId；可按内容画像过滤） */
export async function getTvSubscriptionApi(
  userId?: number,
  contentProfile?: string,
) {
  return requestClient.post<SubscriptionApi.Subscription[]>(
    '/subscription/tv/list',
    {
      ...(userId ? { user_id: userId } : {}),
      ...(contentProfile ? { content_profile: contentProfile } : {}),
    },
  );
}

/** 添加订阅 */
export async function addSubscriptionApi(data: Record<string, any>) {
  return requestClient.post('/subscription/add', data);
}

/** 更新订阅 */
export async function updateSubscriptionApi(data: Record<string, any>) {
  return requestClient.post('/subscription/update', {
    ...data,
    rssid: toRssId(data.rssid),
  });
}

/** 删除订阅（简化版，优先使用 removeSubscriptionApi） */
export async function deleteSubscriptionApi(id: number) {
  return requestClient.post('/subscription/remove', { rssid: toRssId(id) });
}

/** 获取默认订阅设置 */
export async function getDefaultSubscriptionSettingApi(
  mtype: string,
  contentProfile?: string,
) {
  return requestClient.post('/subscription/default_setting', {
    mtype,
    ...(contentProfile ? { content_profile: contentProfile } : {}),
  });
}

/**
 * 默认订阅设置的共享缓存（同一 mtype + 画像只请求一次，并发自动去重）。
 *
 * 订阅列表里每一行都挂着悬浮卡，每张卡都要「缺站点时显示默认站点」。如果每张
 * 卡各发一次请求，一百多行订阅打开一次就是一二百次调用，直接撞上后端按
 * 「IP + 路径」的每分钟 60 次限流，页面会刷出一片「请求过于频繁」。
 */
const defaultSettingCache = new Map<string, Promise<Record<string, any>>>();

/** 缓存键带用户：同一浏览器切换账号时不会串用上一个账号的默认设置 */
function currentUserCacheKey(): string {
  try {
    const info: any = useUserStore().userInfo || {};
    return String(info.user_id ?? info.id ?? info.username ?? 'anon');
  } catch {
    // pinia 尚未就绪（极少见）：退化为不区分用户，不影响本次请求
    return 'anon';
  }
}

/** 取默认订阅设置（带缓存，返回 setting 本体而不是 axios 响应） */
export function getDefaultSubscriptionSettingCached(
  mtype: string,
  contentProfile?: string,
): Promise<Record<string, any>> {
  const key = `${currentUserCacheKey()}::${mtype}::${contentProfile || ''}`;
  const cached = defaultSettingCache.get(key);
  if (cached) return cached;
  const pending = getDefaultSubscriptionSettingApi(mtype, contentProfile)
    .then((res: any) => res?.data || res || {})
    .catch((error) => {
      // 失败不缓存，下次进入还能重试
      defaultSettingCache.delete(key);
      throw error;
    });
  defaultSettingCache.set(key, pending);
  return pending;
}

/** 保存默认订阅设置后清缓存，避免各页面继续展示旧规则 */
export function invalidateDefaultSubscriptionSettingCache() {
  defaultSettingCache.clear();
}

/** 保存默认订阅设置 */
export async function saveDefaultSubscriptionSettingApi(
  mtype: string,
  data: Record<string, any>,
  contentProfile?: string,
) {
  return requestClient.post('/subscription/default_setting/save', {
    mtype,
    ...(contentProfile ? { content_profile: contentProfile } : {}),
    ...data,
  });
}

/** 刷新订阅 */
export async function refreshSubscriptionApi(
  mtype: string,
  rssid?: number | string,
  contentProfile?: string,
) {
  return requestClient.post('/subscription/refresh', {
    type: mtype,
    rssid: toRssId(rssid),
    ...(contentProfile ? { content_profile: contentProfile } : {}),
  });
}

/** 获取订阅详情 */
export async function getSubscriptionDetailApi(
  rssid: number | string,
  rsstype: string,
  contentProfile?: string,
) {
  return requestClient.post('/subscription/detail', {
    rssid: toRssId(rssid),
    rsstype,
    ...(contentProfile ? { content_profile: contentProfile } : {}),
  });
}

/** 获取订阅历史 */
export async function getSubscriptionHistoryApi(
  type?: 'movie' | 'tv',
  contentProfile?: string,
) {
  return requestClient.post<SubscriptionApi.SubscriptionHistory[]>(
    '/subscription/history',
    { type, content_profile: contentProfile },
  );
}

/** 重新订阅历史 */
export async function redoSubscriptionHistoryApi(
  rssid: number | string,
  type: 'movie' | 'tv',
  contentProfile?: string,
) {
  return requestClient.post('/subscription/history/redo', {
    rssid: toRssId(rssid),
    type,
    ...(contentProfile ? { content_profile: contentProfile } : {}),
  });
}

/** 添加订阅（从发现页触发） */
export async function addSubscriptionMediaApi(data: Record<string, any>) {
  return requestClient.post('/subscription/add', data);
}

/** 获取电视剧某剧集已订阅的季号列表 */
export async function getSubscribedSeasonsApi(data: {
  name?: string;
  year?: string;
  anchor_provider?: string;
  anchor_external_id?: string;
}) {
  return requestClient.post<{ seasons: number[] }>(
    '/subscription/tv/seasons',
    data,
  );
}

/** 取消订阅 */
export async function removeSubscriptionApi(data: {
  name: string;
  page?: string;
  rssid?: number | string;
  season?: number | string;
  tmdbid?: number | string;
  anchor_provider?: string;
  anchor_external_id?: string;
  metadata_ref?: string;
  type: string;
  year?: string;
  content_profile?: string;
}) {
  return requestClient.post('/subscription/remove', {
    ...data,
    rssid: toRssId(data.rssid),
    season: data.season == null ? undefined : String(data.season),
    tmdbid: data.tmdbid ? String(data.tmdbid) : undefined,
  });
}

/** 删除订阅历史 */
export async function deleteSubscriptionHistoryApi(rssid: number | string) {
  return requestClient.post('/subscription/history/delete', {
    rssid: toRssId(rssid),
  });
}

/** 清理订阅缓存 */
export async function truncateSubscriptionHistoryApi() {
  return requestClient.post('/subscription/history/clear', {});
}

/** 获取 RSS 自动化任务列表 */
export async function getRssAutomationApi() {
  return requestClient.post<SubscriptionApi.RssAutomationItem[]>(
    '/rss-automation/tasks',
  );
}

/** 添加 RSS 自动化任务 */
export async function addRssAutomationApi(
  data: Partial<SubscriptionApi.RssAutomationItem>,
) {
  return requestClient.post('/rss-automation/tasks/update', data);
}

/** 更新 RSS 自动化任务 */
export async function updateRssAutomationApi(
  data: Partial<SubscriptionApi.RssAutomationItem>,
) {
  return requestClient.post('/rss-automation/tasks/update', data);
}

/** 删除 RSS 自动化任务 */
export async function deleteRssAutomationApi(id: number) {
  return requestClient.post('/rss-automation/tasks/delete', { id });
}

/** 获取电影订阅原始项（用于日历） */
export async function getMovieSubscriptionItemsApi() {
  return requestClient.post<
    Array<{ id: string; name?: string; rssid: string }>
  >('/subscription/movie/items');
}

/** 获取剧集订阅原始项（用于日历） */
export async function getTvSubscriptionItemsApi() {
  return requestClient.post<
    Array<{ id: string; name?: string; rssid: string; season?: string }>
  >('/subscription/tv/items');
}

export interface CustomRssSource {
  id: number;
  ref: string;
  name: string;
  url: string;
  domain: string;
  enabled: boolean;
  proxy: boolean;
  cookie?: null | string;
  headers?: null | string;
  last_fetch_at?: null | string;
  last_success_at?: null | string;
  last_error?: null | string;
  item_count: number;
  health: 'disabled' | 'error' | 'ok';
  created_at?: null | string;
  updated_at?: null | string;
}

export interface CustomRssSourcePayload {
  id?: number;
  name?: string;
  url?: string;
  enabled?: boolean;
  proxy?: boolean;
  cookie?: string;
  headers?: string;
}

export interface CustomRssFeedItem {
  title: string;
  enclosure: string;
  link: string;
  size: number;
  description: string;
  pubdate: number | string;
  category: string;
  guid: string;
}

export interface CustomRssTestResult {
  feed_type: string;
  item_count: number;
  download_count: number;
  missing_download_count: number;
  elapsed_ms: number;
  items: CustomRssFeedItem[];
}

export async function getCustomRssSourcesApi() {
  return requestClient.get<CustomRssSource[]>('/site/rss-sources');
}

export async function createCustomRssSourceApi(data: CustomRssSourcePayload) {
  return requestClient.post<CustomRssSource>('/site/rss-sources', data);
}

export async function updateCustomRssSourceApi(
  id: number,
  data: CustomRssSourcePayload,
) {
  return requestClient.put<CustomRssSource>(`/site/rss-sources/${id}`, data);
}

export async function deleteCustomRssSourceApi(id: number) {
  return requestClient.delete<boolean>(`/site/rss-sources/${id}`);
}

export async function testCustomRssSourceApi(data: CustomRssSourcePayload) {
  return requestClient.post<CustomRssTestResult>(
    '/site/rss-sources/test',
    data,
  );
}

/**
 * 订阅搜索结果的展示与合并规则。
 *
 * 多源元数据搜索（TMDB/豆瓣/番组）会为同一部作品各返回一条，编号放在
 * `ref.external_id`；旧的 TMDB 搜索把编号放在 `tmdb_id`/`id`。两条路径都要
 * 认得出编号，且同一作品只应占一条，否则用户看到的就是「一模一样的两条、
 * 且都没有编号」。
 */

export type SearchResultItem = Record<string, any>;

export const RESULT_PROVIDER_LABELS: Record<string, string> = {
  bangumi: '番组',
  douban: '豆瓣',
  tmdb: 'TMDB',
};

export function resultTitle(media: SearchResultItem): string {
  return media?.title || media?.name || media?.content_id || '未命名';
}

export function resultYear(media: SearchResultItem): string {
  return String(media?.year || '');
}

/** 结果自带的媒体类型（movie/tv/anime），空串表示来源未提供 */
export function resultType(media: SearchResultItem): string {
  const raw = String(media?.media_type || media?.type || '')
    .toLowerCase()
    .trim();
  if (raw === 'movie' || raw === '电影') return 'movie';
  if (raw === 'anime' || raw === '动漫') return 'anime';
  if (raw === 'tv' || raw === '电视剧' || raw === '剧集') return 'tv';
  return '';
}

export function resultTypeLabel(media: SearchResultItem): string {
  const type = resultType(media);
  if (type === 'movie') return '电影';
  if (type === 'anime') return '动漫';
  if (type === 'tv') return '剧集';
  return '';
}

export function resultProvider(media: SearchResultItem): string {
  return String(media?.ref?.provider || media?.provider || '')
    .toLowerCase()
    .trim();
}

/** 结果的 TMDB 号；0 是「没有编号」的占位值，不算有效编号 */
export function resultTmdbId(media: SearchResultItem): string {
  const candidates: any[] = [];
  if (resultProvider(media) === 'tmdb') {
    candidates.push(media?.ref?.external_id);
  }
  candidates.push(media?.tmdb_id, media?.tmdbid, media?.orgid, media?.id);
  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (/^\d+$/.test(text) && text !== '0') return text;
  }
  return String(media?.mergedTmdbId || '');
}

/** 非 TMDB 来源自身的编号（豆瓣/番组等） */
export function resultSourceId(media: SearchResultItem): string {
  const provider = resultProvider(media);
  if (!provider || provider === 'tmdb') return '';
  const text = String(media?.ref?.external_id ?? media?.douban_id ?? '').trim();
  if (!text || text === '0') return '';
  return `${RESULT_PROVIDER_LABELS[provider] || provider.toUpperCase()} ${text}`;
}

/** 核对识别结果用的编号标签：TMDB 优先，其余来源并列 */
export function resultIdChips(media: SearchResultItem): string[] {
  const chips: string[] = [];
  const push = (text: string) => {
    if (text && !chips.includes(text)) chips.push(text);
  };
  const tmdbId = resultTmdbId(media);
  if (tmdbId) push(`TMDB ${tmdbId}`);
  push(resultSourceId(media));
  const merged = (media?.mergedIds || {}) as Record<string, string>;
  for (const [provider, id] of Object.entries(merged)) {
    if (!id || id === '0') continue;
    push(
      provider === 'tmdb'
        ? `TMDB ${id}`
        : `${RESULT_PROVIDER_LABELS[provider] || provider.toUpperCase()} ${id}`,
    );
  }
  return chips;
}

/** 判断两条结果是否同一部作品：与来源无关，只看标题/年份/类型 */
export function resultKey(media: SearchResultItem): string {
  const title = resultTitle(media).trim().toLowerCase();
  if (!title || title === '未命名') return '';
  const type =
    resultType(media) ||
    String(media?.media_type || '')
      .trim()
      .toLowerCase();
  return `${title}|${resultYear(media).trim()}|${type}`;
}

function ownId(media: SearchResultItem): [string, string] | null {
  const provider = resultProvider(media);
  if (provider === 'tmdb') {
    const tmdbId = resultTmdbId(media);
    return tmdbId ? ['tmdb', tmdbId] : null;
  }
  const text = String(media?.ref?.external_id ?? media?.douban_id ?? '').trim();
  if (!text || text === '0') return null;
  return [provider || 'unknown', text];
}

/**
 * 合并同一作品的多来源结果。
 *
 * 显式选择了来源（preferProvider）就保留该来源的条目；否则以 TMDB 为准
 * （识别与订阅都以 TMDB 为准），其余来源的编号并入同一条展示。
 */
export function mergeSearchResults(
  list: SearchResultItem[],
  preferProvider = '',
): SearchResultItem[] {
  const groups = new Map<string, SearchResultItem[]>();
  const order: string[] = [];
  const loose: SearchResultItem[] = [];
  for (const media of list) {
    const key = resultKey(media);
    if (!key) {
      loose.push(media);
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(media);
  }

  const prefer = String(preferProvider || '')
    .toLowerCase()
    .trim();
  const merged: SearchResultItem[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    const preferred =
      (prefer
        ? group.find((item) => resultProvider(item) === prefer)
        : undefined) ||
      group.find((item) => resultProvider(item) === 'tmdb') ||
      group[0];
    const ids: Record<string, string> = {};
    for (const item of group) {
      const own = ownId(item);
      if (own) ids[own[0]] = own[1];
    }
    const picked = { ...preferred };
    if (Object.keys(ids).length > 1) {
      picked.mergedIds = ids;
    }
    if (!resultTmdbId(picked) && ids.tmdb) {
      picked.mergedTmdbId = ids.tmdb;
    }
    merged.push(picked);
  }
  return [...merged, ...loose];
}

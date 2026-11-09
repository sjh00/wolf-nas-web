import { describe, expect, it } from 'vitest';

import {
  mergeSearchResults,
  resultIdChips,
  resultTmdbId,
  resultTypeLabel,
} from '../searchResultMerge';

/** 多源元数据搜索的返回（真实结构，标题为示例名） */
function metadataHit(provider: string, externalId: string) {
  return {
    content_profile: 'default',
    media_kind: 'episodic',
    media_type: 'tv',
    poster: `https://img.example/${provider}.jpg`,
    provider,
    ref: {
      confidence: 1,
      external_id: externalId,
      media_kind: 'episodic',
      media_type: 'tv',
      provider,
      provider_media_type: 'tv',
      scope: 'default',
    },
    score: 1,
    title: '示例剧集',
    year: '2026',
  };
}

/** 旧 TMDB 搜索接口的返回（MediaInfo.to_dict） */
function tmdbSearchHit() {
  return {
    id: 123456,
    tmdb_id: 123456,
    imdb_id: null,
    media_type: 'tv',
    poster: 'https://img.example/tmdb.jpg',
    title: '示例剧集',
    type: 'tv',
    year: '2026',
  };
}

/** 豆瓣来源条目：id/tmdb_id 为 0 占位，编号只在 ref.external_id */
function doubanHit() {
  return {
    id: 0,
    tmdb_id: 0,
    title: '示例剧集',
    year: '2026',
    type: 'tv',
    douban_id: '30000000',
    ref: { provider: 'douban', external_id: '30000000' },
  };
}

describe('mergeSearchResults', () => {
  it('同一作品的多来源结果合并为一条，并保留双方编号', () => {
    const merged = mergeSearchResults([
      metadataHit('tmdb', '123456'),
      metadataHit('douban', '30000000'),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.provider).toBe('tmdb');
    expect(resultIdChips(merged[0]!)).toEqual(['TMDB 123456', '豆瓣 30000000']);
  });

  it('显式选择了来源时保留该来源的条目', () => {
    const merged = mergeSearchResults(
      [metadataHit('tmdb', '123456'), metadataHit('douban', '30000000')],
      'douban',
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.provider).toBe('douban');
    // 展示顺序固定 TMDB 在前，便于核对识别结果
    expect(resultIdChips(merged[0]!)).toEqual(['TMDB 123456', '豆瓣 30000000']);
  });

  it('不同年份或不同类型的同名作品不会被合并掉', () => {
    const merged = mergeSearchResults([
      metadataHit('tmdb', '123456'),
      { ...metadataHit('tmdb', '654321'), year: '2019' },
      { ...metadataHit('tmdb', '777777'), media_type: 'movie' },
    ]);

    expect(merged).toHaveLength(3);
  });

  it('同一来源的重复条目只保留一条', () => {
    const merged = mergeSearchResults([
      metadataHit('tmdb', '123456'),
      metadataHit('tmdb', '123456'),
    ]);

    expect(merged).toHaveLength(1);
  });

  it('没有标题的条目原样保留，不参与合并', () => {
    const merged = mergeSearchResults([
      { title: '', provider: 'tmdb', ref: { external_id: '1' } },
      { title: '', provider: 'douban', ref: { external_id: '2' } },
    ]);

    expect(merged).toHaveLength(2);
  });

  it('单来源结果保持原样（不追加多余字段）', () => {
    const merged = mergeSearchResults([tmdbSearchHit()]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.mergedIds).toBeUndefined();
    expect(resultIdChips(merged[0]!)).toEqual(['TMDB 123456']);
  });
});

describe('resultTmdbId / resultIdChips', () => {
  it('旧的 TMDB 搜索结果照常显示编号', () => {
    expect(resultTmdbId(tmdbSearchHit())).toBe('123456');
  });

  it('多源结果从 ref.external_id 取编号', () => {
    expect(resultTmdbId(metadataHit('tmdb', '123456'))).toBe('123456');
  });

  it('0 不算有效编号', () => {
    expect(resultTmdbId(doubanHit())).toBe('');
    expect(resultIdChips(doubanHit())).toEqual(['豆瓣 30000000']);
  });

  it('类型标签用于区分同名电影与剧集', () => {
    expect(resultTypeLabel(metadataHit('tmdb', '1'))).toBe('剧集');
    expect(
      resultTypeLabel({ ...metadataHit('tmdb', '1'), media_type: 'movie' }),
    ).toBe('电影');
  });
});

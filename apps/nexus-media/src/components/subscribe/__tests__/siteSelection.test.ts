import { describe, expect, it } from 'vitest';

import { sitesPayload, sitesPayloadWithFallback } from '../siteSelection';

describe('sitesPayload', () => {
  it('未改动过站点时不提交该字段（交给后端沿用默认/已存值）', () => {
    expect(sitesPayload('search_sites', false, [])).toEqual({});
    expect(sitesPayload('search_sites', false, ['站点A'])).toEqual({});
  });

  it('取消全选要提交空数组，才能真的清空', () => {
    expect(sitesPayload('search_sites', true, [])).toEqual({
      search_sites: [],
    });
  });

  it('勾选站点时提交当前选择', () => {
    expect(sitesPayload('rss_sites', true, ['站点A', '站点B'])).toEqual({
      rss_sites: ['站点A', '站点B'],
    });
  });

  it('提交的是副本，避免后续表单改动影响已构造的请求体', () => {
    const values = ['站点A'];
    const payload = sitesPayload('search_sites', true, values);
    values.push('站点B');

    expect(payload.search_sites).toEqual(['站点A']);
  });
});

describe('sitesPayloadWithFallback', () => {
  it('未改动过时回传读到的原值，避免把默认设置里的站点清空', () => {
    expect(
      sitesPayloadWithFallback('search_sites', false, [], ['站点A']),
    ).toEqual({ search_sites: ['站点A'] });
  });

  it('原值从未设置过（null）时回传 null', () => {
    expect(sitesPayloadWithFallback('search_sites', false, [], null)).toEqual({
      search_sites: null,
    });
  });

  it('改动过时以当前选择为准，包括清空', () => {
    expect(
      sitesPayloadWithFallback('search_sites', true, [], ['站点A']),
    ).toEqual({ search_sites: [] });
  });
});

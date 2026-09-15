import { describe, expect, it } from 'vitest';

import { useSiteStats } from '../useSiteStats';

const { parseSize, parseNumber } = useSiteStats();

describe('parseSize', () => {
  it('解析不带千分位的尺寸字符串（后端 SiteUserInfo 格式）', () => {
    expect(parseSize('1.50 GB')).toBeCloseTo(1.5 * 1024 ** 3);
    expect(parseSize('2.00 TB')).toBeCloseTo(2 * 1024 ** 4);
    expect(parseSize('512.00 MB')).toBeCloseTo(512 * 1024 ** 2);
    expect(parseSize('128.00 KB')).toBeCloseTo(128 * 1024);
    expect(parseSize('10.00 B')).toBe(10);
  });

  it('兼容带千分位的尺寸字符串（后端媒体库空间格式）', () => {
    // 带逗号时旧的 ^(\d+...) 正则匹配失败会静默返回 0，
    // 表现为上传/下载量为 0
    expect(parseSize('1,234.56 GB')).toBeCloseTo(1234.56 * 1024 ** 3);
    expect(parseSize('1,000.00 TB')).toBeCloseTo(1000 * 1024 ** 4);
  });

  it('数字原样返回', () => {
    expect(parseSize(1024)).toBe(1024);
    expect(parseSize(0)).toBe(0);
  });

  it('空值与无法解析的字符串返回 0', () => {
    expect(parseSize(null as unknown as string)).toBe(0);
    expect(parseSize('')).toBe(0);
    expect(parseSize('N/A')).toBe(0);
  });
});

describe('parseNumber', () => {
  it('解析数值字符串', () => {
    expect(parseNumber('100.50')).toBe(100.5);
    expect(parseNumber(42)).toBe(42);
  });

  it('空值与非法输入返回 0', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
});

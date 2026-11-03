/**
 * 剪贴板工具回归测试。
 *
 * 真实故障：AI 对话的「复制」按钮点击后提示「复制失败」。
 * 原因是浏览器只在安全上下文（HTTPS / localhost）暴露 navigator.clipboard，
 * 局域网通过 http://<NAS-IP>:3000 访问时该 API 不存在，调用直接抛错。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyText } from '../utils/clipboard';

const originalClipboard = navigator.clipboard;

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
    writable: true,
  });
}

describe('copyText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    stubClipboard(originalClipboard);
    vi.restoreAllMocks();
  });

  it('使用异步剪贴板 API 复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('非安全上下文没有 clipboard API 时降级到 execCommand', async () => {
    // 模拟 http://<NAS-IP> 场景：navigator.clipboard 为 undefined
    stubClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
      writable: true,
    });

    await expect(copyText('http://nas:3000/a.mkv')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    // 兜底用的 textarea 必须被清理，不能留在页面上
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('异步 API 抛错（权限被拒）时同样降级', async () => {
    stubClipboard({
      writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
      writable: true,
    });

    await expect(copyText('x')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('两种方式都失败时返回 false（调用方据此提示手动复制）', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
      writable: true,
    });

    await expect(copyText('x')).resolves.toBe(false);
  });

  it('execCommand 抛错时不冒泡', async () => {
    stubClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('not supported');
      }),
      writable: true,
    });

    await expect(copyText('x')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('空文本不触发任何复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    await expect(copyText('')).resolves.toBe(false);
    await expect(copyText(undefined)).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

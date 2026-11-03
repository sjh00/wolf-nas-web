/**
 * 剪贴板复制工具
 *
 * 浏览器只在「安全上下文」（HTTPS 或 localhost）才暴露 `navigator.clipboard`。
 * 局域网通过 `http://<NAS-IP>:3000` 访问时该 API 是 undefined，直接调用
 * `navigator.clipboard.writeText(...)` 会抛 TypeError，界面上就表现为
 * 「复制失败」——这不是权限问题，也不是浏览器不支持复制，而是 API 不存在。
 *
 * 因此统一走这里：优先异步剪贴板 API，不可用或失败时降级到
 * `document.execCommand('copy')` 的隐藏 textarea 方案。
 */

/**
 * 复制文本到剪贴板。
 * @param text 待复制的文本
 * @returns 是否复制成功（调用方据此决定提示成功还是手动复制）
 */
export async function copyText(
  text: null | string | undefined,
): Promise<boolean> {
  const value = text ?? '';
  if (!value) return false;

  if (await writeByClipboardApi(value)) return true;
  return writeByExecCommand(value);
}

async function writeByClipboardApi(text: string): Promise<boolean> {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // 权限被拒（非用户手势触发）或 iframe 限制：交给 execCommand 兜底
    return false;
  }
}

function writeByExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;
  // 保留当前焦点与选区，避免复制后光标跳到页面底部
  const activeElement = document.activeElement as HTMLElement | null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.opacity = '0';
  document.body.append(textarea);

  let ok: boolean;
  try {
    textarea.focus();
    textarea.select();
    // iOS Safari 只认 setSelectionRange
    textarea.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    textarea.remove();
    activeElement?.focus?.();
  }
  return ok;
}

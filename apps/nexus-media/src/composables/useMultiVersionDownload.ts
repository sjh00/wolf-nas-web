import { h, ref } from 'vue';

import { NButton, useDialog } from 'naive-ui';

import type { DownloadApi } from '#/api/modules/download';
import { cleanupFileChainApi } from '#/api/modules/media';

/**
 * 下载前多版本确认（替换 / 共存 / 取消）。
 *
 * 三个下载入口共用：先不带策略提交，若后端返回 need_confirm，
 * 弹出"替换 / 共存 / 取消"确认框；据选择带 confirm_strategy 重新提交，
 * 其中"替换"会先清理当前重复版本（按文件锚点清理硬链接链），再重新提交。
 */
export function useMultiVersionDownload() {
  const dialog = useDialog();
  const loading = ref(false);

  type SubmitFn = (strategy?: string) => Promise<DownloadApi.MultiVersionConfirm>;

  function extractConfirm(res: any): DownloadApi.MultiVersionConfirm | null {
    const candidate: any = res && res.need_confirm !== undefined ? res : res?.data;
    if (!candidate || !candidate.need_confirm) return null;
    return candidate as DownloadApi.MultiVersionConfirm;
  }

  function buildVersionContent(versions: DownloadApi.MultiVersionConfirm['versions']): string {
    if (!versions?.length) return '该作品已有其他版本文件在媒体库中。';
    const lines = versions.map((v, i) => {
      const name = v.dest_filename || v.full_path || v.source_filename || '';
      const season = v.season_episode ? ` [${v.season_episode}]` : '';
      const spec = v.spec ? ` (${v.spec})` : '';
      return `${i + 1}. ${name}${season}${spec}`;
    });
    return `该作品已有以下版本文件在媒体库中：\n${lines.join('\n')}\n\n请选择处理方式：`;
  }

  async function submit(
    submitFn: SubmitFn,
    options?: { successMessage?: () => void },
  ): Promise<boolean> {
    try {
      loading.value = true;
      const first = await submitFn();
      const confirm = extractConfirm(first);
      if (!confirm) {
        options?.successMessage?.();
        return true;
      }
      const strategy = await openConfirmDialog(confirm);
      if (strategy === 'cancel') return false;

      if (strategy === 'overwrite' && confirm.versions?.length) {
        // 先清理已入库的重复版本（按第一个版本文件为锚点清理其硬链接链）
        const anchor = confirm.versions.find((v) => v.full_path && v.exists !== false);
        if (anchor?.full_path) {
          await cleanupFileChainApi(anchor.full_path);
        }
      }

      // 带策略重新提交
      await submitFn(strategy);
      options?.successMessage?.();
      return true;
    } finally {
      loading.value = false;
    }
  }

  function openConfirmDialog(confirm: DownloadApi.MultiVersionConfirm): Promise<string> {
    return new Promise((resolve) => {
      let resolved = false;
      const d = dialog.warning({
        title: '检测到多个已入库版本',
        content: buildVersionContent(confirm.versions),
        maskClosable: false,
        action: () =>
          h('div', { style: 'display:flex;gap:8px;justify-content:flex-end;' }, [
            h(
              NButton,
              {
                type: 'primary',
                onClick: () => {
                  if (resolved) return;
                  resolved = true;
                  d.destroy();
                  resolve('overwrite');
                },
              },
              { default: () => '替换（清理旧版本）' },
            ),
            h(
              NButton,
              {
                onClick: () => {
                  if (resolved) return;
                  resolved = true;
                  d.destroy();
                  resolve('duplicate');
                },
              },
              { default: () => '共存' },
            ),
            h(
              NButton,
              {
                onClick: () => {
                  if (resolved) return;
                  resolved = true;
                  d.destroy();
                  resolve('cancel');
                },
              },
              { default: () => '取消' },
            ),
          ]),
        onClose: () => {
          if (resolved) return;
          resolved = true;
          d.destroy();
          resolve('cancel');
        },
      });
    });
  }

  return { submit, loading };
}

import type { DownloadApi } from '#/api/modules/download';

import { h, ref, shallowRef } from 'vue';

import { NButton, NCheckbox, NText, useDialog } from 'naive-ui';

import { cleanupFileChainApi } from '#/api/modules/media';

/**
 * 下载前多版本确认（替换 / 共存 / 取消）。
 *
 * 流程：
 * 1. 先不带策略提交，若后端返回 need_confirm，弹出"版本选择"对话框。
 * 2. 用户可**多选**要替换的版本（复选框），并选择：
 *    - 替换（清理旧版本）→ 再弹"源文件处理方式"（不动源 / 同时清理源+做种任务）
 *    - 共存 → 直接带 confirm_strategy 重新提交
 *    - 取消 → 放弃
 * 3. 替换时对每个选中版本按对应 source_policy 调 /media/cleanup 清理，再重新提交下载。
 */
export function useMultiVersionDownload() {
  const dialog = useDialog();
  const loading = ref(false);

  type SubmitFn = (
    strategy?: string,
  ) => Promise<DownloadApi.MultiVersionConfirm>;
  type VersionItem = DownloadApi.MultiVersionConfirm['versions'][number];

  // 当前确认弹窗的上下文
  const _confirm = shallowRef<DownloadApi.MultiVersionConfirm | null>(null);
  const _submitFn = shallowRef<null | SubmitFn>(null);
  const _selected = ref<Set<string>>(new Set());

  // 同一作品的版本可能对应同一 full_path；用 full_path 作为唯一标识
  function versionKey(v: VersionItem): string {
    return v.full_path || v.dest_filename || v.source_filename || String(v);
  }

  function extractConfirm(res: any): DownloadApi.MultiVersionConfirm | null {
    const candidate: any =
      res && res.need_confirm !== undefined ? res : res?.data;
    if (!candidate || !candidate.need_confirm) return null;
    return candidate as DownloadApi.MultiVersionConfirm;
  }

  function versionLabel(v: VersionItem): string {
    const name = v.dest_filename || v.source_filename || '';
    const season = v.season_episode ? ` [${v.season_episode}]` : '';
    const spec = v.spec ? ` (${v.spec})` : '';
    return `${name}${season}${spec}`;
  }

  /** 渲染版本多选列表 */
  function renderVersionList(versions: VersionItem[]) {
    const valid = (versions || []).filter((v) => v.full_path);
    if (valid.length === 0) {
      return '该作品已有其他版本文件在媒体库中，但无法定位具体文件。';
    }
    return valid.map((v) => {
      const key = versionKey(v);
      return h(
        'div',
        { style: 'display:flex;align-items:center;gap:8px;padding:4px 0;' },
        [
          h(NCheckbox, {
            checked: _selected.value.has(key),
            onUpdateChecked: (checked: boolean) => {
              _selected.value = new Set(_selected.value);
              if (checked) _selected.value.add(key);
              else _selected.value.delete(key);
            },
          }),
          h(NText, { depth: 2 }, { default: () => versionLabel(v) }),
        ],
      );
    });
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

      _confirm.value = confirm;
      _submitFn.value = submitFn;
      _selected.value = new Set();
      const strategy = await openSelectDialog(confirm);
      if (strategy === 'cancel') return false;

      if (strategy === 'overwrite') {
        const sourcePolicy = await openSourcePolicyDialog();
        if (sourcePolicy === 'cancel') return false;

        // 对每个选中版本按源策略清理
        const selectedVersions = (confirm.versions || []).filter((v) =>
          _selected.value.has(versionKey(v)),
        );
        if (selectedVersions.length > 0) {
          for (const v of selectedVersions) {
            if (v.full_path) {
              await cleanupFileChainApi(v.full_path, {
                sourcePolicy,
                deleteDownloader: sourcePolicy === 'remove',
              });
            }
          }
        }
      }

      // 带策略重新提交（duplicate=共存，overwrite=替换已清理）
      await submitFn(strategy === 'overwrite' ? 'confirmed' : 'duplicate');
      options?.successMessage?.();
      return true;
    } finally {
      loading.value = false;
    }
  }

  /** 第二级：源文件处理方式 */
  function openSourcePolicyDialog(): Promise<'cancel' | 'keep' | 'remove'> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (val: 'cancel' | 'keep' | 'remove') => {
        if (resolved) return;
        resolved = true;
        d.destroy();
        resolve(val);
      };
      const d = dialog.warning({
        title: '源文件（做种）处理方式',
        content: '替换时将清理媒体库文件。做种源文件如何处理？',
        maskClosable: false,
        action: () =>
          h(
            'div',
            { style: 'display:flex;gap:8px;justify-content:flex-end;' },
            [
              h(
                NButton,
                {
                  type: 'primary',
                  onClick: () => finish('keep'),
                },
                { default: () => '只删媒体库（不动源）' },
              ),
              h(
                NButton,
                {
                  onClick: () => finish('remove'),
                },
                { default: () => '同时清理源+做种任务' },
              ),
              h(
                NButton,
                { onClick: () => finish('cancel') },
                { default: () => '取消' },
              ),
            ],
          ),
        onClose: () => finish('cancel'),
      });
    });
  }

  /** 第一级：版本多选对话框 */
  function openSelectDialog(
    confirm: DownloadApi.MultiVersionConfirm,
  ): Promise<string> {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (strategy: string) => {
        if (resolved) return;
        resolved = true;
        d.destroy();
        resolve(strategy);
      };
      const d = dialog.warning({
        title: '检测到多个已入库版本',
        content: () =>
          h('div', [
            h(
              'div',
              { style: 'margin-bottom:8px;' },
              '请选择要替换的版本（可多选）：',
            ),
            ...renderVersionList(confirm.versions || []),
          ]),
        maskClosable: false,
        action: () =>
          h(
            'div',
            { style: 'display:flex;gap:8px;justify-content:flex-end;' },
            [
              h(
                NButton,
                {
                  type: 'primary',
                  disabled: _selected.value.size === 0,
                  onClick: () => finish('overwrite'),
                },
                { default: () => '替换所选版本' },
              ),
              h(
                NButton,
                {
                  onClick: () => finish('duplicate'),
                },
                { default: () => '共存' },
              ),
              h(
                NButton,
                { onClick: () => finish('cancel') },
                { default: () => '取消' },
              ),
            ],
          ),
        onClose: () => finish('cancel'),
      });
    });
  }

  return { submit, loading };
}

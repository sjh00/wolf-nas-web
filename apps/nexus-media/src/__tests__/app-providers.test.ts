import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * 应用根必须挂齐 naive-ui 的 Provider。
 *
 * 这类缺失对 tsc / eslint / stylelint 全部不可见，但会在运行时抛错：
 * `useDialog()` 在调用时即校验外层 provider，缺失会抛
 * "No outer <n-dialog-provider /> founded."。
 * 而 useMultiVersionDownload()（在正在下载、媒体搜索、站点资源三个页面的
 * setup 中调用）内部就调用 useDialog()，一旦抛错这些页面整体挂载失败、
 * 页面空白。此测试用于锁住该结构不变式。
 */

const appVuePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../app.vue',
);
const source = readFileSync(appVuePath, 'utf8');

/** naive-ui 组合式 API 与其必需的 Provider 组件 */
const REQUIRED_PROVIDERS: Array<{ api: string; provider: string }> = [
  { api: 'useDialog', provider: 'NDialogProvider' },
  { api: 'useMessage', provider: 'NMessageProvider' },
  { api: 'useNotification', provider: 'NNotificationProvider' },
];

describe('app.vue naive-ui providers', () => {
  it.each(REQUIRED_PROVIDERS)(
    '$provider 已导入并包裹 RouterView（$api 依赖它）',
    ({ provider }) => {
      const imported = new RegExp(`\\b${provider}\\b`).test(source);
      expect(imported, `app.vue 未导入 ${provider}`).toBe(true);

      // 开标签出现在 <RouterView /> 之前，即 Provider 包裹了路由内容
      const providerOpen = source.indexOf(`<${provider}`);
      const routerView = source.indexOf('<RouterView');
      expect(providerOpen, `app.vue 模板中缺少 <${provider}>`).toBeGreaterThan(
        -1,
      );
      expect(
        providerOpen,
        `<${provider}> 必须包裹 <RouterView />，否则 Provider 对页面不生效`,
      ).toBeLessThan(routerView);
    },
  );
});

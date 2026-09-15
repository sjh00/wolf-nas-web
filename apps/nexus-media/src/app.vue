<script lang="ts" setup>
import type { GlobalThemeOverrides } from 'naive-ui';

import { computed } from 'vue';

import { useNaiveDesignTokens } from '@vben/hooks';
import { preferences, usePreferences } from '@vben/preferences';

import {
  darkTheme,
  dateEnUS,
  dateZhCN,
  enUS,
  lightTheme,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  zhCN,
} from 'naive-ui';

defineOptions({ name: 'App' });

const { commonTokens } = useNaiveDesignTokens();

// 解析实际生效的暗色模式：dark 或 auto（跟随系统深色），与 CSS 变量切换保持一致
const { isDark } = usePreferences();

const tokenLocale = computed(() =>
  preferences.app.locale === 'zh-CN' ? zhCN : enUS,
);
const tokenDateLocale = computed(() =>
  preferences.app.locale === 'zh-CN' ? dateZhCN : dateEnUS,
);
const tokenTheme = computed(() => (isDark.value ? darkTheme : lightTheme));

const themeOverrides = computed((): GlobalThemeOverrides => {
  return {
    common: commonTokens,
  };
});
</script>

<template>
  <NConfigProvider
    :date-locale="tokenDateLocale"
    :locale="tokenLocale"
    :theme="tokenTheme"
    :theme-overrides="themeOverrides"
    class="h-full"
  >
    <NNotificationProvider>
      <NMessageProvider>
        <!-- NDialogProvider 必须存在：useDialog() 在调用时即校验外层 provider，
             缺失会抛 "No outer <n-dialog-provider /> founded."，使在 setup 中调用
             useMultiVersionDownload() 的页面（正在下载、媒体搜索、站点资源）
             整体挂载失败、页面空白 -->
        <NDialogProvider>
          <RouterView />
        </NDialogProvider>
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

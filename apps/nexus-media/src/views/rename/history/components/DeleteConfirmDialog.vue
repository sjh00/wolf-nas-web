<script lang="ts" setup>
import { NButton, NCheckbox, NModal } from 'naive-ui';

export interface CleanupOption {
  description: string;
  label: string;
  value: string;
}

interface Props {
  confirmText?: string;
  description: string;
  loading?: boolean;
  /** 可选的「同时移除」附加项；为空数组时不显示该区域 */
  options?: CleanupOption[];
  paths?: string[];
  show: boolean;
  title: string;
}

withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  loading: false,
  options: () => [],
  paths: () => [],
});
const emit = defineEmits<{
  'update:show': [value: boolean];
  confirm: [];
}>();

/** 用户勾选的附加清理项（由父组件用 v-model:selected-options 传入） */
const selectedOptions = defineModel<string[]>('selectedOptions', {
  default: () => [],
});

function toggleOption(value: string, checked: boolean) {
  const next = new Set(selectedOptions.value);
  if (checked) next.add(value);
  else next.delete(value);
  selectedOptions.value = [...next];
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="title"
    style="width: min(460px, 94vw)"
    :mask-closable="!loading"
    @update:show="emit('update:show', $event)"
  >
    <p class="dialog-desc">{{ description }}</p>

    <!-- 移除记录时可一并清理关联资源：整体迁移、换整合版都要求一次清干净 -->
    <div v-if="options.length > 0" class="dialog-options">
      <NCheckbox
        v-for="option in options"
        :key="option.value"
        :checked="selectedOptions.includes(option.value)"
        @update:checked="(v: boolean) => toggleOption(option.value, v)"
      >
        <span class="option-label">{{ option.label }}</span>
        <span class="option-desc">{{ option.description }}</span>
      </NCheckbox>
    </div>

    <div v-if="paths.length > 0" class="dialog-paths">
      <code v-for="path in paths" :key="path">{{ path }}</code>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <NButton :disabled="loading" @click="emit('update:show', false)">
          取消
        </NButton>
        <NButton type="error" :loading="loading" @click="emit('confirm')">
          {{ confirmText }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.dialog-desc {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.dialog-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  margin-top: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.option-label {
  font-size: 0.78rem;
}

.option-desc {
  display: block;
  font-size: 0.7rem;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}

.dialog-paths {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 180px;
  padding: 8px 10px;
  margin-top: 12px;
  overflow-y: auto;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.dialog-paths code {
  font-family: var(--font-mono, monospace);
  font-size: 0.69rem;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.dialog-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>

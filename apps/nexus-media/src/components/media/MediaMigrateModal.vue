<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import {
  NAlert,
  NButton,
  NCheckbox,
  NForm,
  NFormItem,
  NModal,
  NSelect,
  NSpace,
  NSpin,
} from 'naive-ui';

import {
  getOrphanSourcesApi,
  migrateMediaApi,
  migrateMediaPlanApi,
} from '#/api/modules/media';
import { getSyncTasksApi, type SyncApi } from '#/api/modules/sync';
import { useAppNotification } from '#/utils/notify';

const props = defineProps<{ show: boolean; tmdbId?: number }>();
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'success'): void;
}>();

const notification = useAppNotification();
const loading = ref(false);
const submitting = ref(false);

// 目标盘候选（从目录同步配置取 source/dest 对）
interface DiskOption {
  source: string;
  dest: string;
  label: string;
}
const diskOptions = ref<DiskOption[]>([]);
const selectedDisk = ref<null | string>(null);
const selectedSource = ref('');
const selectedDest = ref('');
const crossDrive = ref(false);
const moveTorrents = ref(true);

// 孤儿源文件（有源文件但下载器无做种任务）批量处理策略
const orphanCount = ref(0);
const orphanPolicy = ref<'migrate' | 'remove' | 'skip'>('migrate');

// 迁移预览
const plan = ref<null | {
  title: string;
  year: string;
  record_count: number;
  source_dirs: string[];
  dest_dirs: string[];
}>(null);

const selectedDiskOption = computed(() =>
  diskOptions.value.find((d) => `${d.source}|${d.dest}` === selectedDisk.value),
);

async function loadPlan() {
  if (!props.tmdbId) return;
  loading.value = true;
  try {
    const [planRes, syncRes, orphanRes] = await Promise.all([
      migrateMediaPlanApi(props.tmdbId),
      getSyncTasksApi(),
      getOrphanSourcesApi(props.tmdbId),
    ]);
    plan.value = planRes as any;
    orphanCount.value = orphanRes?.total || 0;
    // 组装目标盘候选（source -> dest 成对）；过滤掉与当前源目录相同的盘
    const dict = (syncRes as unknown as Record<string, SyncApi.SyncTask>) || {};
    const seen = new Set<string>();
    diskOptions.value = [];
    for (const t of Object.values(dict)) {
      if (!t?.source) continue;
      const key = `${t.source}|${t.dest || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      diskOptions.value.push({
        source: t.source,
        dest: t.dest || '',
        label: t.dest ? `${t.source} → ${t.dest}` : t.source,
      });
    }
  } catch (error: any) {
    notification.error('加载迁移信息失败', {
      description: error?.message || '',
    });
  } finally {
    loading.value = false;
  }
}

function onDiskChange() {
  const opt = selectedDiskOption.value;
  selectedSource.value = opt?.source || '';
  selectedDest.value = opt?.dest || '';
}

async function confirmMigrate() {
  if (!props.tmdbId) return;
  if (!selectedSource.value || !selectedDest.value) {
    notification.warning('请选择目标盘的源目录与媒体库目录');
    return;
  }
  submitting.value = true;
  try {
    const res = await migrateMediaApi({
      tmdb_id: props.tmdbId,
      target_source: selectedSource.value,
      target_dest: selectedDest.value,
      cross_drive: crossDrive.value,
      move_torrents: moveTorrents.value,
      orphan_policy: orphanPolicy.value,
    });
    const failedCount = (res as any)?.failed?.length || 0;
    notification.success(
      failedCount > 0 ? `迁移完成（${failedCount} 项失败）` : '迁移完成',
      {
        description: `迁移目录 ${(res as any)?.migrated_dirs?.length || 0} 个，孤儿源 ${
          (res as any)?.orphan_removed?.length || 0
        } 个`,
      },
    );
    emit('success');
    emit('update:show', false);
  } catch (error: any) {
    notification.error('迁移失败', {
      description: error?.message || '',
    });
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.show,
  (v) => {
    if (v) {
      crossDrive.value = false;
      moveTorrents.value = true;
      selectedDisk.value = null;
      selectedSource.value = '';
      selectedDest.value = '';
      if (props.tmdbId) {
        void loadPlan();
      }
    }
  },
);
</script>

<template>
  <NModal
    :show="show"
    :title="`迁移到其他盘${plan?.title ? ` - ${plan.title}` : ''}`"
    :style="{ width: '560px', maxWidth: '95vw' }"
    preset="card"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NSpin :show="loading">
      <div v-if="plan" class="mb-3 text-sm text-muted-foreground">
        该作品共
        <strong>{{ plan.record_count }}</strong>
        条转移记录；源目录
        <strong>{{ plan.source_dirs.length }}</strong>
        个，媒体库目录
        <strong>{{ plan.dest_dirs.length }}</strong> 个。
        <div v-if="plan.source_dirs.length" class="mt-1 truncate">
          源目录：{{ plan.source_dirs.join('、') }}
        </div>
        <div v-if="plan.dest_dirs.length" class="mt-1 truncate">
          媒体库：{{ plan.dest_dirs.join('、') }}
        </div>
      </div>

      <NForm label-placement="top">
        <NFormItem label="目标盘" required>
          <NSelect
            v-model:value="selectedDisk"
            :options="
              diskOptions.map((d) => ({
                label: d.label,
                value: `${d.source}|${d.dest}`,
              }))
            "
            placeholder="选择目标盘的目录同步配置（源目录 → 媒体库目录）"
            clearable
            @update:value="onDiskChange"
          />
        </NFormItem>

        <NFormItem label="目标源目录（btstore）" required>
          <NInput
            v-model:value="selectedSource"
            placeholder="目标盘的做种源目录"
          />
        </NFormItem>

        <NFormItem label="目标媒体库目录（medialink）" required>
          <NInput
            v-model:value="selectedDest"
            placeholder="目标盘的媒体库目录"
          />
        </NFormItem>

        <NAlert type="info" :show-icon="true" class="mb-3">
          同盘将直接移动（保留硬链接）；跨盘将先复制、校验后再删除旧位置，确保不丢失文件。
        </NAlert>

        <NAlert
          v-if="orphanCount > 0"
          type="warning"
          :show-icon="true"
          class="mb-3"
        >
          检测到
          <strong>{{ orphanCount }}</strong>
          个孤儿源文件（有源文件但下载器中无做种任务，通常是删除记录时残留的）。请选择处理方式：
        </NAlert>

        <NFormItem v-if="orphanCount > 0" label="孤儿源文件处理">
          <NSelect
            v-model:value="orphanPolicy"
            :options="[
              { label: '同步迁移（保留文件，随目录移动）', value: 'migrate' },
              { label: '清除（物理删除，释放空间）', value: 'remove' },
              { label: '跳过（留原盘不动）', value: 'skip' },
            ]"
          />
        </NFormItem>

        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <NCheckbox v-model:checked="crossDrive" />
            <span class="text-sm"
              >勾选表示跨盘（不同文件系统，复制后删旧）</span
            >
          </div>
          <div class="flex items-center gap-2">
            <NCheckbox v-model:checked="moveTorrents" />
            <span class="text-sm">同步迁移下载器做种任务</span>
          </div>
        </div>
      </NForm>
    </NSpin>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton
          type="primary"
          :loading="submitting"
          :disabled="loading || !selectedSource || !selectedDest"
          @click="confirmMigrate"
        >
          开始迁移
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>

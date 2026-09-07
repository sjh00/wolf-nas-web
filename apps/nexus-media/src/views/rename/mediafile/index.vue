<script lang="ts" setup>
import type {
  FileActionKey,
  FileItem,
  SearchScope,
  SortKey,
  SortOrder,
  ViewMode,
} from './types';

import { computed, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPagination,
  NSelect,
  NSpin,
  NTag,
  NTooltip,
} from 'naive-ui';

import {
  consistencyCheckApi,
  getLibraryDuplicatesApi,
  getMediaRelationsApi,
  getOrphanSourcesApi,
  refreshFileIndexApi,
  searchFilesApi,
} from '#/api/modules/media';
import type { MediaRelationItem, OrphanSourceItem } from '#/api/modules/media';
import IdentifyResult from '#/components/media/IdentifyResult.vue';
import MediaMigrateModal from '#/components/media/MediaMigrateModal.vue';
import TransferModal from '#/components/media/TransferModal.vue';
import PageHeader from '#/components/page/PageHeader.vue';
import { useAppNotification } from '#/utils/notify';

import BatchActionBar from './components/BatchActionBar.vue';
import DestPickerModal from './components/DestPickerModal.vue';
import FileContextMenu from './components/FileContextMenu.vue';
import FileGrid from './components/FileGrid.vue';
import FileList from './components/FileList.vue';
import FileToolbar from './components/FileToolbar.vue';
import FileTree from './components/FileTree.vue';
import MobileNavDrawer from './components/MobileNavDrawer.vue';
import { useFileActions } from './composables/useFileActions';
import { useFileNavigation } from './composables/useFileNavigation';
import { useFileSelection } from './composables/useFileSelection';
import { useIsMobile } from './composables/useIsMobile';
import { parentDir } from './utils';

const notification = useAppNotification();
const { isMobile } = useIsMobile();

const nav = useFileNavigation();
const selection = useFileSelection();
const sidebarTreeRef = ref<InstanceType<typeof FileTree>>();
const actions = useFileActions({
  getBackendId: () => nav.currentBackendId.value,
  getCurrentPath: () => nav.currentPath.value,
  refresh: async () => {
    await nav.refresh();
    sidebarTreeRef.value?.clearCache();
  },
  clearSelection: () => selection.clearSelection(),
});

// ---- 视图 / 排序 / 搜索 ----
const viewMode = ref<ViewMode>(isMobile.value ? 'grid' : 'list');
const sortKey = ref<SortKey>('name');
const sortOrder = ref<SortOrder>('asc');
const searchKeyword = ref('');
const searchScope = ref<SearchScope>('dir');

const globalSearchMode = ref(false);
const globalSearchResults = ref<FileItem[]>([]);
const globalSearchLoading = ref(false);
const globalSearchIndexed = ref(0);
const globalSearchReady = ref(false);
const indexRefreshing = ref(false);
const highlightPath = ref('');

const sortedItems = computed(() => {
  const list = [...nav.dirList.value];
  const dir = (a: FileItem, b: FileItem) =>
    a.is_dir === b.is_dir ? 0 : a.is_dir ? -1 : 1;
  const byName = (a: FileItem, b: FileItem) => a.name.localeCompare(b.name);
  const factor = sortOrder.value === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    const d = dir(a, b);
    if (d !== 0) return d;
    let r: number;
    switch (sortKey.value) {
      case 'mtime': {
        r = (a.mtime ?? 0) - (b.mtime ?? 0);
        break;
      }
      case 'size': {
        r = (a.size ?? -1) - (b.size ?? -1);
        break;
      }
      default: {
        r = byName(a, b);
      }
    }
    return r === 0 ? byName(a, b) : r * factor;
  });
  return list;
});

const displayItems = computed(() => {
  if (globalSearchMode.value) return globalSearchResults.value;
  const kw = searchKeyword.value.trim().toLowerCase();
  if (!kw || searchScope.value !== 'dir') return sortedItems.value;
  return sortedItems.value.filter((i) => i.name.toLowerCase().includes(kw));
});

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
}

watch(
  () => nav.dirList.value,
  (items) => selection.pruneSelection(items),
);

watch(searchScope, (scope) => {
  if (scope === 'dir' && globalSearchMode.value) clearGlobalSearch();
});

async function handleSearchEnter() {
  if (searchScope.value === 'dir') return;
  const kw = searchKeyword.value.trim();
  if (!kw) {
    clearGlobalSearch();
    return;
  }
  globalSearchLoading.value = true;
  globalSearchMode.value = true;
  try {
    const res = await searchFilesApi(kw, 100);
    if (res) {
      globalSearchResults.value = res.items || [];
      globalSearchReady.value = res.ready || false;
      globalSearchIndexed.value = res.indexed || 0;
    }
  } catch (error: any) {
    notification.error('搜索失败', { description: error?.message || '' });
  } finally {
    globalSearchLoading.value = false;
  }
}

async function handleRefreshIndex() {
  indexRefreshing.value = true;
  try {
    await refreshFileIndexApi();
    notification.info('索引构建已触发', {
      description: '正在后台扫描媒体库与同步源目录，稍后重新搜索即可看到结果。',
    });
  } catch (error: any) {
    notification.error('构建索引失败', { description: error?.message || '' });
  } finally {
    indexRefreshing.value = false;
  }
}

function clearGlobalSearch() {
  searchKeyword.value = '';
  globalSearchMode.value = false;
  globalSearchResults.value = [];
}

// ---- 多版本 / 重复文件识别 ----
const duplicateMode = ref(false);
const duplicates = ref<
  Array<{
    tmdb_id: number;
    title: string;
    year: string;
    dir_count: number;
    file_count: number;
    versions: Array<{
      dest_path: string;
      dest_filename: string;
      full_path: string;
      season_episode: string;
      date: string;
      exists: boolean;
      spec: string;
      hardlinks: string[];
    }>;
  }>
>([]);
const duplicateLoading = ref(false);
const expandedDuplicate = ref<null | number>(null);

const consistencyLoading = ref(false);
const consistencyResult = ref<null | {
  checked: number;
  fixed: number;
  missing: number;
  missing_records: Array<{
    id: number;
    dest_path: string;
    dest_filename: string;
    expected: string;
  }>;
}>(null);
const consistencyModalVisible = ref(false);

async function handleConsistencyCheck() {
  consistencyLoading.value = true;
  try {
    const res = await consistencyCheckApi(500, 100);
    const data = res as any;
    consistencyResult.value = data;
    const summary = `检查 ${data.checked ?? 0} 条，已修正 ${data.fixed ?? 0} 条，丢失 ${data.missing ?? 0} 条`;
    if ((data.missing ?? 0) > 0 || (data.fixed ?? 0) > 0) {
      consistencyModalVisible.value = true;
    } else {
      notification.info('媒体库一致性校验', { description: summary });
    }
  } catch (error: any) {
    notification.error('一致性校验失败', {
      description: error?.message || '',
    });
  } finally {
    consistencyLoading.value = false;
  }
}

// ---- 文件关系分析（源/媒体库存在性 + 硬链接指向） ----
const relationModalVisible = ref(false);
const relationLoading = ref(false);
const relations = ref<MediaRelationItem[]>([]);
const relationTotal = ref(0);
const relationStateCounts = ref<Record<string, number>>({});
const relationState = ref('');
const relationSearch = ref('');
const relationPage = ref(1);
const relationPageSize = ref(20);
const relationExpanded = ref<null | number>(null);

// 作品级跨盘迁移
const migrateModalShow = ref(false);
const migrateTmdbId = ref<undefined | number>(undefined);

function openMigrateFor(id: number) {
  migrateTmdbId.value = id;
  migrateModalShow.value = true;
}

// ---- 孤儿源文件（有源文件但下载器无做种任务） ----
const relationTab = ref<'relation' | 'orphan'>('relation');
const orphanLoading = ref(false);
const orphanItems = ref<OrphanSourceItem[]>([]);
const orphanTotal = ref(0);

async function loadOrphans() {
  orphanLoading.value = true;
  try {
    const res = await getOrphanSourcesApi();
    orphanItems.value = res?.orphans || [];
    orphanTotal.value = res?.total || 0;
  } catch (error: any) {
    notification.error('孤儿源文件加载失败', {
      description: error?.message || '',
    });
  } finally {
    orphanLoading.value = false;
  }
}

async function switchRelationTab(tab: 'relation' | 'orphan') {
  relationTab.value = tab;
  if (tab === 'orphan') {
    await loadOrphans();
  } else if (relationModalVisible.value) {
    // 回到关系列表时刷新
    void loadRelations();
  }
}


const relationStateOptions = [
  { label: '全部', value: '' },
  { label: '只有源（无媒体库）', value: 'only_source' },
  { label: '只有媒体库（无源）', value: 'only_dest' },
  { label: '源+媒体库都有', value: 'both' },
  { label: '都缺失', value: 'none' },
  { label: '无法判定', value: 'unknown' },
];

function relationStateLabel(state: string): string {
  switch (state) {
    case 'only_source':
      return '只有源';
    case 'only_dest':
      return '只有媒体库';
    case 'both':
      return '源+媒体库';
    case 'none':
      return '都缺失';
    case 'unknown':
      return '未知';
    default:
      return state;
  }
}

function relationTagType(state: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (state) {
    case 'both':
      return 'success';
    case 'only_source':
    case 'only_dest':
      return 'warning';
    case 'none':
      return 'error';
    default:
      return 'default';
  }
}

async function openRelationModal() {
  relationModalVisible.value = true;
  relationPage.value = 1;
  await loadRelations();
}

async function loadRelations() {
  relationLoading.value = true;
  try {
    const res = await getMediaRelationsApi({
      search: relationSearch.value || undefined,
      state: relationState.value || undefined,
      page: relationPage.value,
      page_size: relationPageSize.value,
      with_hardlinks: true,
    });
    relations.value = res?.items || [];
    relationTotal.value = res?.total || 0;
    relationStateCounts.value = res?.state_counts || {};
  } catch (error: any) {
    notification.error('文件关系分析加载失败', {
      description: error?.message || '',
    });
  } finally {
    relationLoading.value = false;
  }
}

function onRelationStateChange() {
  relationPage.value = 1;
  void loadRelations();
}

function onRelationSearch() {
  relationPage.value = 1;
  void loadRelations();
}

function toggleRelation(id: number) {
  relationExpanded.value = relationExpanded.value === id ? null : id;
}

function onRelationPageChange(page: number) {
  relationPage.value = page;
  void loadRelations();
}

async function enterDuplicateMode() {
  duplicateMode.value = true;
  globalSearchMode.value = false;
  await loadDuplicates();
}

async function loadDuplicates() {
  duplicateLoading.value = true;
  try {
    const res = await getLibraryDuplicatesApi(200);
    duplicates.value = Array.isArray(res) ? res : res?.items || [];
  } catch (error: any) {
    notification.error('加载多版本作品失败', {
      description: error?.message || '',
    });
  } finally {
    duplicateLoading.value = false;
  }
}

function exitDuplicateMode() {
  duplicateMode.value = false;
  duplicates.value = [];
  expandedDuplicate.value = null;
}

function toggleDuplicate(tmdbId: number) {
  expandedDuplicate.value = expandedDuplicate.value === tmdbId ? null : tmdbId;
}

function gotoVersion(version: { dest_path: string; full_path: string }) {
  // 定位到版本文件所在目录
  const dir = version.dest_path || parentDir(version.full_path);
  duplicateMode.value = false;
  nav.navigateTo(dir === '/' ? '' : dir);
}

function openSearchResult(item: FileItem) {
  const dir = parentDir(item.path);
  globalSearchMode.value = false;
  searchKeyword.value = '';
  highlightPath.value = item.path;
  nav.navigateTo(dir === '/' ? '' : dir);
  setTimeout(() => {
    highlightPath.value = '';
  }, 3000);
}

// ---- 行交互语义（列表/网格共用） ----
function openItem(item: FileItem) {
  if (globalSearchMode.value) {
    openSearchResult(item);
    return;
  }
  if (item.is_dir) {
    nav.navigateTo(item.path);
  }
}

function handleRowClick(
  item: FileItem,
  mods: { ctrl: boolean; shift: boolean },
) {
  if (isMobile.value) {
    if (selection.selectionMode.value) {
      selection.toggle(item);
    } else if (item.is_dir || globalSearchMode.value) {
      openItem(item);
    } else {
      selection.selectSingle(item);
    }
    return;
  }
  if (mods.shift) {
    selection.rangeSelect(item, displayItems.value);
  } else if (mods.ctrl) {
    selection.toggle(item);
  } else if (item.is_dir || globalSearchMode.value) {
    openItem(item);
  } else {
    selection.selectSingle(item);
  }
}

function handleRowDblclick(item: FileItem) {
  if (isMobile.value) return;
  if (item.is_dir || globalSearchMode.value) {
    selection.selectSingle(item);
    openItem(item);
  }
}

function handleRowLongpress(item: FileItem) {
  selection.selectionMode.value = true;
  selection.toggle(item);
}

function handleToggleSelectAll() {
  if (selection.isAllSelected(displayItems.value)) {
    selection.clearSelection();
  } else {
    selection.selectAll(displayItems.value);
  }
}

// ---- 上下文菜单 ----
const ctxMenu = ref({ show: false, x: 0, y: 0 });

const ctxItems = computed<FileItem[]>(() => {
  const sel = selection.selectedItems(displayItems.value);
  return sel.length > 0 ? sel : [];
});

const ctxOptions = computed(() => actions.buildMenuOptions(ctxItems.value));

function openContextMenu(item: FileItem, pos: { x: number; y: number }) {
  if (!selection.isSelected(item)) {
    selection.selectSingle(item);
  }
  ctxMenu.value = { show: true, x: pos.x, y: pos.y };
}

function handleContextSelect(key: FileActionKey) {
  ctxMenu.value.show = false;
  actions.dispatch(key, ctxItems.value);
}

// ---- 批量操作条 ----
const batchItems = computed(() => selection.selectedItems(displayItems.value));
const batchAllFiles = computed(() => batchItems.value.every((i) => !i.is_dir));

function handleBatchAction(key: FileActionKey) {
  actions.dispatch(key, batchItems.value);
}

// ---- 新建目录 / 上传 / 移动复制 ----
const uploadInputRef = ref<HTMLInputElement>();

function triggerUpload() {
  uploadInputRef.value?.click();
}

function handleUploadChange(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    actions.uploadFiles(input.files);
  }
  input.value = '';
}

function handleMoveCopyConfirm(dest: string, destBackendId: string) {
  if (destBackendId !== nav.currentBackendId.value) {
    notification.warning('移动/复制仅支持同一存储后端内操作');
    return;
  }
  actions.moveCopyDialog.value.dest = dest;
  actions.submitMoveCopy();
}

// ---- 移动端抽屉 ----
const navDrawerShow = ref(false);

onMounted(() => nav.init());
</script>

<template>
  <div class="file-manager">
    <PageHeader title="文件管理" subtitle="浏览和管理媒体库文件" />

    <div class="file-manager-body">
      <!-- 桌面端侧边栏 -->
      <div v-if="!isMobile" class="sidebar tbl-card">
        <FileTree
          ref="sidebarTreeRef"
          :groups="nav.backendGroups.value"
          :current-path="nav.currentPath.value"
          :current-backend-id="nav.currentBackendId.value"
          :load-children="nav.loadChildren"
          @select="
            (path, backendId) =>
              nav.navigateToSidebarPath({
                path,
                backend_id: backendId,
                name: '',
                type: '',
              })
          "
        />
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <FileToolbar
          :can-go-back="nav.canGoBack.value"
          :can-go-forward="nav.canGoForward.value"
          :can-go-up="nav.canGoUp.value"
          :breadcrumbs="nav.breadcrumbs.value"
          :root-name="nav.currentRootName.value"
          :root-path="nav.currentRoot.value || ''"
          :current-path="nav.currentPath.value"
          v-model:view-mode="viewMode"
          v-model:search-keyword="searchKeyword"
          v-model:search-scope="searchScope"
          :is-mobile="isMobile"
          @back="nav.goBack"
          @forward="nav.goForward"
          @up="nav.goUp"
          @refresh="nav.refresh"
          @navigate="nav.navigateTo"
          @search-enter="handleSearchEnter"
          @open-nav="navDrawerShow = true"
          @mkdir="actions.dispatch('mkdir', [])"
          @upload="triggerUpload"
        />

        <BatchActionBar
          v-if="selection.selectedCount.value > 0 && !isMobile"
          :count="selection.selectedCount.value"
          :all-files="batchAllFiles"
          @action="handleBatchAction"
          @clear="selection.clearSelection"
        />

        <div v-if="!globalSearchMode" class="dup-entry">
          <NButton size="small" quaternary @click="enterDuplicateMode">
            <template #icon>
              <IconifyIcon icon="lucide:copy" class="size-4" />
            </template>
            多版本作品
          </NButton>
          <NButton
            size="small"
            quaternary
            :loading="consistencyLoading"
            @click="handleConsistencyCheck"
          >
            <template #icon>
              <IconifyIcon icon="lucide:shield-check" class="size-4" />
            </template>
            校验一致性
          </NButton>
          <NButton size="small" quaternary @click="openRelationModal">
            <template #icon>
              <IconifyIcon icon="lucide:link" class="size-4" />
            </template>
            文件关系
          </NButton>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton
                size="small"
                quaternary
                :loading="indexRefreshing"
                @click="handleRefreshIndex"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:database" class="size-4" />
                </template>
                构建索引
              </NButton>
            </template>
            为“全盘搜索”建立文件索引。默认不自动扫描（避免频繁唤醒休眠盘），
            手动点击后后台扫描媒体库与同步源目录，稍后全盘搜索即可命中新文件。
          </NTooltip>
        </div>

        <div class="search-status" v-if="duplicateMode">
          <span>
            多版本/重复作品：{{ duplicates.length }} 部（同一作品多个文件）
          </span>
          <NButton size="tiny" quaternary @click="exitDuplicateMode">
            返回浏览
          </NButton>
        </div>

        <div v-if="duplicateMode" class="dup-list">
          <NSpin :show="duplicateLoading">
            <div
              v-if="!duplicateLoading && duplicates.length === 0"
              class="dup-empty"
            >
              未发现多版本作品
            </div>
            <article
              v-for="dup in duplicates"
              :key="dup.tmdb_id"
              class="dup-card"
            >
              <div class="dup-head" @click="toggleDuplicate(dup.tmdb_id)">
                <div class="dup-title">
                  {{ dup.title }}
                  <span v-if="dup.year" class="dup-year">{{ dup.year }}</span>
                </div>
                <div class="dup-meta">
                  {{ dup.file_count }} 个文件
                  <IconifyIcon
                    :icon="
                      expandedDuplicate === dup.tmdb_id
                        ? 'lucide:chevron-up'
                        : 'lucide:chevron-down'
                    "
                    class="size-4"
                  />
                </div>
              </div>
              <div
                v-if="expandedDuplicate === dup.tmdb_id"
                class="dup-versions"
              >
                <div
                  v-for="(v, i) in dup.versions"
                  :key="i"
                  class="dup-version"
                >
                  <div class="dup-version-info">
                    <div class="dup-spec">{{ v.spec || '未知规格' }}</div>
                    <div class="dup-file">{{ v.dest_filename }}</div>
                    <div class="dup-state">
                      <NTag v-if="v.exists" size="tiny" type="success"
                        >
存在
</NTag
                      >
                      <NTag v-else size="tiny" type="warning">丢失</NTag>
                      <span v-if="v.season_episode" class="dup-season">{{
                        v.season_episode
                      }}</span>
                    </div>
                  </div>
                  <NButton
                    size="tiny"
                    text
                    type="primary"
                    @click="gotoVersion(v)"
                  >
                    定位
                  </NButton>
                </div>
              </div>
            </article>
          </NSpin>
        </div>

        <div v-if="globalSearchMode" class="search-status">
          <span>
            全盘搜索「{{ searchKeyword }}」：{{ globalSearchResults.length }}
            个结果
            <template v-if="!globalSearchReady">
              · 索引未就绪（已索引 {{ globalSearchIndexed }} 项）
            </template>
          </span>
          <NButton
            v-if="!globalSearchReady"
            size="tiny"
            quaternary
            :loading="indexRefreshing"
            @click="handleRefreshIndex"
          >
            构建索引
          </NButton>
          <NButton size="tiny" quaternary @click="clearGlobalSearch">
            返回浏览
          </NButton>
        </div>

        <FileList
          v-if="!duplicateMode && viewMode === 'list'"
          :items="displayItems"
          :loading="globalSearchMode ? globalSearchLoading : nav.loading.value"
          :selected-paths="selection.selectedPaths.value"
          :selection-mode="selection.selectionMode.value"
          :sort-key="sortKey"
          :sort-order="sortOrder"
          :highlight-path="highlightPath"
          :empty-text="globalSearchMode ? '未找到匹配的文件' : '当前目录为空'"
          @row-click="handleRowClick"
          @row-dblclick="handleRowDblclick"
          @row-longpress="handleRowLongpress"
          @row-contextmenu="openContextMenu"
          @row-menu="openContextMenu"
          @toggle-select="selection.toggle"
          @toggle-select-all="handleToggleSelectAll"
          @toggle-sort="toggleSort"
        />
        <FileGrid
          v-else-if="!duplicateMode"
          :items="displayItems"
          :loading="globalSearchMode ? globalSearchLoading : nav.loading.value"
          :selected-paths="selection.selectedPaths.value"
          :selection-mode="selection.selectionMode.value"
          :highlight-path="highlightPath"
          :empty-text="globalSearchMode ? '未找到匹配的文件' : '当前目录为空'"
          @row-click="handleRowClick"
          @row-dblclick="handleRowDblclick"
          @row-longpress="handleRowLongpress"
          @row-contextmenu="openContextMenu"
          @row-menu="openContextMenu"
          @toggle-select="selection.toggle"
        />

        <div
          v-if="globalSearchMode && !globalSearchReady && !globalSearchLoading"
          class="search-indexing"
        >
          索引构建中，已索引 {{ globalSearchIndexed }} 个文件...
        </div>
      </div>
    </div>

    <!-- 移动端批量操作条 -->
    <BatchActionBar
      v-if="selection.selectedCount.value > 0 && isMobile"
      mobile
      :count="selection.selectedCount.value"
      :all-files="batchAllFiles"
      @action="handleBatchAction"
      @clear="selection.clearSelection"
    />

    <!-- 移动端导航抽屉 -->
    <MobileNavDrawer
      v-model:show="navDrawerShow"
      :groups="nav.backendGroups.value"
      :backend-options="nav.backendOptions.value"
      :current-backend-id="nav.currentBackendId.value"
      :current-path="nav.currentPath.value"
      :load-children="nav.loadChildren"
      @navigate="
        (path, backendId) =>
          nav.navigateToSidebarPath({
            path,
            backend_id: backendId,
            name: '',
            type: '',
          })
      "
      @switch-backend="nav.switchBackend"
    />

    <!-- 上下文菜单 -->
    <FileContextMenu
      :show="ctxMenu.show"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :options="ctxOptions"
      @select="handleContextSelect"
      @close="ctxMenu.show = false"
    />

    <!-- 隐藏上传输入 -->
    <input
      ref="uploadInputRef"
      type="file"
      multiple
      class="upload-input"
      @change="handleUploadChange"
    />

    <!-- 转移 -->
    <TransferModal
      v-model:show="actions.transferModalShow.value"
      :path="actions.transferPath.value"
      :src-backend-id="nav.currentBackendId.value"
      :loading="actions.transferLoading.value"
      @submit="actions.submitTransfer"
    />

    <!-- 重命名 -->
    <NModal
      v-model:show="actions.renameDialog.value.show"
      title="重命名"
      preset="dialog"
      positive-text="确定"
      negative-text="取消"
      @positive-click="actions.submitRename"
    >
      <NForm>
        <NFormItem label="新文件名">
          <NInput v-model:value="actions.renameDialog.value.name" />
        </NFormItem>
      </NForm>
    </NModal>

    <!-- 新建目录 -->
    <NModal
      v-model:show="actions.mkdirDialog.value.show"
      title="新建目录"
      preset="dialog"
      positive-text="创建"
      negative-text="取消"
      @positive-click="actions.submitMkdir"
    >
      <NForm>
        <NFormItem label="目录名称">
          <NInput
            v-model:value="actions.mkdirDialog.value.name"
            placeholder="在当前目录下创建"
            @keyup.enter="actions.submitMkdir"
          />
        </NFormItem>
      </NForm>
    </NModal>

    <!-- 移动/复制目标选择 -->
    <DestPickerModal
      v-model:show="actions.moveCopyDialog.value.show"
      :title="
        actions.moveCopyDialog.value.mode === 'move' ? '移动到' : '复制到'
      "
      :count="actions.moveCopyDialog.value.items.length"
      :groups="nav.backendGroups.value"
      :current-backend-id="nav.currentBackendId.value"
      :current-path="nav.currentPath.value"
      :load-children="nav.loadChildren"
      @confirm="handleMoveCopyConfirm"
    />

    <!-- 硬链接查询配置 -->
    <NModal
      v-model:show="actions.hardlinkConfigShow.value"
      title="硬链接查询"
      preset="card"
      style="width: 480px; max-width: 92vw"
      :bordered="false"
      segmented
    >
      <NForm>
        <NFormItem label="目标文件">
          <NInput
            v-model:value="actions.hardlinkConfigForm.value.path"
            readonly
            size="small"
          />
        </NFormItem>
        <NFormItem label="搜索目录">
          <NInput
            v-model:value="actions.hardlinkConfigForm.value.dir"
            placeholder="留空则从文件所在目录搜索"
            size="small"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton
            size="small"
            @click="actions.hardlinkConfigShow.value = false"
          >
            取消
          </NButton>
          <NButton
            type="primary"
            size="small"
            @click="actions.submitHardlinkQuery"
          >
            查询
          </NButton>
        </div>
      </template>
    </NModal>

    <!-- 硬链接查询结果 -->
    <NModal
      v-model:show="actions.hardlinkModalShow.value"
      title="硬链接查询结果"
      preset="card"
      style="width: 520px; max-width: 92vw"
      :bordered="false"
      segmented
    >
      <NSpin :show="actions.hardlinkLoading.value">
        <div class="hardlink-list">
          <div class="hardlink-source">
            <div class="hardlink-section-label">源文件</div>
            <div class="hardlink-path">
              {{ actions.hardlinkSourceFile.value }}
            </div>
          </div>
          <div
            v-for="(links, name) in actions.hardlinkResult.value"
            :key="name"
          >
            <template v-if="links && links.length > 0">
              <div class="hardlink-section-label">
                找到 {{ links.length }} 个硬链接
              </div>
              <div class="hardlink-items">
                <div
                  v-for="link in links"
                  :key="link.file"
                  class="hardlink-item"
                >
                  <div class="hardlink-item-path">{{ link.filepath }}</div>
                  <div class="hardlink-item-name">{{ link.filename }}</div>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="hardlink-empty">
                未找到其他硬链接（该文件只有自身一个链接）
              </div>
            </template>
          </div>
        </div>
      </NSpin>
    </NModal>

    <!-- 删除确认 -->
    <NModal
      v-model:show="actions.deleteDialog.value.show"
      title="确认删除"
      preset="dialog"
      type="error"
      positive-text="删除"
      negative-text="取消"
      @positive-click="actions.confirmDelete"
    >
      <p v-if="actions.deleteDialog.value.items.length > 0">
        确定要删除以下 {{ actions.deleteDialog.value.items.length }} 项吗？
        <br />
        <strong
          v-for="item in actions.deleteDialog.value.items.slice(0, 5)"
          :key="item.path"
          class="delete-item"
        >
          {{ item.name }}
        </strong>
        <span v-if="actions.deleteDialog.value.items.length > 5">
          等 {{ actions.deleteDialog.value.items.length }} 项
        </span>
        <br />
        此操作不可恢复。
      </p>
    </NModal>

    <!-- 清理关联内容确认 -->
    <NModal
      v-model:show="actions.cleanupDialog.value.show"
      title="清理关联内容"
      preset="dialog"
      type="warning"
      positive-text="清理"
      negative-text="取消"
      :positive-button-props="{ loading: actions.cleanupLoading.value }"
      @positive-click="actions.handleCleanup"
    >
      <p v-if="actions.cleanupDialog.value.items.length > 0">
        将以
        <strong>{{ actions.cleanupDialog.value.items[0]?.name }}</strong>
        为锚点，清理其硬链接链上的全部关联内容：
      </p>
      <ul>
        <li>媒体库目标文件</li>
        <li>对应做种源文件（硬链接兄弟）</li>
        <li>关联的转移记录、下载记录</li>
        <li>下载器中的做种任务（含辅种）</li>
      </ul>
      <p>
        <span v-if="actions.cleanupResult.value">
          已删除文件 {{ actions.cleanupResult.value.deleted_files.length }} 个，
          转移记录 {{ actions.cleanupResult.value.deleted_transfer_logs }} 条，
          下载任务 +{{ actions.cleanupResult.value.deleted_torrents?.length || 0 }}。
        </span>
        <span v-else>仅删除同一 inode 硬链接链，不影响该作品其它版本。</span>
      </p>
    </NModal>

    <!-- 识别结果 -->
    <IdentifyResult
      v-model:show="actions.identifyResultShow.value"
      :loading="actions.identifyLoading.value"
      :result="actions.identifyResult.value"
    />

    <!-- 媒体库一致性校验结果 -->
    <NModal
      v-model:show="consistencyModalVisible"
      title="媒体库一致性校验结果"
      preset="dialog"
      type="info"
      positive-text="知道了"
    >
      <p>
        共检查 <strong>{{ consistencyResult?.checked ?? 0 }}</strong> 条转移记录，
        已修正 <strong>{{ consistencyResult?.fixed ?? 0 }}</strong> 条，
        丢失 <strong>{{ consistencyResult?.missing ?? 0 }}</strong> 条。
      </p>
      <template v-if="(consistencyResult?.missing_records?.length || 0) > 0">
        <p class="mt-2 text-sm text-muted-foreground">
          以下记录的目标文件在磁盘上未找到，且无法定位移动后的新位置：
        </p>
        <ul class="mt-1 max-h-60 list-disc overflow-auto pl-5 text-sm">
          <li
            v-for="item in consistencyResult!.missing_records"
            :key="item.id"
          >
            {{ item.expected }}
          </li>
        </ul>
      </template>
    </NModal>

    <!-- 文件关系分析（源/媒体库存在性 + 硬链接指向） -->
    <NModal
      v-model:show="relationModalVisible"
      title="文件关系分析"
      preset="card"
      class="relation-modal"
      :style="{ width: '860px', maxWidth: '95vw' }"
    >
      <div class="relation-tabs mb-2">
        <NButton
          size="small"
          :type="relationTab === 'relation' ? 'primary' : 'default'"
          @click="switchRelationTab('relation')"
        >
          关系分析
        </NButton>
        <NButton
          size="small"
          :type="relationTab === 'orphan' ? 'primary' : 'default'"
          @click="switchRelationTab('orphan')"
        >
          孤儿源文件 ({{ orphanTotal }})
        </NButton>
      </div>

      <!-- 关系分析视图 -->
      <div v-if="relationTab === 'relation'">
        <div class="relation-toolbar">
          <NSelect
            v-model:value="relationState"
            :options="relationStateOptions"
            size="small"
            clearable
            class="relation-filter"
            @update:value="onRelationStateChange"
          />
          <NInput
            v-model:value="relationSearch"
            size="small"
            clearable
            placeholder="搜索标题/文件名..."
            @keyup.enter="onRelationSearch"
            @clear="onRelationSearch"
          />
          <span class="relation-total">
            共 {{ relationTotal }} 条
            <span v-if="relationStateCounts.only_source">
              · 只有源 {{ relationStateCounts.only_source }}
            </span>
            <span v-if="relationStateCounts.only_dest">
              · 只有媒体库 {{ relationStateCounts.only_dest }}
            </span>
          </span>
        </div>

        <NSpin :show="relationLoading">
          <div v-if="!relationLoading && relations.length === 0" class="relation-empty">
          未找到相关记录
        </div>
        <div v-for="rel in relations" :key="rel.id" class="relation-card">
          <div class="relation-head" @click="toggleRelation(rel.id)">
            <NTag :type="relationTagType(rel.state)" size="small">
              {{ relationStateLabel(rel.state) }}
            </NTag>
            <span class="relation-title">{{ rel.title }} ({{ rel.year }})</span>
            <span v-if="rel.season_episode" class="relation-season">
              {{ rel.season_episode }}
            </span>
            <NButton
              size="tiny"
              quaternary
              class="ml-auto"
              @click.stop="openMigrateFor(rel.tmdb_id)"
            >
              <template #icon>
                <IconifyIcon icon="lucide:hard-drive" class="size-3.5" />
              </template>
              迁移
            </NButton>
            <span class="relation-arrow">
              {{ relationExpanded === rel.id ? '▲' : '▼' }}
            </span>
          </div>
          <div v-if="relationExpanded === rel.id" class="relation-detail">
            <div class="relation-file">
              <span class="relation-side">源文件</span>
              <span :class="rel.source.exists ? 'ok' : 'miss'">
                {{ rel.source.exists ? '✓ 存在' : '✗ 缺失' }}
              </span>
              <span class="relation-path">{{ rel.source.full_path || '—' }}</span>
              <div v-if="rel.source.hardlinks?.length" class="relation-links">
                硬链接 ➜
                <span
                  v-for="(link, i) in rel.source.hardlinks"
                  :key="i"
                  class="relation-link"
                >
                  {{ link }}
                </span>
              </div>
            </div>
            <div class="relation-file">
              <span class="relation-side">媒体库</span>
              <span :class="rel.dest.exists ? 'ok' : 'miss'">
                {{ rel.dest.exists ? '✓ 存在' : '✗ 缺失' }}
              </span>
              <span class="relation-path">{{ rel.dest.full_path || '—' }}</span>
              <div v-if="rel.dest.hardlinks?.length" class="relation-links">
                硬链接 ➜
                <span
                  v-for="(link, i) in rel.dest.hardlinks"
                  :key="i"
                  class="relation-link"
                >
                  {{ link }}
                </span>
              </div>
            </div>
          </div>
        </div>

          <div v-if="relationTotal > relationPageSize" class="relation-pagination">
            <NPagination
              v-model:page="relationPage"
              :page-size="relationPageSize"
              :item-count="relationTotal"
              @update:page="onRelationPageChange"
            />
          </div>
        </NSpin>
      </div>

      <!-- 孤儿源文件视图 -->
      <div v-else>
        <NSpin :show="orphanLoading">
          <div v-if="!orphanLoading && orphanItems.length === 0" class="relation-empty">
            无孤儿源文件（源文件均有对应下载做种任务）
          </div>
          <div v-for="item in orphanItems" :key="item.id" class="relation-card">
            <div class="relation-head" @click="openMigrateFor(item.tmdb_id)">
              <NTag type="error" size="small">孤儿源</NTag>
              <span class="relation-title">{{ item.title }} ({{ item.year }})</span>
              <span v-if="item.season_episode" class="relation-season">
                {{ item.season_episode }}
              </span>
              <NButton
                size="tiny"
                quaternary
                class="ml-auto"
                @click.stop="openMigrateFor(item.tmdb_id)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:hard-drive" class="size-3.5" />
                </template>
                处理
              </NButton>
            </div>
            <div class="relation-detail">
              <div class="relation-file">
                <span class="relation-side">源文件</span>
                <span class="miss">✗ 无下载任务</span>
                <span class="relation-path">{{ item.source_full }}</span>
              </div>
            </div>
          </div>
        </NSpin>
      </div>
    </NModal>

    <!-- 作品级跨盘迁移 -->
    <MediaMigrateModal
      v-model:show="migrateModalShow"
      :tmdb-id="migrateTmdbId"
      @success="loadRelations"
    />
  </div>
</template>

<style scoped>
.file-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
}

.file-manager-body {
  display: flex;
  flex: 1;
  gap: 1rem;
  min-height: 0;
}

.sidebar {
  flex-shrink: 0;
  width: 260px;
  padding: 0.5rem;
  overflow-y: auto;
}

.main-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background-color: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--tblr-card-border-radius);
}

.search-status {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 1rem;
  font-size: 0.85rem;
  color: hsl(var(--muted-foreground));
  background-color: var(--tblr-primary-light);
  border-bottom: 1px solid hsl(var(--border));
}

.search-indexing {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.upload-input {
  display: none;
}

.delete-item {
  display: block;
  font-size: 0.85rem;
  word-break: break-all;
}

.hardlink-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hardlink-section-label {
  margin-bottom: 0.375rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.hardlink-source {
  padding: 0.75rem;
  background-color: hsl(var(--accent) / 50%);
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
}

.hardlink-path {
  font-size: 0.85rem;
  line-height: 1.4;
  color: hsl(var(--card-foreground));
  word-break: break-all;
}

.hardlink-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hardlink-item {
  padding: 0.5rem 0.75rem;
  background-color: hsl(var(--accent) / 30%);
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
}

.hardlink-item-path {
  font-size: 0.75rem;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
  word-break: break-all;
}

.hardlink-item-name {
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.4;
  color: hsl(var(--card-foreground));
  word-break: break-all;
}

.hardlink-empty {
  padding: 1rem;
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
  text-align: center;
  background-color: hsl(var(--accent) / 30%);
  border: 1px dashed hsl(var(--border));
  border-radius: 0.5rem;
}

@media (max-width: 767px) {
  .file-manager {
    padding: 0.5rem;
  }

  .main-content {
    border-radius: 0.375rem;
  }
}

/* ========== 多版本 / 重复文件 ========== */
.dup-entry {
  display: flex;
  justify-content: flex-end;
  padding: 0.25rem 0.5rem;
}

.dup-list {
  padding: 0.5rem;
}

.dup-empty {
  padding: 1.5rem;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.dup-card {
  margin-bottom: 0.5rem;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
}

.dup-head {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  background: hsl(var(--card));
}

.dup-head:hover {
  background: hsl(var(--accent));
}

.dup-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: hsl(var(--card-foreground));
}

.dup-year {
  margin-left: 0.375rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.dup-meta {
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.dup-versions {
  border-top: 1px solid hsl(var(--border));
}

.dup-version {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid hsl(var(--border));
}

.dup-version:last-child {
  border-bottom: none;
}

.dup-version-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.dup-spec {
  font-size: 0.75rem;
  font-weight: 600;
  color: hsl(var(--primary));
}

.dup-file {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.8125rem;
  color: hsl(var(--card-foreground));
  white-space: nowrap;
}

.dup-state {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.dup-season {
  color: hsl(var(--muted-foreground));
}

.relation-modal {
  .n-card {
    max-height: 80vh;
  }
}

.relation-tabs {
  display: flex;
  gap: 0.5rem;
}

.relation-toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;

  .relation-filter {
    width: 180px;
    flex-shrink: 0;
  }

  .n-input {
    width: 220px;
  }

  .relation-total {
    margin-left: auto;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }
}

.relation-empty {
  padding: 2rem;
  text-align: center;
  color: hsl(var(--muted-foreground));
}

.relation-card {
  margin-bottom: 0.5rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
}

.relation-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.375rem 0.5rem;
  cursor: pointer;

  &:hover {
    background-color: hsl(var(--accent));
  }
}

.relation-title {
  font-weight: 500;
  color: hsl(var(--card-foreground));
}

.relation-season {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.relation-arrow {
  margin-left: auto;
  font-size: 0.7rem;
  color: hsl(var(--muted-foreground));
}

.relation-detail {
  padding: 0.375rem 0.75rem 0.5rem;
  background-color: hsl(var(--muted) / 30%);
}

.relation-file {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.125rem 0;
  font-size: 0.8125rem;
  flex-wrap: wrap;
}

.relation-side {
  flex-shrink: 0;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  width: 3.5rem;
}

.relation-file .ok {
  color: hsl(var(--success) / 80%);
}

.relation-file .miss {
  color: hsl(var(--error) / 80%);
}

.relation-path {
  color: hsl(var(--card-foreground));
  word-break: break-all;
}

.relation-links {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  width: 100%;
  margin-top: 2px;
  color: hsl(var(--muted-foreground));
}

.relation-link {
  padding: 0 0.25rem;
  font-size: 0.75rem;
  color: hsl(var(--primary));
  background-color: hsl(var(--primary) / 10%);
  border-radius: 0.25rem;
  word-break: break-all;
}

.relation-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}
</style>

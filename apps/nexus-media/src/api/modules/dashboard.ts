/**
 * 仪表盘聚合 API
 * 整合媒体库、站点、刷流、下载、调度、入库统计等数据
 */
import type { SiteApi } from '#/api/modules/site';

import { requestClient } from '#/api/request';

export namespace DashboardApi {
  export interface TransferStatistics {
    labels: string[];
    movie_nums: number[];
    tv_nums: number[];
    anime_nums: number[];
    tv_series_nums: number[];
  }

  export interface LibraryHome {
    server_success: boolean;
    media_counts: Record<string, number | string>;
    activitys: any[];
    library_spaces: {
      FreeSpace: string;
      TotalSpace: string;
      UsedPercent: number;
      UsedSpace: string;
    };
    librarys: any[];
    resumes: any[];
    latests: any[];
  }

  /**
   * 站点统计项。
   *
   * 直接复用 SiteApi.SiteStatisticsItem：与 /site/sites/statistics 是同一接口，
   * 此前在本文件重复声明且把 upload/download/ratio/seeding_size/bonus 写成了
   * number，而后端实际返回格式化字符串（"1.23 GB" / "100.50"），
   * 按该类型做数值运算会得到 NaN。
   */
  export type SiteStatisticsItem = SiteApi.SiteStatisticsItem;

  export interface IndexerStatistics {
    stats: Array<{
      avg: number;
      fail: number;
      name: string;
      success: number;
      total: number;
    }>;
    dataset: any[];
  }

  export interface BrushTask {
    id: string;
    name: string;
    state: string;
    site: string;
    downloader: string;
    size: string;
    dlcount: number;
    transfer: number;
  }

  export interface SchedulerJob {
    id: string;
    name: string;
    paused: boolean;
    next_run_time?: string;
    trigger_type: string;
  }
}

/** 获取媒体库首页聚合数据 */
export async function getDashboardLibraryApi() {
  return requestClient.post<DashboardApi.LibraryHome>(
    '/media/library/home',
    {},
    // 媒体库聚合较慢，放宽超时避免请求超时
    { timeout: 120_000 },
  );
}

/** 获取入库统计（最近30天） */
export async function getDashboardTransferStatsApi(days = 30) {
  return requestClient.post<DashboardApi.TransferStatistics>(
    '/media/transfer/statistics',
    { days },
  );
}

/** 获取站点统计 */
export async function getDashboardSiteStatsApi() {
  return requestClient.post<DashboardApi.SiteStatisticsItem[]>(
    '/site/sites/statistics',
    {},
  );
}

/** 获取索引器/下载统计 */
export async function getDashboardIndexerStatsApi() {
  return requestClient.post<DashboardApi.IndexerStatistics>(
    '/download/indexers/statistics',
    {},
  );
}

/** 获取刷流任务列表 */
export async function getDashboardBrushTasksApi() {
  return requestClient.post<DashboardApi.BrushTask[]>('/brush/tasks', {});
}

/** 获取调度任务列表 */
export async function getDashboardSchedulerJobsApi() {
  return requestClient.post<DashboardApi.SchedulerJob[]>('/scheduler/jobs', {});
}

/** 获取系统状态 */
export async function getDashboardSystemStatusApi() {
  return requestClient.post<{
    cpu_percent: number;
    memory_percent: number;
    memory_total_mb: number;
    memory_used_mb: number;
    python_version: string;
    uptime: number;
    version: string;
  }>('/system/status', {});
}

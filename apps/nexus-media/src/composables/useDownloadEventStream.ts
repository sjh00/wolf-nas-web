import type { DownloadEvent } from '#/api';

import { ref } from 'vue';

import { useMessage } from 'naive-ui';

import { subscribeDownloadEventsApi } from '#/api';

export function useDownloadEventStream(onCompleted?: () => void) {
  const sseAbortController = ref<AbortController | null>(null);
  const connected = ref(false);
  const stopped = ref(false);
  const generation = ref(0);
  const message = useMessage();

  function stop() {
    stopped.value = true;
    generation.value += 1;
    if (sseAbortController.value) {
      sseAbortController.value.abort();
      sseAbortController.value = null;
      connected.value = false;
    }
  }

  function start() {
    stop();
    stopped.value = false;
    const myGen = generation.value;
    sseAbortController.value = new AbortController();

    subscribeDownloadEventsApi(
      {
        onEnd: () => {
          connected.value = false;
          if (stopped.value || myGen !== generation.value) return;
          setTimeout(() => {
            if (!stopped.value && myGen === generation.value) start();
          }, 3000);
        },
        onEvent: (event: DownloadEvent) => {
          switch (event.event) {
            case 'download.completed': {
              connected.value = true;
              message.success(
                `下载完成: ${event.data.name || event.data.task_id || ''}`,
              );
              onCompleted?.();
              break;
            }
            case 'download.failed': {
              connected.value = true;
              message.error(
                `下载失败: ${event.data.title || ''} — ${event.data.reason || ''}`,
              );
              break;
            }
            case 'download.started': {
              connected.value = true;
              message.success(
                `下载开始: ${event.data.title || ''} (${event.data.download_id || ''})`,
              );
              onCompleted?.();
              break;
            }
            default: {
              break;
            }
          }
        },
      },
      sseAbortController.value.signal,
    ).catch(() => {
      connected.value = false;
    });
  }

  return { connected, start, stop };
}

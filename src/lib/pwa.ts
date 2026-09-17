import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';
import { useAppStore } from '../stores/app-store';

export const usePwaStore = create(() => ({
  offlineReady: false,
  updateAvailable: false,
  reloadReady: false,
  updating: false,
  error: '',
}));

let activateUpdate: (() => Promise<void>) | undefined;
let requestedUpdate = false;

function updateActivated() {
  usePwaStore.setState({ reloadReady: true, updateAvailable: true, updating: false });
  // Another tab can activate an update. Only reload this tab after its own explicit
  // request, and check again in case a game started while activation was pending.
  if (requestedUpdate && !useAppStore.getState().credentials) window.location.reload();
  requestedUpdate = false;
}

/** Called once at startup, outside React's StrictMode mount cycle. */
export function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) updateActivated();
    controlled = true;
  });
  activateUpdate = registerSW({
    onNeedRefresh: () => usePwaStore.setState({ updateAvailable: true }),
    onNeedReload: updateActivated,
    onOfflineReady: () => usePwaStore.setState({ offlineReady: true, error: '' }),
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      if (registration.active) usePwaStore.setState({ offlineReady: true });
      // Installed apps may remain open for days. Check again on return/reconnect.
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible')
          void registration.update().catch(() => {
            /* Keep the current offline version usable. */
          });
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
    },
    onRegisterError(error: unknown) {
      console.warn('PWA registration failed', error);
      usePwaStore.setState({ error: '暫時未能準備離線使用，請連線後重新開啟棋聚。' });
    },
  });
}

export async function applyPwaUpdate() {
  if (useAppStore.getState().credentials || usePwaStore.getState().updating) return;
  if (usePwaStore.getState().reloadReady) {
    window.location.reload();
    return;
  }
  if (!activateUpdate) return;
  requestedUpdate = true;
  usePwaStore.setState({ updating: true, error: '' });
  try {
    await activateUpdate();
  } catch {
    requestedUpdate = false;
    usePwaStore.setState({ updating: false, error: '更新未完成，請稍後再試。' });
  }
}

import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyPwaUpdate, usePwaStore } from '../lib/pwa';
import { useOnline } from '../lib/use-online';
import { useAppStore } from '../stores/app-store';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}

export function PwaControls() {
  const inRoom = useAppStore((s) => !!s.credentials);
  const online = useOnline();
  const { offlineReady, updateAvailable, updating, error } = usePwaStore();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [installing, setInstalling] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [installError, setInstallError] = useState('');
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };
    const onDisplayChange = () => setInstalled(isStandalone());
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const install = async () => {
    if (!installPrompt || installing) return;
    setInstalling(true);
    setInstallError('');
    try {
      const { outcome } = await installPrompt.prompt();
      if (outcome === 'accepted') setInstalled(true);
    } catch {
      setInstallError('請使用瀏覽器選單安裝棋聚。');
    } finally {
      // A browser-provided prompt can only be used once, including after dismissal.
      setInstallPrompt(null);
      setInstalling(false);
    }
  };

  return (
    <>
      {!online && (
        <output className="pwa-offline">
          <WifiOff size={16} aria-hidden="true" />
          目前離線；同機真人對戰可繼續，好友連線與 AI 對戰需要網絡。
        </output>
      )}
      {!inRoom && (
        <div className="pwa-controls">
          <div className="pwa-status" aria-live="polite">
            {error ||
              installError ||
              (updateAvailable
                ? '有新版本，準備好再更新。'
                : offlineReady
                  ? '已可離線玩同機真人對戰'
                  : '')}
          </div>
          {updateAvailable && (
            <button
              className="pwa-action"
              onClick={() => void applyPwaUpdate()}
              disabled={updating}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {updating ? '更新中…' : '更新並重新載入'}
            </button>
          )}
          {!installed && window.isSecureContext && (installPrompt || ios) && (
            <button
              className="pwa-action"
              disabled={installing}
              aria-expanded={ios && !installPrompt ? showHelp : undefined}
              aria-controls={ios && !installPrompt ? 'pwa-install-help' : undefined}
              onClick={() => (installPrompt ? void install() : setShowHelp(!showHelp))}
            >
              <Download size={15} aria-hidden="true" />
              安裝棋聚
            </button>
          )}
          {showHelp && !installed && (
            <p className="pwa-install-help" id="pwa-install-help">
              在瀏覽器點「分享」，選「加入主畫面」，即可從主畫面開啟棋聚。 如有「以網頁 App
              開啟」選項，請保持開啟。
            </p>
          )}
        </div>
      )}
    </>
  );
}

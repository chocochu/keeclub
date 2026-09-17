import { Check, CircleHelp, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';
export function ErrorBanner() {
  const error = useAppStore((s) => s.error),
    setError = useAppStore((s) => s.setError);
  if (!error) return null;
  return (
    <div className="error-banner" role="alert">
      <CircleHelp size={18} />
      <span>{error}</span>
      <button aria-label="關閉錯誤提示" onClick={() => setError('')}>
        <X size={16} />
      </button>
    </div>
  );
}
export function Toast() {
  const notice = useAppStore((s) => s.notice),
    notify = useAppStore((s) => s.notify);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(''), 3500);
    return () => clearTimeout(timer);
  }, [notice, notify]);
  return notice ? (
    <output className="toast">
      <Check size={18} />
      {notice}
    </output>
  ) : null;
}

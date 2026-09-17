import { useState } from 'react';
import { Flag } from 'lucide-react';
export function ResignButton({ onResign, disabled }: { onResign: () => void; disabled: boolean }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <div className="resign-confirm">
        <span>確定認輸這局？</span>
        <button
          disabled={disabled}
          onClick={() => {
            onResign();
            setConfirm(false);
          }}
        >
          確定
        </button>
        <button onClick={() => setConfirm(false)}>取消</button>
      </div>
    );
  return (
    <button className="resign-button" disabled={disabled} onClick={() => setConfirm(true)}>
      <Flag size={14} />
      認輸這一局
    </button>
  );
}

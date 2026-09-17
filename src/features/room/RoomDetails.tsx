import { Copy } from 'lucide-react';
import type { RoomView } from '../../../shared/contracts';
import { copyInvite } from './copy-invite';
export function RoomDetails({ room }: { room: RoomView }) {
  if (room.mode !== 'friend') return null;
  return (
    <section className="room-details" aria-label="房間邀請">
      <div className="room-code">
        <span>房間碼</span>
        <strong>{room.code}</strong>
        {room.ready && (
          <button onClick={() => void copyInvite(room.code)} aria-label="複製房間邀請">
            <Copy size={17} />
          </button>
        )}
      </div>
    </section>
  );
}

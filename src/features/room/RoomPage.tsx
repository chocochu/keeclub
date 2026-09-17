import { useState } from 'react';
import { canResign } from '../../../shared/game';
import type { Credentials, RoomCommand, RoomView } from '../../../shared/contracts';
import { useAppStore } from '../../stores/app-store';
import { GameTable } from './GameTable';
import { MoveHistory } from './MoveHistory';
import { ResignButton } from './ResignButton';
import { RoomDetails } from './RoomDetails';
import { TurnPanel } from './TurnPanel';
import { isMyTurn } from './selectors';
import { useRoomAction } from './use-room-action';
import { useFlightPlayback } from './use-flight-playback';
import { WinConfetti } from './WinConfetti';
import { RulesPanel } from '../../components/RulesPanel';

export function RoomPage({ room, credentials }: { room: RoomView; credentials: Credentials }) {
  const [keyboardAction, setKeyboardAction] = useState(false);
  const playback = useFlightPlayback(room, credentials, keyboardAction);
  const displayRoom = playback.room;
  const connected = useAppStore((s) => s.connection === 'connected');
  const rules = useAppStore((s) => s.rules);
  const mutation = useRoomAction(credentials),
    busy = mutation.isPending;
  const myTurn = isMyTurn(room);
  const canPlay =
    room.ready &&
    connected &&
    !busy &&
    !playback.playing &&
    !room.thinking &&
    myTurn &&
    room.game.winner === null;
  const action = (command: RoomCommand) => {
    if (!busy) mutation.mutate(command);
  };
  return (
    <>
      <WinConfetti game={displayRoom.game} />
      <div
        className={`play-layout ${room.kind} ${room.ready ? '' : 'waiting'}`}
        data-instant-motion={
          (room.kind !== 'flight' && keyboardAction) ||
          (room.kind === 'flight' && playback.instant) ||
          undefined
        }
        data-flight-playing={playback.playing || undefined}
        data-flight-phase={playback.phase}
        onPointerDownCapture={() => setKeyboardAction(false)}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setKeyboardAction(true);
        }}
      >
        <GameTable
          key={room.code}
          room={displayRoom}
          motionMs={playback.motionMs}
          leap={playback.leap}
          landing={playback.landing}
          moves={canPlay ? room.moves : []}
          action={action}
        />
        <aside className="room-sidebar">
          <TurnPanel
            room={displayRoom}
            busy={busy || playback.playing}
            playbackPhase={playback.phase}
            landing={playback.landing}
            canPlay={canPlay}
            myTurn={isMyTurn(displayRoom)}
            action={action}
            rolling={busy && mutation.variables?.type === 'roll'}
            instantMotion={room.kind === 'flight' ? playback.instant : keyboardAction}
          />
          <RoomDetails room={room} />
          {room.ready && <MoveHistory game={displayRoom.game} />}
          {room.ready &&
            canResign(room.game, room.mode === 'local' ? room.game.turn : room.side) && (
              <ResignButton
                disabled={
                  busy || !connected || (room.mode === 'local' && (!myTurn || playback.playing))
                }
                onResign={() => action({ type: 'resign' })}
              />
            )}
        </aside>
      </div>
      {rules && (
        <RulesPanel
          kind={room.kind}
          jungleSettings={room.game.jungleSettings}
          flightSettings={room.game.flightSettings}
        />
      )}
    </>
  );
}

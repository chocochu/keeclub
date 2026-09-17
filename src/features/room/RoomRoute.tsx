import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import type { Credentials } from '../../../shared/contracts';
import { ApiError } from '../../lib/api';
import { roomQuery } from '../../lib/query-client';
import { forgetCredentials } from '../../lib/storage';
import { useAppStore } from '../../stores/app-store';
import { RoomPage } from './RoomPage';
import { useRoomConnection } from './use-room-connection';

export function RoomRoute({ credentials }: { credentials: Credentials }) {
  const query = useQuery(roomQuery(credentials));
  const home = useAppStore((s) => s.home);
  useRoomConnection(credentials);
  useEffect(() => {
    if (query.error instanceof ApiError && [401, 404].includes(query.error.status)) {
      forgetCredentials(credentials.code);
      useAppStore.getState().setError(query.error.message);
      useAppStore.getState().requireRejoin(credentials.code);
    }
  }, [query.error, credentials.code]);
  const kind = query.data?.kind;
  useEffect(() => {
    if (kind) useAppStore.getState().setKind(kind);
  }, [kind]);
  if (query.data)
    return <RoomPage key={credentials.code} room={query.data} credentials={credentials} />;
  return (
    <div className="loading-room">
      {query.isError ? (
        <>
          <span>{query.error.message}</span>
          <button onClick={() => void query.refetch()}>
            <RotateCcw size={16} />
            重試連線
          </button>
        </>
      ) : (
        <>
          <LoaderCircle className="spin" />
          正在找回你的棋局…
        </>
      )}
      <button onClick={home}>返回大廳</button>
    </div>
  );
}

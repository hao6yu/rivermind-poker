import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import { renewMultiplayerSeatLiveness } from '../../services/multiplayer';
import { MULTIPLAYER_LIVENESS_HEARTBEAT_MS } from './multiplayerLifecycleUi';

type HeartbeatRoom = Pick<MultiplayerViewerProjection, 'roomId' | 'status' | 'viewerPlayerId' | 'seats'>;

/** Presence belongs to the entire open room, including its ready-up lobby. */
export function useMultiplayerSeatLiveness({ room, enabled, onReconnect }: {
  room: HeartbeatRoom | null;
  enabled: boolean;
  onReconnect: () => Promise<unknown>;
}): void {
  const latest = useRef({ room, onReconnect });
  useEffect(() => { latest.current = { room, onReconnect }; }, [room, onReconnect]);
  const active = enabled && room !== null && room.status !== 'complete';
  const roomId = room?.roomId;
  useEffect(() => {
    if (!active || !roomId) return;
    let disposed = false;
    let inFlight = false;
    let foreground = AppState.currentState === 'active';
    const beat = async () => {
      if (disposed || inFlight || !foreground) return;
      inFlight = true;
      try {
        await renewMultiplayerSeatLiveness(roomId);
        if (disposed || !foreground) return;
        const current = latest.current.room;
        const ownSeat = current?.seats.find((seat) => seat.playerId === current.viewerPlayerId);
        if (current?.roomId === roomId && ownSeat?.participation !== 'left'
          && (ownSeat?.participation === 'disconnected' || ownSeat?.connection === 'offline')) {
          // Restore transport, not an intentional Sit out. The owner's online
          // command preserves that choice and all existing decision deadlines.
          await latest.current.onReconnect();
        }
      } catch {
        // Existing transport UI owns errors. A rejected beat cannot renew
        // the server stamp, and the next interval retries without overlap.
      } finally {
        inFlight = false;
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) void beat();
    });
    const timer = setInterval(() => { void beat(); }, MULTIPLAYER_LIVENESS_HEARTBEAT_MS);
    void beat();
    return () => { disposed = true; clearInterval(timer); subscription.remove(); };
  }, [active, roomId]);
}

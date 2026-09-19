import { useSyncExternalStore, useCallback } from 'react';
import { steeringManager, QueueItem } from '@my-agent/core';

export interface UseAgentSteeringReturn {
  steeringQueue: QueueItem[];
  followUpQueue: QueueItem[];
  steer: (content: string) => QueueItem;
  followUp: (content: string) => QueueItem;
  popSteer: () => QueueItem | undefined;
  popFollowUp: () => QueueItem | undefined;
  clearSteering: () => void;
  clearFollowUp: () => void;
  clearAll: () => void;
  hasSteering: boolean;
  hasFollowUp: boolean;
}

/**
 * Pi-Style Steering and Follow-up Queue Hook
 * useSyncExternalStore ile sıfır polling maliyetiyle kuyrukları reaktif olarak izler.
 */
export function useAgentSteering(): UseAgentSteeringReturn {
  const steeringQueue = useSyncExternalStore(
    (cb) => steeringManager.subscribe(cb),
    () => steeringManager.getSteeringQueue(),
    () => []
  );

  const followUpQueue = useSyncExternalStore(
    (cb) => steeringManager.subscribe(cb),
    () => steeringManager.getFollowUpQueue(),
    () => []
  );

  const steer = useCallback((content: string) => steeringManager.steer(content), []);
  const followUp = useCallback((content: string) => steeringManager.followUp(content), []);
  const popSteer = useCallback(() => steeringManager.popSteer(), []);
  const popFollowUp = useCallback(() => steeringManager.popFollowUp(), []);
  const clearSteering = useCallback(() => steeringManager.clearSteering(), []);
  const clearFollowUp = useCallback(() => steeringManager.clearFollowUp(), []);
  const clearAll = useCallback(() => steeringManager.clearAll(), []);

  return {
    steeringQueue,
    followUpQueue,
    steer,
    followUp,
    popSteer,
    popFollowUp,
    clearSteering,
    clearFollowUp,
    clearAll,
    hasSteering: steeringQueue.length > 0,
    hasFollowUp: followUpQueue.length > 0,
  };
}

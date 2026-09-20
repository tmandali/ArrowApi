import { useCallback, useState, useEffect } from 'react';
import { AgentSession, QueueItem } from '@my-agent/core';

export interface UseAgentSteeringOptions {
  session?: AgentSession;
}

export interface UseAgentSteeringReturn {
  steeringQueue: QueueItem[];
  followUpQueue: QueueItem[];
  steer: (content: string) => void;
  followUp: (content: string) => void;
  popSteer: () => any | undefined;
  popFollowUp: () => any | undefined;
  clearSteering: () => void;
  clearFollowUp: () => void;
  clearAll: () => void;
  hasSteering: boolean;
  hasFollowUp: boolean;
}

/**
 * Pi-Style Steering and Follow-up Queue Hook
 * Doğrudan AgentSession nesnesine bağlanır ve queue_update olaylarıyla reaktif güncellenir.
 */
export function useAgentSteering(options: UseAgentSteeringOptions = {}): UseAgentSteeringReturn {
  const session = options.session;
  const [steeringQueue, setSteeringQueue] = useState<QueueItem[]>(() => session?.getSteeringQueue() || []);
  const [followUpQueue, setFollowUpQueue] = useState<QueueItem[]>(() => session?.getFollowUpQueue() || []);

  useEffect(() => {
    if (!session) return;
    const unsub = session.subscribe((e) => {
      if (e.type === 'queue_update' || e.type === 'session_start' || e.type === 'agent_end') {
        setSteeringQueue([...session.getSteeringQueue()]);
        setFollowUpQueue([...session.getFollowUpQueue()]);
      }
    });
    return () => unsub();
  }, [session]);

  const steer = useCallback((content: string) => {
    if (session) {
      session.steer(content);
      setSteeringQueue([...session.getSteeringQueue()]);
    }
  }, [session]);

  const followUp = useCallback((content: string) => {
    if (session) {
      session.followUp(content);
      setFollowUpQueue([...session.getFollowUpQueue()]);
    }
  }, [session]);

  const popSteer = useCallback(() => {
    if (!session) return undefined;
    const res = session.popSteer();
    setSteeringQueue([...session.getSteeringQueue()]);
    return res;
  }, [session]);

  const popFollowUp = useCallback(() => {
    if (!session) return undefined;
    const res = session.popFollowUp();
    setFollowUpQueue([...session.getFollowUpQueue()]);
    return res;
  }, [session]);

  const clearSteering = useCallback(() => {
    if (session) {
      session.clearSteering();
      setSteeringQueue([]);
    }
  }, [session]);

  const clearFollowUp = useCallback(() => {
    if (session) {
      session.clearFollowUp();
      setFollowUpQueue([]);
    }
  }, [session]);

  const clearAll = useCallback(() => {
    if (session) {
      session.clearQueue();
      setSteeringQueue([]);
      setFollowUpQueue([]);
    }
  }, [session]);

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

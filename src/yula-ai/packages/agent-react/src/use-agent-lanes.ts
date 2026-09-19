import { useSyncExternalStore, useCallback } from 'react';
import { multiLaneScheduler, AgentLane } from '@my-agent/core';

export function useAgentLanes() {
  const statuses = useSyncExternalStore(
    (callback) => multiLaneScheduler.subscribe(callback),
    () => multiLaneScheduler.getAllStatus(),
    () => multiLaneScheduler.getAllStatus()
  );

  const runInLane = useCallback(
    async <T>(lane: AgentLane, description: string, execute: () => Promise<T>): Promise<T> => {
      return multiLaneScheduler.enqueue(lane, description, execute);
    },
    []
  );

  const pauseLane = useCallback((lane: AgentLane) => {
    multiLaneScheduler.pauseLane(lane);
  }, []);

  const resumeLane = useCallback((lane: AgentLane) => {
    multiLaneScheduler.resumeLane(lane);
  }, []);

  return {
    statuses,
    runInLane,
    pauseLane,
    resumeLane,
  };
}

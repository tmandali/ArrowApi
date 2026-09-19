import { useState, useEffect } from 'react';
import { multiLaneScheduler, AgentLane, LaneStatus } from '@my-agent/core';

export function useAgentLanes() {
  const [statuses, setStatuses] = useState<Record<AgentLane, LaneStatus>>(() =>
    multiLaneScheduler.getAllStatus()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setStatuses(multiLaneScheduler.getAllStatus());
    }, 200);

    return () => clearInterval(interval);
  }, []);

  const runInLane = async <T>(lane: AgentLane, description: string, execute: () => Promise<T>): Promise<T> => {
    return multiLaneScheduler.enqueue(lane, description, execute);
  };

  const pauseLane = (lane: AgentLane) => {
    multiLaneScheduler.pauseLane(lane);
    setStatuses(multiLaneScheduler.getAllStatus());
  };

  const resumeLane = (lane: AgentLane) => {
    multiLaneScheduler.resumeLane(lane);
    setStatuses(multiLaneScheduler.getAllStatus());
  };

  return {
    statuses,
    runInLane,
    pauseLane,
    resumeLane,
  };
}

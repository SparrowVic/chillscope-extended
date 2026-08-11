/// <reference lib="webworker" />
import { runSimulation, type SimulationWorkerRequest } from './worker-client';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', ({ data }: MessageEvent<SimulationWorkerRequest>) => {
  scope.postMessage(runSimulation(data));
});

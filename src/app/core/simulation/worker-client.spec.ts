import { describe, expect, it } from 'vitest';
import { SimulationClient } from './worker-client';

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);
const SEED = 1337;
const REQUEST = { from: START, to: START + HOUR, series: ['temperature'] } as const;

/** A worker that accepts messages and never answers, so the client has to notice by itself. */
class SilentWorker {
  terminated = false;
  posted = 0;
  readonly messages: unknown[] = [];
  readonly #listeners = new Map<string, ((event: unknown) => void)[]>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  postMessage(message: unknown): void {
    this.posted++;
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function clientWith(worker: SilentWorker, timeoutMs: number): SimulationClient {
  return new SimulationClient({
    seed: SEED,
    timeoutMs,
    createWorker: () => worker as unknown as Worker,
  });
}

describe('SimulationClient', () => {
  it('runs on the main thread when no worker can be created', async () => {
    const client = new SimulationClient({ seed: SEED, createWorker: () => null });
    const [series] = await client.series(REQUEST);
    expect(series.t.length).toBeGreaterThan(0);
  });

  it('yields before running the main-thread fallback', async () => {
    const client = new SimulationClient({ seed: SEED, createWorker: () => null });
    let settled = false;
    const pending = client.series(REQUEST).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    await pending;
    expect(settled).toBe(true);
  });

  it('terminates current worker CPU work when a pending call aborts', async () => {
    const workers: SilentWorker[] = [];
    const client = new SimulationClient({
      seed: SEED,
      timeoutMs: 10_000,
      createWorker: () => {
        const worker = new SilentWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    const controller = new AbortController();
    const pending = client.series(REQUEST, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow('aborted');
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('replays other pending calls after an aborted request restarts the worker', async () => {
    const workers: SilentWorker[] = [];
    const client = new SimulationClient({
      seed: SEED,
      timeoutMs: 10_000,
      createWorker: () => {
        const worker = new SilentWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    const controller = new AbortController();
    const aborted = client.series(REQUEST, controller.signal);
    const wanted = client.series(REQUEST);

    controller.abort();
    await expect(aborted).rejects.toThrow('aborted');

    const replacement = workers[1];
    expect(replacement?.posted).toBe(1);
    expect(replacement?.messages[0]).toMatchObject({ id: 1, kind: 'series' });
    replacement?.emit('message', {
      data: { id: 1, kind: 'series', series: [] },
    });
    await expect(wanted).resolves.toEqual([]);
  });

  it('answers a call in flight when the worker module fails to load', async () => {
    const worker = new SilentWorker();
    const client = clientWith(worker, 10_000);
    const pending = client.series(REQUEST);

    worker.emit('error', { message: 'failed to load' });

    const [series] = await pending;
    expect(series.t.length).toBeGreaterThan(0);
    expect(worker.terminated).toBe(true);
  });

  it('takes the main thread for every later call once the worker has failed', async () => {
    const worker = new SilentWorker();
    const client = clientWith(worker, 10_000);
    const pending = client.series(REQUEST);
    worker.emit('error', { message: 'failed to load' });
    await pending;

    const [series] = await client.series(REQUEST);
    expect(series.t.length).toBeGreaterThan(0);
    expect(worker.posted).toBe(1);
  });

  it('does not wait forever on a worker that never answers', async () => {
    const worker = new SilentWorker();
    const client = clientWith(worker, 1);
    const alarms = await client.alarms({ ...REQUEST, series: ['temperature'] });
    expect(Array.isArray(alarms)).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it('rejects calls that are still in flight when it is disposed', async () => {
    const worker = new SilentWorker();
    const client = clientWith(worker, 10_000);
    const pending = client.series(REQUEST);
    client.dispose();
    await expect(pending).rejects.toThrow();
    expect(worker.terminated).toBe(true);
  });

  it('cancels a scheduled no-worker fallback when it is disposed', async () => {
    const client = new SimulationClient({ seed: SEED, createWorker: () => null });
    const pending = client.series(REQUEST);

    client.dispose();

    await expect(pending).rejects.toThrow('disposed');
    await expect(client.series(REQUEST)).rejects.toThrow('disposed');
  });

  it('cancels a degraded fallback when it is disposed', async () => {
    const worker = new SilentWorker();
    const client = clientWith(worker, 10_000);
    const pending = client.series(REQUEST);

    worker.emit('error', { message: 'failed to load' });
    client.dispose();

    await expect(pending).rejects.toThrow('disposed');
  });
});

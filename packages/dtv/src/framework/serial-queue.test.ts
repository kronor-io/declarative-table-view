import { describe, expect, it } from '@jest/globals';
import { createSerialQueue } from './serial-queue';

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe('serial queue', () => {
    it('runs tasks one at a time, in order', async () => {
        const queue = createSerialQueue();
        const events: string[] = [];
        let running = 0;
        let maxRunning = 0;

        const task = (name: string, ms: number) => async () => {
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            events.push(`${name} start`);
            await tick(ms);
            events.push(`${name} end`);
            running -= 1;
            return name;
        };

        const results = await Promise.all([
            queue.enqueue(task('a', 10)),
            queue.enqueue(task('b', 0)),
            queue.enqueue(task('c', 5))
        ]);

        expect(results).toEqual(['a', 'b', 'c']);
        expect(maxRunning).toBe(1);
        expect(events).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
    });

    it('reports a failure to its caller only and keeps running the tasks after it', async () => {
        const queue = createSerialQueue();

        const failing = queue.enqueue(async () => {
            throw new Error('boom');
        });
        const next = queue.enqueue(async () => 'after');

        await expect(failing).rejects.toThrow('boom');
        await expect(next).resolves.toBe('after');
        await expect(queue.enqueue(async () => 'later')).resolves.toBe('later');
    });

    it('starts only once the given promise has settled, even when it rejects', async () => {
        let release: () => void = () => undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const queue = createSerialQueue(gate.then(() => { throw new Error('initial load failed'); }));
        const events: string[] = [];

        const first = queue.enqueue(async () => { events.push('task'); return 1; });
        await tick();
        expect(events).toEqual([]);

        release();
        await expect(first).resolves.toBe(1);
        expect(events).toEqual(['task']);
    });
});

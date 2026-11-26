import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withUploadInactivity } from '../src/request-deadline.ts';

test('continuous upload bytes extend the interval, but repeated and regressing counts do not', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let bytes!: (sent: number) => void;
  const transfer = withUploadInactivity((signal, progress) => {
    bytes = progress;
    return new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  }, new AbortController().signal);
  for (let count = 1; count <= 7; count++) {
    context.mock.timers.tick(40_000);
    bytes(count);
  }
  context.mock.timers.tick(40_000);
  bytes(7);
  bytes(6);
  const stopped = assert.rejects(transfer, /keinen Fortschritt/);
  context.mock.timers.tick(5000);
  await stopped;
});

test('upload inactivity leaves upstream cancellation intact', async () => {
  const controller = new AbortController();
  const transfer = withUploadInactivity(signal => new Promise<void>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  }), controller.signal);
  const stopped = assert.rejects(transfer, /Test-Unterbrechung/);
  controller.abort(new Error('Test-Unterbrechung'));
  await stopped;
});

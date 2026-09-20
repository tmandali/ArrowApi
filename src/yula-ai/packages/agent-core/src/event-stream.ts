/**
 * Generic event stream class for async iteration and lifecycle streaming.
 * Reference: reference-pi/packages/ai/src/utils/event-stream.ts
 */

export class FifoQueue<T> {
  private incoming: T[] = [];
  private outgoing: T[] = [];

  get length(): number {
    return this.incoming.length + this.outgoing.length;
  }

  enqueue(value: T): void {
    this.incoming.push(value);
  }

  dequeue(): T | undefined {
    if (this.outgoing.length === 0) {
      while (this.incoming.length > 0) {
        this.outgoing.push(this.incoming.pop()!);
      }
    }
    return this.outgoing.pop();
  }
}

export class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue = new FifoQueue<T>();
  private waiting = new FifoQueue<(value: IteratorResult<T>) => void>();
  private done = false;
  private finalResultPromise: Promise<R>;
  private resolveFinalResult!: (result: R) => void;
  private rejectFinalResult!: (reason?: any) => void;
  private isComplete: (event: T) => boolean;
  private extractResult: (event: T) => R;

  constructor(isComplete: (event: T) => boolean, extractResult: (event: T) => R) {
    this.isComplete = isComplete;
    this.extractResult = extractResult;
    this.finalResultPromise = new Promise<R>((resolve, reject) => {
      this.resolveFinalResult = resolve;
      this.rejectFinalResult = reject;
    });
  }

  push(event: T): void {
    if (this.done) return;

    if (this.isComplete(event)) {
      this.done = true;
      this.resolveFinalResult(this.extractResult(event));
    }

    const waiter = this.waiting.dequeue();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.enqueue(event);
    }
  }

  end(result?: R): void {
    if (this.done) return;
    this.done = true;
    if (result !== undefined) {
      this.resolveFinalResult(result);
    }
    while (this.waiting.length > 0) {
      const waiter = this.waiting.dequeue()!;
      waiter({ value: undefined as any, done: true });
    }
  }

  error(err: any): void {
    if (this.done) return;
    this.done = true;
    this.rejectFinalResult(err);
    while (this.waiting.length > 0) {
      const waiter = this.waiting.dequeue()!;
      waiter({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.dequeue()!;
      } else if (this.done) {
        return;
      } else {
        const result = await new Promise<IteratorResult<T>>((resolve) => this.waiting.enqueue(resolve));
        if (result.done) return;
        yield result.value;
      }
    }
  }

  result(): Promise<R> {
    return this.finalResultPromise;
  }
}

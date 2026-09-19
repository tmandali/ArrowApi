/**
 * Pi MutationLine: Serializes complete read-modify-write jobs for state mutations.
 * Reference: earendil-works/pi/packages/agent/src/harness/session/mutation-line.ts
 */
export class MutationLine {
  private tail: Promise<void> = Promise.resolve();
  private sealedError: Error | undefined;

  run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.sealedError !== undefined) {
      return Promise.reject(this.sealedError);
    }

    const result = this.tail.then(() => {
      if (this.sealedError !== undefined) {
        throw this.sealedError;
      }
      return operation();
    });

    this.tail = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.run(operation);
  }

  seal(error: Error): Promise<void> {
    this.sealedError ??= error;
    return this.tail;
  }

  isSealed(): boolean {
    return this.sealedError !== undefined;
  }

  reset(): void {
    this.sealedError = undefined;
    this.tail = Promise.resolve();
  }
}

export const globalMutationLine = new MutationLine();
export const mutationLine = globalMutationLine;

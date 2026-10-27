/**
 * Minimal binary min-heap for A* priority queue.
 *
 * TypeScript has no built-in PriorityQueue. This keeps the Lambda bundle
 * small (no third-party dep) and the implementation reviewable.
 *
 * The heap stores entries of shape { priority: number; value: T }.
 * Ties in priority are broken by insertion order (stable within the same turn).
 */

export interface EntradaHeap<T> {
  priority: number;
  value: T;
}

export class MinHeap<T> {
  private readonly data: EntradaHeap<T>[] = [];

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  push(priority: number, value: T): void {
    this.data.push({ priority, value });
    this.bubbleUp(this.data.length - 1);
  }

  /** Remove and return the entry with the lowest priority. */
  pop(): EntradaHeap<T> {
    const top = this.data[0]!;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): EntradaHeap<T> | undefined {
    return this.data[0];
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent]!.priority <= this.data[i]!.priority) break;
      [this.data[parent], this.data[i]] = [this.data[i]!, this.data[parent]!];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left]!.priority < this.data[smallest]!.priority) smallest = left;
      if (right < n && this.data[right]!.priority < this.data[smallest]!.priority) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i]!, this.data[smallest]!];
      i = smallest;
    }
  }
}

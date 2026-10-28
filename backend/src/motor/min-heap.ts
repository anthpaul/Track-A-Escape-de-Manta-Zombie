/**
 * Min-heap binario mínimo para la cola de prioridad del A*.
 *
 * TypeScript no trae una PriorityQueue integrada. Esto mantiene chico el bundle
 * de la Lambda (sin dependencias de terceros) y la implementación revisable.
 *
 * El heap guarda entradas con la forma { priority: number; value: T }.
 * Los empates de prioridad se resuelven por orden de inserción (estable dentro del mismo turno).
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

  /** Quita y devuelve la entrada con la menor prioridad. */
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

// Tiny typed pub/sub. Used by lifecycle, feature flags, remote keys.

export type Listener<T> = (payload: T) => void;

export class EventEmitter<EventMap extends Record<string, unknown>> {
  private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    // Iterate a snapshot so listeners subscribed during this emit don't receive
    // the in-flight event, and skip listeners removed mid-emit.
    for (const listener of Array.from(set)) {
      if (!set.has(listener)) continue;
      try {
        listener(payload);
      } catch (e) {
        console.error(`[EventEmitter] listener for "${String(event)}" threw`, e);
      }
    }
  }

  clear(): void {
    this.listeners = {};
  }
}

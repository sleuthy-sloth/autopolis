/**
 * MockWebSocket — a hand-rolled WebSocket double for useEngine smoke tests.
 *
 * Mirrors the exact surface useEngine touches: constructor, readyState,
 * send(), close(), and the onopen/onmessage/onerror/onclose handlers, plus
 * the static OPEN constant (read as `WebSocket.OPEN` by useEngine.send).
 * Instances are tracked in `instances` so tests can drive them in order
 * (connections are made one at a time by useEngine's reconnect loop).
 */
export class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  /** When true, the next `new WebSocket(url)` throws (URL failure path). */
  static throwOnNext = false;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;

  constructor(url: string) {
    if (MockWebSocket.throwOnNext) {
      MockWebSocket.throwOnNext = false;
      throw new TypeError(`mock refused URL: ${url}`);
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  // ── test drivers ────────────────────────────────────────────────────────

  /** Simulate the server accepting the connection. */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate a JSON server frame. */
  message(data: unknown): void {
    this.readyState = MockWebSocket.OPEN;
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Simulate a raw (possibly malformed) frame. */
  messageRaw(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  /** Simulate a socket error (useEngine maps this to 'reconnecting'). */
  fail(): void {
    this.onerror?.();
  }

  /** Simulate the peer closing the socket. */
  closeRemote(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  static reset(): void {
    MockWebSocket.instances = [];
    MockWebSocket.throwOnNext = false;
  }
}

/** install() replaces the global WebSocket with the mock; reset() restores. */
const OriginalWebSocket = globalThis.WebSocket;

export function installMockWebSocket(): void {
  MockWebSocket.reset();
  (globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
}

export function restoreMockWebSocket(): void {
  (globalThis as { WebSocket: unknown }).WebSocket = OriginalWebSocket;
}
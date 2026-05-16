import type { ClientMessage } from '@phone-remote/protocol';

type Sender = (msg: ClientMessage) => void;

const senders = new Map<string, Sender>();

export function registerSender(serial: string, fn: Sender): () => void {
  senders.set(serial, fn);
  return () => {
    if (senders.get(serial) === fn) senders.delete(serial);
  };
}

export function broadcastFrom(originSerial: string, msg: ClientMessage, targets: Iterable<string>): void {
  for (const serial of targets) {
    if (serial === originSerial) continue;
    senders.get(serial)?.(msg);
  }
}

export function broadcastTo(targets: Iterable<string>, msg: ClientMessage): void {
  for (const serial of targets) {
    senders.get(serial)?.(msg);
  }
}

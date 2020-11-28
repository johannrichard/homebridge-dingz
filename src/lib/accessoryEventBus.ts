import { EventEmitter } from 'events';

// Accessory elements
// EVENT TYPES
export const enum AccessoryEvent {
  PUSH_STATE_UPDATE = 'pushStateUpdate',
}

export declare interface AccessoryEventBus {
  on(event: AccessoryEvent.PUSH_STATE_UPDATE, listener: () => void): this;
  emit(event: AccessoryEvent.PUSH_STATE_UPDATE): boolean;
}

export class AccessoryEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Maximum of 20 services
  }
}

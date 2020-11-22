import { EventEmitter } from 'events';
import { ButtonAction, DeviceInfo } from './commonTypes';
import { ButtonId } from './dingzTypes';

// Platform elements
// EVENT TYPES
export const enum DingzEvent {
  UPDATE_DEVICE_INFO = 'updateDeviceInfo',
  ACTION = 'deviceAction',
  REQUEST_STATE_UPDATE = 'requestStateUpdate',
  PUSH_STATE_UPDATE = 'pushStateUpdate',
}

export declare interface DingzEventBus {
  on(
    event: DingzEvent.ACTION,
    listener: (mac: string, action: ButtonAction, battery: number) => void,
  ): this;
  on(
    event: DingzEvent.ACTION,
    listener: (mac: string, action: ButtonAction, button: ButtonId) => void,
  ): this;
  on(
    event: DingzEvent.UPDATE_DEVICE_INFO,
    listener: (deviceInfo: DeviceInfo) => void,
  ): this;
  on(event: DingzEvent.REQUEST_STATE_UPDATE, listener: () => void): this;
  on(event: DingzEvent.PUSH_STATE_UPDATE, listener: () => void): this;

  emit(
    event: DingzEvent.ACTION,
    mac: string,
    action: ButtonAction,
    battery: number,
  ): boolean;
  emit(
    event: DingzEvent.ACTION,
    mac: string,
    action: ButtonAction,
    button: ButtonId,
  ): boolean;
  emit(event: DingzEvent.UPDATE_DEVICE_INFO, deviceInfo: DeviceInfo): boolean;
  emit(event: DingzEvent.REQUEST_STATE_UPDATE): boolean;
  emit(event: DingzEvent.PUSH_STATE_UPDATE): boolean;
}

export class DingzEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Maximum of 20 services
  }
}

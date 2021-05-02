import { EventEmitter } from 'events';
import { DeviceInfo, ButtonAction } from './commonTypes';
import { ButtonId, DingzDeviceConfig } from './dingzTypes';

// Platform elements
// EVENT TYPES
export const enum PlatformEvent {
  UPDATE_DEVICE_INFO = 'updateDeviceInfo',
  ACTION = 'deviceAction',
  REQUEST_STATE_UPDATE = 'requestStateUpdate',
}

export declare interface PlatformEventBus {
  on(
    event: PlatformEvent.ACTION,
    listener: (mac: string, action: ButtonAction, battery: number) => void,
  ): this;
  on(
    event: PlatformEvent.ACTION,
    listener: (
      mac: string,
      action: ButtonAction,
      button: ButtonId | '5' | '6', // FIXME: replace with specific type
    ) => void,
  ): this;
  on(
    event: PlatformEvent.UPDATE_DEVICE_INFO,
    listener: (deviceInfo: DeviceInfo) => void,
  ): this;
  on(
    event: PlatformEvent.UPDATE_DEVICE_INFO,
    listener: (deviceInfo: DeviceInfo, deviceConfig: DingzDeviceConfig) => void,
  ): this;
  on(event: PlatformEvent.REQUEST_STATE_UPDATE, listener: () => void): this;

  emit(
    event: PlatformEvent.ACTION,
    mac: string,
    action: ButtonAction,
    battery: number,
  ): boolean;
  emit(
    event: PlatformEvent.ACTION,
    mac: string,
    action: ButtonAction,
    button: ButtonId | '5' | '6', // FIXME: replace with generic type
  ): boolean;
  emit(
    event: PlatformEvent.UPDATE_DEVICE_INFO,
    deviceInfo: DeviceInfo,
  ): boolean;
  emit(
    event: PlatformEvent.UPDATE_DEVICE_INFO,
    deviceInfo: DeviceInfo,
    deviceConfig: DingzDeviceConfig,
  ): boolean;
  emit(event: PlatformEvent.REQUEST_STATE_UPDATE): boolean;
}

export class PlatformEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Maximum of 20 services
  }
}

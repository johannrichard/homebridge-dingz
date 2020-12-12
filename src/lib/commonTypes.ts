// Various Type Definitions for the dingz Accessory
// Based on the API definition

import { DingzAccessory } from '../dingzAccessory';
import { MyStromSwitchAccessory } from '../myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from '../myStromLightbulbAccessory';
import { MyStromButtonAccessory } from '../myStromButtonAccessory';
import { MyStromPIRAccessory } from '../myStromPIRAccessory';
import { DingzDeviceConfig, DingzDeviceHWInfo } from './dingzTypes';
import { MyStromDeviceHWInfo } from './myStromTypes';

// Types
export enum DeviceTypes {
  MYSTROM_SWITCH_CHV1 = 101,
  MYSTROM_BULB = 102,
  MYSTROM_BUTTON_PLUS = 103,
  MYSTROM_BUTTON = 104,
  MYSTROM_LEDSTRIP = 105,
  MYSTROM_SWITCH_CHV2 = 106,
  MYSTROM_SWITCH_EU = 107,
  DINGZ = 108,
  MYSTROM_PIR = 110,
}

export enum ButtonAction {
  SINGLE_PRESS = '1',
  DOUBLE_PRESS = '2',
  LONG_PRESS = '3',
  PIR_MOTION_START = '8',
  PIR_MOTION_STOP = '9',
}

export interface DeviceInfo {
  model?: string;
  hwInfo?: MyStromDeviceHWInfo | DingzDeviceHWInfo;
  name: string;
  address: string;
  token?: string;
  mac: string;
  accessoryClass: AccessoryClass;
}

export type AccessoryClass =
  | 'DingzAccessory'
  | 'MyStromSwitchAccessory'
  | 'MyStromLightbulbAccessory'
  | 'MyStromButtonAccessory'
  | 'MyStromPIRAccessory';

export type AccessoryType =
  | DingzAccessory
  | MyStromSwitchAccessory
  | MyStromLightbulbAccessory
  | MyStromButtonAccessory
  | MyStromPIRAccessory;
export interface AccessoryTypes {
  [key: string]: AccessoryType;
}

export interface AccessoryActionUrl {
  url: string;
}

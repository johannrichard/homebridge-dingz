// Various Type Definitions for the dingz Accessory
// Based on the API definition

import { DingzAccessory } from '../dingzAccessory';
import { MyStromSwitchAccessory } from '../myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from '../myStromLightbulbAccessory';
import { MyStromButtonAccessory } from '../myStromButtonAccessory';
import { MyStromPIRAccessory } from '../myStromPIRAccessory';

// Types
import {
  DingzDeviceInfo,
  DingzInputInfoItem,
  DingzDeviceDimmerConfig,
  DingzWindowCoveringConfigItem,
} from './dingzTypes';
import { MyStromDeviceInfo } from './myStromTypes';

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
  name: string;
  address: string;
  mac: string;
  model?: string;
  token?: string;
  hwInfo?: DingzDeviceInfo | MyStromDeviceInfo;
  dimmerConfig?: DingzDeviceDimmerConfig;
  windowCoveringConfig?: DingzWindowCoveringConfigItem[];
  dingzInputInfo?: DingzInputInfoItem[];
  lastUpdate?: Date;
  accessoryClass?:
    | 'DingzDaAccessory'
    | 'MyStromSwitchAccessory'
    | 'MyStromLightbulbAccessory'
    | 'MyStromButtonAccessory'
    | 'MyStromPIRAccessory';
}

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

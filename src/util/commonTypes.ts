// Various Type Definitions for the Dingz Accessory
// Based on the API definition

import { DingzDaAccessory } from '../dingzAccessory';
import { MyStromSwitchAccessory } from '../myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from '../myStromLightbulbAccessory';
import { MyStromButtonAccessory } from '../myStromButtonAccessory';

// Types
import {
  DingzDeviceInfo,
  DingzInputInfoItem,
  DeviceDingzDimmerConfig,
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
}

export const MYSTROM_SWITCH_TYPES = {
  WS2: 'CH v2',
  '106': 'CH v2',
  WSEU: 'EU',
  '107': 'EU',
};

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
  dimmerConfig?: DeviceDingzDimmerConfig;
  dingzInputInfo?: DingzInputInfoItem[];
  lastUpdate?: Date;
  accessoryClass?:
    | 'DingzDaAccessory'
    | 'MyStromSwitchAccessory'
    | 'MyStromLightbulbAccessory'
    | 'MyStromButtonAccessory';
}

export type DingzAccessoryType =
  | DingzDaAccessory
  | MyStromSwitchAccessory
  | MyStromLightbulbAccessory
  | MyStromButtonAccessory;
export interface DingzAccessories {
  [key: string]: DingzAccessoryType;
}

export interface DingzActionUrl {
  url: string;
}

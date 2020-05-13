// Various Type Definitions for the Dingz Accessory
// Based on the API definition

import { DingzDaAccessory } from '../dingzDaAccessory';
import { MyStromSwitchAccessory } from '../myStromSwitchAccessory';

export interface DingzTemperatureData {
  success: boolean;
  temperature: number;
}

export interface DingzMotionData {
  success: boolean;
  motion: boolean;
}

export enum DeviceTypes {
  MYSTROM_SWITCH_CHV1 = 0xA01,
  MYSTROM_BULB = 0xA02,
  MYSTROM_BUTTON_PLUS = 0xA03,
  MYSTROM_BUTTON = 0xA04,
  MYSTROM_LEDSTRIP = 0xA05,
  MYSTROM_SWITCH_CHV2 = 0xA06,
  MYSTROM_SWITCH_EU = 0xA07,
  DINGZ = 0xA08,
}

type DeviceTypesStrings = keyof typeof DeviceTypes;

export interface DimmerTimer {
  [id: number]: NodeJS.Timer;
}

export interface WindowCoveringTimer {
  [id: number]: NodeJS.Timer;
}

// TODO: Refactoring of interface names (not stringent)
export interface DingzDevices {
  [mac: string]: DingzDeviceInfo;
}

export interface DingzDeviceInfo {
  type: 'dingz';
  battery: boolean;
  reachable: boolean;
  meshroot: boolean;
  fw_version: string;
  fw_version_puck: string;
  bl_version_puck: string;
  dip_config: 0 | 1 | 2 | 3; // Config 0-3 
  has_pir: boolean;
  hk_activation_code: string;
}
export interface MyStromDeviceInfo {
  version: string;
  mac: string;
  type: string | number;
  name?: string;
  ssid: string;
  ip: string;
  mask: string;
  gw: string;
  dns: string;
  static: boolean;
  connected: boolean;
  signal: boolean;
}

export interface MyStromSwitchReport {
  power: number;
  relay: boolean;
  temperature: number;
  Ws?: number;
}
export interface DingzInputInfo {
  inputs: DingzInputInfoItem[];
}
export interface DingzInputInfoItem {
  output: | 1 | 2 | 3 | 4 | null;
  feedback: 'white' | 'red' | 'green' | 'blue';
  feedback_intensity: number;
  active: boolean;
}

export interface DeviceInfo {
  name: string;
  address: string;
  mac: string;
  model?: string;
  token?: string;
  hwInfo?: DingzDeviceInfo | MyStromDeviceInfo;
  dingzInputInfo?: DingzInputInfoItem[];
  lastUpdate?: Date;
  accessoryClass?: 'DingzDaAccessory' | 'MyStromSwitchAccessory';
}

export interface DingzAccessories {
  [key: string]: DingzDaAccessory | MyStromSwitchAccessory;
}

// Internal representation of Dimmer in Plugin
export type DimmerId = 0 | 1 | 2 | 3;

// Representation of dimmer in Dingz
export interface DimmerState {
  on: boolean;
  value: number;
  ramp: number;
}
export type DimmerProps = Record<DimmerId, DimmerState>;

export type WindowCoveringId = 0 | 1 ;
export interface WindowCoveringPositon {
  blind: number;
  lamella: number;
}
export interface WindowCoveringState {
  target:   WindowCoveringPositon;
  current:  WindowCoveringPositon;
}
export type WindowCoveringProps = Record<WindowCoveringId, WindowCoveringState>;

export interface Disposable {
    dispose(): void;
}
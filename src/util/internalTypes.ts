// Various Type Definitions for the Dingz Accessory
// Based on the API definition

import { DingzDaAccessory } from '../dingzAccessory';
import { MyStromSwitchAccessory } from '../myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from '../myStromLightbulbAccessory';

export interface DingzTemperatureData {
  success: boolean;
  temperature: number;
}

export interface DingzMotionData {
  success: boolean;
  motion: boolean;
}

export interface DingzLightData {
  success: boolean;
  intensity: number;
  state: 'night' | 'day';
}

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

type DeviceTypesStrings = keyof typeof DeviceTypes;

export interface DimmerTimer {
  [id: string]: NodeJS.Timer;
}

export interface WindowCoveringTimer {
  [id: number]: NodeJS.Timer;
}

// TODO: Refactoring of interface names (not stringent)
export interface DingzDevices {
  [mac: string]: DingzDeviceInfo;
}

export interface DingzDeviceInfo {
  // Only those values we need
  type: 'dingz';
  fw_version: string;
  hw_version: string;
  fw_version_puck: string;
  hw_version_puck: string;
  dip_config: 0 | 1 | 2 | 3; // Config 0-3
  has_pir: boolean;
  puck_hw_model: string;
  front_hw_model: string;
  puck_sn: string;
  front_sn: string;
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

export interface MyStromLightbulbReport {
  hue: number;
  saturation: number;
  value: number;
  on: boolean;
  color: string;
  mode: 'hsv' | 'rgb';
  power: number;
}
export interface DingzInputInfo {
  inputs: DingzInputInfoItem[];
}
export interface DingzInputInfoItem {
  output: 1 | 2 | 3 | 4 | null;
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
  dimmerConfig?: DeviceDingzDimmerConfig;
  dingzInputInfo?: DingzInputInfoItem[];
  lastUpdate?: Date;
  accessoryClass?:
    | 'DingzDaAccessory'
    | 'MyStromSwitchAccessory'
    | 'MyStromLightbulbAccessory';
}

export type DingzAccessoryType =
  | DingzDaAccessory
  | MyStromSwitchAccessory
  | MyStromLightbulbAccessory;
export interface DingzAccessories {
  [key: string]: DingzAccessoryType;
}

// Internal representation of Dimmer in Plugin
export type DimmerId = 0 | 1 | 2 | 3;
export type ButtonId = '1' | '2' | '3' | '4';
export enum ButtonAction {
  SINGLE_PRESS = '1',
  DOUBLE_PRESS = '2',
  LONG_PRESS = '3',
}

// Representation of dimmer in Dingz
export interface DimmerState {
  on: boolean;
  value: number;
  ramp: number;
  disabled: boolean;
  index?: {
    relative: number;
    absolute: number;
  };
}
export type DimmerProps = Record<DimmerId, DimmerState>;

export interface DingzLEDState {
  on: boolean;
  hsv: string;
  rgb: string;
  mode: 'rgb' | 'hsv';
  hue: number;
  saturation: number;
  value: number;
}

export type DingzDimmerConfigValue =
  | 'non_dimmable'
  | 'linear'
  | 'incandescent'
  | 'halogen'
  | 'led'
  | 'pulse'
  | 'ohmic';

export interface DeviceDingzDimmerConfig {
  dimmers: [
    {
      output: DingzDimmerConfigValue;
      name: string;
    },
    {
      output: DingzDimmerConfigValue;
      name: string;
    },
    {
      output: DingzDimmerConfigValue;
      name: string;
    },
    {
      output: DingzDimmerConfigValue;
      name: string;
    },
  ];
}

export type WindowCoveringId = 0 | 1;
export interface WindowCoveringPositon {
  blind: number;
  lamella: number;
}
export interface WindowCoveringState {
  target: WindowCoveringPositon;
  current: WindowCoveringPositon;
}
export type WindowCoveringProps = Record<WindowCoveringId, WindowCoveringState>;

export interface Disposable {
  dispose(): void;
}

// FIXME: Replace dispersed data gathering with `api/v1/state` endpoint

export interface DingzState {
  dimmers: DimmerState[];
  blinds: WindowCoveringState[];
  led: DingzLEDState;
  sensors: {
    brightness: number;
    light_state: 'night' | 'day';
    room_temperature: number;
    uncompensated_temperature: number;
    cpu_temperature: number;
    puck_temperature: number;
    fet_temperature: number;
    person_present: 0 | 1;
    input_state: boolean;
    power_outputs: [
      {
        value: number;
      },
      {
        value: number;
      },
      {
        value: number;
      },
      {
        value: number;
      },
    ];
  };
  thermostat: {
    active: false;
    out: 0;
    on: false;
    enabled: true;
    target_temp: number;
    mode: string;
    temp: number;
    min_target_temp: number;
    max_target_temp: number;
  };
  config: {
    timestamp: number;
  };
}

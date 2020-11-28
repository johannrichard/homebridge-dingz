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

export interface DingzDeviceInputConfig {
  inputs: DingzInputInfoItem[];
}
export interface DingzInputInfoItem {
  output: 1 | 2 | 3 | 4 | null;
  feedback: 'white' | 'red' | 'green' | 'blue';
  feedback_intensity: number;
  active: boolean;
}

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

export interface DingzDeviceSystemConfig {
  allow_reset: boolean;
  allow_wps: boolean;
  allow_reboot: boolean;
  broadcast_period: number;
  origin: boolean;
  token: string;
  upgrade_blink: boolean;
  reboot_blink: boolean;
  dingz_name: string;
  room_name: string;
  time: string;
  system_status: string;
}

// Internal representation of Dimmer in Plugin
export type DimmerId = 0 | 1 | 2 | 3;
export type ButtonId = '1' | '2' | '3' | '4';
export enum ButtonState {
  OFF = 0,
  ON = 1,
}

// Representation of dimmer in Dingz
export interface DimmerState {
  on: boolean;
  output: number;
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
  | 'ohmic'
  | 'not_connected';

export interface DingzDeviceDimmerConfig {
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
export type DingzWindowCoveringCalibrationState =
  | 'Initialised'
  | 'Not initialised'
  | 'Initialising'
  | 'Unknown';

export type DingzWindowCoveringType = 'lamella_90' | 'canvas';
export type WindowCoveringConfigIndex = 0 | 1;
export type DingzWindowCoveringConfigItem = {
  auto_calibration: boolean;
  state: DingzWindowCoveringCalibrationState;
  invert_direction: boolean;
  lamella_time: number;
  shade_up_time: number;
  shade_down_time: number;
  type: DingzWindowCoveringType;
  min_value: number;
  max_value: number;
  name: string;
};
export interface DingzDeviceWindowCoveringConfig {
  blinds: DingzWindowCoveringConfigItem[];
}

export type WindowCoveringId = 0 | 1;
export interface WindowCoveringPosition {
  blind: number;
  lamella: number;
}
export interface WindowCoveringState {
  target: WindowCoveringPosition;
  current: WindowCoveringPosition;
}

export interface WindowCoveringStates {
  moving: 'up' | 'down' | 'stop';
  position: number;
  lamella: number;
  readonly: boolean;
  index?: {
    relative: number;
    absolute: number;
  };
}
export type WindowCoveringProps = Record<WindowCoveringId, WindowCoveringState>;

// FIXME: #103 Replace dispersed data gathering with `api/v1/state` endpoint
export interface DingzState {
  dimmers: DimmerState[];
  blinds: WindowCoveringStates[];
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
// Timers
export interface DimmerTimer {
  [id: string]: NodeJS.Timer;
}

export interface WindowCoveringTimer {
  [id: number]: NodeJS.Timer;
}

// Common Type since it's used by platform.ts to

// work - around some bugs in different FW versions
export const MyStromSwitchTypes = {
  WS2: 'CH v2',
  '106': 'CH v2',
  WSEU: 'EU',
  '107': 'EU',
  LCS: 'Zero',
  '120': 'Zero',
};

export interface MyStromDeviceHWInfo {
  version: string;
  mac: string;
  type: string | number;
  name?: string;
  charge?: boolean;
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

export interface MyStromPIRReport {
  motion: boolean;
  light?: number;
  temperature: number;
}

export interface MyStromButtonPlusReport {
  temperature: number;
  humidity: number;
  battery: {
    voltage: number;
    charging: boolean;
  };
  charger: {
    voltage: number;
    connected: boolean;
  };
}

export enum MyStromButtonPlusBattery {
  BATTERY_MAX = 4.5,
  BATTERY_MIN = 3.0,
}

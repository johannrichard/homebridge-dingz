export interface MyStromDeviceInfo {
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

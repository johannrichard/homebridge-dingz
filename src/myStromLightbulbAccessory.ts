import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import simpleColorConverter from 'simple-color-converter';
import qs from 'qs';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo, MyStromLightbulbReport } from './lib/myStromTypes';
import { DingzEvent } from './lib/dingzEventBus';
import { DingzDaBaseAccessory } from './lib/dingzDaBaseAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromLightbulbAccessory extends DingzDaBaseAccessory {
  private lightbulbService: Service;

  // Eventually replaced by:
  private mystromDeviceInfo: MyStromDeviceInfo;

  private lightbulbState = {
    on: false,
    color: '0;0;0',
    hue: 0,
    saturation: 0,
    value: 0,
    mode: 'hsv',
    power: 0,
  } as MyStromLightbulbReport;

  constructor(
    private readonly _platform: DingzDaHomebridgePlatform,
    private readonly _accessory: PlatformAccessory,
  ) {
    super(_platform, _accessory);
    // Set Base URL
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;

    this.platform.log.debug(
      'Setting informationService Characteristics ->',
      this.device.model,
    );
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'MyStrom AG',
      )
      .setCharacteristic(
        this.platform.Characteristic.AppMatchingIdentifier,
        'ch.mystrom.iOSApp',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.mystromDeviceInfo.version ?? 'N/A',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    this.lightbulbService =
      this.accessory.getService(this.platform.Service.Lightbulb) ??
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.lightbulbService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name ?? `${this.accessory.context.device.model} Bulb`,
    );

    // register handlers for the On/Off Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this)) // SET - bind to the 'setBrightness` method below
      .on(CharacteristicEventTypes.GET, this.getBrightness.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .on(CharacteristicEventTypes.SET, this.setHue.bind(this)) // SET - bind to the 'setBrightness` method below
      .on(CharacteristicEventTypes.GET, this.getHue.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .on(CharacteristicEventTypes.SET, this.setSaturation.bind(this)) // SET - bind to the 'setBrightness` method below
      .on(CharacteristicEventTypes.GET, this.getSaturation.bind(this)); // SET - bind to the 'setBrightness` method below

    // Subscribe to the REQUEST_STATE_UPDATE event
    this.platform.eb.on(
      DingzEvent.REQUEST_STATE_UPDATE,
      this.getDeviceStateUpdate.bind(this),
    );
  }

  // Get updated device info and update the corresponding values
  private getDeviceStateUpdate() {
    this.getDeviceReport(this.device.mac)
      .then((report) => {
        // push the new value to HomeKit
        this.lightbulbState = report;
        // FIXME: Add 'mono' as well
        if (report.mode === 'hsv') {
          const hsv = report.color.split(';');
          this.lightbulbState.hue = parseInt(hsv[0]);
          this.lightbulbState.saturation = parseInt(hsv[1]);
          this.lightbulbState.value = parseInt(hsv[2]);
        } else {
          // rgbw
          const hsv = new simpleColorConverter({
            color: `hex #${report.color}`,
            to: 'hsv',
          });
          this.lightbulbState.hue = hsv.c;
          this.lightbulbState.saturation = hsv.s;
          this.lightbulbState.value = hsv.i;
        }

        this.lightbulbService
          .getCharacteristic(this.platform.Characteristic.Hue)
          .updateValue(this.lightbulbState.hue);
        this.lightbulbService
          .getCharacteristic(this.platform.Characteristic.Saturation)
          .updateValue(this.lightbulbState.saturation);
        this.lightbulbService
          .getCharacteristic(this.platform.Characteristic.Brightness)
          .updateValue(this.lightbulbState.value);
        this.lightbulbService
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.lightbulbState.on);
      })
      .catch((e) => {
        this.platform.log.debug('Error while retrieving Device Report ->', e);
      });
  }

  identify(): void {
    this.platform.log.debug(
      'Identify! -> Who am I? I am',
      this.accessory.displayName,
    );
  }

  private setOn(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.lightbulbState.on = value as boolean;
    this.setDeviceLightbulb({ isOn: this.lightbulbState.on });
    callback(null);
  }

  private getOn(callback: CharacteristicGetCallback) {
    const isOn = this.lightbulbState.on;
    this.platform.log.debug('Get Characteristic On ->', isOn);

    callback(null, isOn);
  }

  private async setHue(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.lightbulbState.hue = value as number;

    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  private getHue(callback: CharacteristicGetCallback) {
    const hue: number = this.lightbulbState.hue;
    callback(null, hue);
  }

  private async setSaturation(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.lightbulbState.saturation = value as number;

    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  private getSaturation(callback: CharacteristicGetCallback) {
    const saturation: number = this.lightbulbState.saturation;
    callback(null, saturation);
  }

  private async setBrightness(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.lightbulbState.value = value as number;
    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  private getBrightness(callback: CharacteristicGetCallback) {
    const brightness = this.lightbulbState.value;
    callback(null, brightness);
  }

  // Set individual dimmer
  private async setDeviceLightbulb({
    isOn,
    color,
  }: {
    isOn: boolean;
    color?: string;
  }): Promise<void> {
    // Weird URL :-)
    const setDimmerUrl = `${this.baseUrl}/api/v1/device/${this.device.mac}`;
    await DingzDaHomebridgePlatform.fetch({
      url: setDimmerUrl,
      method: 'POST',
      token: this.device.token,
      body: qs.stringify(
        {
          action: isOn ? 'on' : 'off',
          color: color ?? undefined,
          mode: color ? 'hsv' : undefined,
        },
        { encode: false },
      ),
    });
  }

  private async getDeviceReport(mac: string): Promise<MyStromLightbulbReport> {
    const reportUrl = `${this.baseUrl}/api/v1/device/`;
    return await DingzDaHomebridgePlatform.fetch({
      url: reportUrl,
      returnBody: true,
      token: this.device.token,
    }).then((response) => {
      return response[mac];
    });
  }
}

import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DingzDaHomebridgePlatform } from './platform';
import formurlencoded from 'form-urlencoded';
import {
  DeviceInfo,
  MyStromDeviceInfo,
  MyStromLightbulbReport,
} from './util/internalTypes';
import simpleColorConverter from 'simple-color-converter';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromLightbulbAccessory {
  private lightbulbService: Service;

  // Eventually replaced by:
  private switchOn = false;
  private device: DeviceInfo;
  private mystromDeviceInfo: MyStromDeviceInfo;
  private baseUrl: string;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
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
    private readonly platform: DingzDaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set Base URL
    this.device = this.accessory.context.device;
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;
    this.baseUrl = `http://${this.device.address}`;

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

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.lightbulbService =
      this.accessory.getService(this.platform.Service.Lightbulb) ??
      this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.lightbulbService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${accessory.context.device.model} Bulb`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .on(CharacteristicEventTypes.SET, this.setHue.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    this.lightbulbService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .on(CharacteristicEventTypes.SET, this.setSaturation.bind(this)); // SET - bind to the 'setBrightness` method below

    // Here we change update the brightness to a random value every 5 seconds using
    // the `updateCharacteristic` method.
    setInterval(() => {
      this.getDeviceReport()
        .then((report) => {
          // push the new value to HomeKit
          this.lightbulbState = report;
          if (report.mode === 'hsv') {
            const hsv = report.color.split(';');
            this.lightbulbState.hue = parseInt(hsv[0]);
            this.lightbulbState.saturation = parseInt(hsv[1]);
            this.lightbulbState.value = parseInt(hsv[2]);
          } else {
            // rgbw
            const hsv = new simpleColorConverter({
              color: `hex #${report.color}`, // Should be the most compatible form
              to: 'hsv',
            });
            this.lightbulbState.hue = hsv.c;
            this.lightbulbState.saturation = hsv.s;
            this.lightbulbState.value = hsv.i;
          }

          this.lightbulbService
            .getCharacteristic(this.platform.Characteristic.Hue)
            .setValue(this.lightbulbState.hue);
          this.lightbulbService
            .getCharacteristic(this.platform.Characteristic.Hue)
            .setValue(this.lightbulbState.saturation);
          this.lightbulbService
            .getCharacteristic(this.platform.Characteristic.Hue)
            .setValue(this.lightbulbState.value);

          this.platform.log.debug(
            'Pushed updated current LightBulb state to HomeKit ->',
            this.lightbulbState,
          );
        })
        .catch((e) => {
          this.platform.log.debug('Error while retrieving Device Report ->', e);
        });
    }, 2000);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.platform.log.debug(
      'Identify! -> Who am I? I am',
      this.accessory.displayName,
    );
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    this.platform.log.debug('Set Characteristic On ->', value);
    this.lightbulbState.on = value as boolean;
    this.setDeviceState(this.lightbulbState.on);

    /*
         .catch((e) => {
           this.platform.log.debug('Error updating Device ->', e.name);
         });
     */
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  getOn(callback: CharacteristicGetCallback) {
    // implement your own code to check if the device is on
    const isOn = this.lightbulbState.on;
    this.platform.log.debug('Get Characteristic On ->', isOn);

    callback(null, isOn);
  }

  private async setHue(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    this.lightbulbState.hue = value as number;

    this.platform.log.debug('Set Characteristic Hue -> ', value);
    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  private async setSaturation(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    this.lightbulbState.saturation = value as number;

    this.platform.log.debug('Set Characteristic Saturation -> ', value);
    // Call setDimmerValue()
    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  private async setBrightness(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    this.lightbulbState.value = value as number;

    this.platform.log.debug('Set Characteristic Brightness -> ', value);
    // Call setDimmerValue()
    const state: MyStromLightbulbReport = this.lightbulbState;
    await this.setDeviceLightbulb({
      isOn: state.on,
      color: `${state.hue};${state.saturation};${state.value}`,
    });
    callback(null);
  }

  // Set individual dimmer
  private async setDeviceLightbulb({
    isOn,
    color,
  }: { isOn?: boolean; color?: string } = {}): Promise<void> {
    // Weird URL :-)
    const setDimmerUrl = `${this.baseUrl}/api/v1/device/${this.device.mac}`;
    await this.platform.fetch({
      url: setDimmerUrl,
      method: 'POST',
      token: this.device.token,
      body: formurlencoded({
        on: isOn,
        color: color,
        mode: 'hsv',
      }),
    });
  }

  private setDeviceState(isOn: boolean) {
    const relayUrl = `${this.baseUrl}/relay?state=${isOn ? '1' : '0'}`;
    this.platform.fetch({
      url: relayUrl,
      token: this.device.token,
    });
  }

  private async getDeviceReport(): Promise<MyStromLightbulbReport> {
    const reportUrl = `${this.baseUrl}/report`;
    return await this.platform.fetch({
      url: reportUrl,
      returnBody: true,
      token: this.device.token,
    });
  }
}

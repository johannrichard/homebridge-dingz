import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceHWInfo, MyStromSwitchReport } from './lib/myStromTypes';
import { DingzDaBaseAccessory } from './lib/dingzDaBaseAccessory';

/**
 * Switch Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 * TODO: Implement Switch Zero in this class
 */
export class MyStromSwitchAccessory extends DingzDaBaseAccessory {
  private outletService: Service;
  private temperatureService: Service | undefined = undefined;

  // Eventually replaced by:
  private mystromDeviceInfo: MyStromDeviceHWInfo;

  private outletState = {
    relay: false,
    temperature: 0,
    power: 0,
  } as MyStromSwitchReport;

  constructor(
    private readonly _platform: DingzDaHomebridgePlatform,
    private readonly _accessory: PlatformAccessory,
  ) {
    super(_platform, _accessory);
    // Set Base URL
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceHWInfo;

    this.log.debug(
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
        `MyStrom WiFi Switch ${this.device.model as string}`,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.mystromDeviceInfo.version ?? 'N/A',
      )
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    this.outletService =
      this.accessory.getService(this.platform.Service.Outlet) ??
      this.accessory.addService(this.platform.Service.Outlet);

    this.outletService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name ?? `${this.accessory.context.device.model} Outlet`,
    );

    // register handlers for the On/Off Characteristic
    this.outletService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this)); // GET - bind to the `getOn` method below

    this.outletService
      .getCharacteristic(this.platform.Characteristic.OutletInUse)
      .on(CharacteristicEventTypes.GET, this.getOutletInUse.bind(this)); // GET - bind to the `getOn` method below

    // Only EU and CH v2 Switches have temperature sensor
    if (
      this.device.model !== 'Zero' &&
      this.device.model !== 'CH v1' &&
      this.device.model !== undefined
    ) {
      // Switch has a temperature sensor, make it available here
      this.temperatureService =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ??
        this.accessory.addService(this.platform.Service.TemperatureSensor);
      this.temperatureService.setCharacteristic(
        this.platform.Characteristic.Name,
        'Temperature',
      );

      // create handlers for required characteristics
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on(CharacteristicEventTypes.GET, this.getTemperature.bind(this));
    }
  }

  identify(): void {
    this.log.debug('Identify! -> Who am I? I am', this.accessory.displayName);
  }

  // Get updated device info and update the corresponding values
  protected getDeviceStateUpdate(): Promise<void> {
    return this.getDeviceReport()
      .then((report) => {
        // push the new value to HomeKit
        this.outletState = report;
        this.outletService
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.outletState.relay);

        switch (this.device.model ?? 'unknown') {
          case 'CH v1':
          case 'Zero':
            this.outletService
              .getCharacteristic(this.platform.Characteristic.OutletInUse)
              .updateValue(this.outletState.relay);
            break;
          default:
            this.outletService
              .getCharacteristic(this.platform.Characteristic.OutletInUse)
              .updateValue(this.outletState.power > 0);
            break;
        }

        if (
          this.temperatureService &&
          this.outletState.temperature !== null &&
          this.outletState.temperature !== undefined
        ) {
          this.temperatureService
            .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .updateValue(this.outletState.temperature);
        }
        return Promise.resolve();
      })
      .catch((e) => {
        return Promise.reject(e);
      });
  }

  private setOn(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.log.debug('Set Characteristic On ->', value);
    this.outletState.relay = value as boolean;
    this.setDeviceState(callback);
  }

  private getOn(callback: CharacteristicGetCallback) {
    const isOn = this.outletState?.relay;
    this.log.debug('Get Characteristic On ->', isOn);

    callback(this.reachabilityState, isOn);
  }

  private getTemperature(callback: CharacteristicGetCallback) {
    const temperature: number = this.outletState?.temperature;
    this.log.debug('Get Characteristic Temperature ->', temperature, '° C');

    // Don't return a value if temperature is not defined
    if (temperature !== null && temperature !== undefined) {
      callback(this.reachabilityState, temperature);
    } else {
      callback(new Error('No valid temperature value'));
    }
  }

  private getOutletInUse(callback: CharacteristicGetCallback) {
    const inUse: boolean =
      this.device.model === 'Zero' // Zero does not measure power
        ? this.outletState?.relay
        : this.outletState?.power > 0;
    this.log.debug('Get Characteristic OutletInUse ->', inUse);
    callback(this.reachabilityState, inUse);
  }

  private setDeviceState(callback: CharacteristicSetCallback) {
    const relayUrl = `${this.baseUrl}/relay?state=${
      this.outletState.relay ? '1' : '0'
    }`;
    this.request
      .get(relayUrl)
      .catch(this.handleRequestErrors.bind(this))
      .finally(() => {
        callback(this.reachabilityState);
      });
  }

  private async getDeviceReport(): Promise<MyStromSwitchReport> {
    const reportUrl = `${this.baseUrl}/report`;
    return await this.request.get(reportUrl).then((response) => {
      return response.data;
    });
  }
}

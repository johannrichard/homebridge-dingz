import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo, MyStromSwitchReport } from './lib/myStromTypes';
import { DingzDaBaseAccessory } from './lib/dingzDaBaseAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromSwitchAccessory extends DingzDaBaseAccessory {
  private outletService: Service;
  private temperatureService: Service | undefined = undefined;

  // Eventually replaced by:
  private switchOn = false;
  private mystromDeviceInfo: MyStromDeviceInfo;

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
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;

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
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.mystromDeviceInfo.version ?? 'N/A',
      )
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.mystromDeviceInfo ? 'EU/CH v2' : 'CH v1',
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
      //      .on(CharacteristicEventTypes.SET, this.setOutletInUse.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOutletInUse.bind(this)); // GET - bind to the `getOn` method below

    if (this.device.hwInfo?.type !== undefined) {
      // Switch has a temperature sensor, make it available here
      // create a new Temperature Sensor service
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
  protected getDeviceStateUpdate() {
    this.getDeviceReport()
      .then((report) => {
        // push the new value to HomeKit
        this.outletState = report;
        this.outletService
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(this.outletState.relay);

        this.outletService
          .getCharacteristic(this.platform.Characteristic.OutletInUse)
          .updateValue(this.outletState.power > 0);

        if (this.temperatureService) {
          this.temperatureService
            .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .updateValue(this.outletState.temperature);
        }
      })
      .catch((e) => {
        this.log.error('Error while retrieving Device Report ->', e.toString());
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
    callback(this.reachabilityState, temperature);
  }

  private getOutletInUse(callback: CharacteristicGetCallback) {
    const inUse: boolean = this.outletState?.power > 0;
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
    return await this.request
      .get(reportUrl)
      .then((response) => {
        return response.data;
      })
      .catch(this.handleRequestErrors.bind(this));
  }
}

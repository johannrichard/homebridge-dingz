import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo, MyStromSwitchReport } from './util/myStromTypes';
import { DeviceInfo } from './util/commonTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromSwitchAccessory {
  private outletService: Service;
  private temperatureService: Service | undefined = undefined;

  // Eventually replaced by:
  private switchOn = false;
  private device: DeviceInfo;
  private mystromDeviceInfo: MyStromDeviceInfo;
  private baseUrl: string;

  private outletState = {
    relay: false,
    temperature: 0,
    power: 0,
  } as MyStromSwitchReport;

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
      .updateCharacteristic(
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
      this.device.name ?? `${accessory.context.device.model} Outlet`,
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

    setInterval(() => {
      this.getDeviceReport()
        .then((report) => {
          // push the new value to HomeKit
          this.outletState = report;
          this.outletService
            .updateCharacteristic(
              this.platform.Characteristic.On,
              this.outletState.relay,
            )
            .updateCharacteristic(
              this.platform.Characteristic.OutletInUse,
              this.outletState.power > 0,
            );

          if (this.temperatureService) {
            this.temperatureService.updateCharacteristic(
              this.platform.Characteristic.CurrentTemperature,
              this.outletState.temperature,
            );
          }
        })
        .catch((e) => {
          this.platform.log.error(
            'Error while retrieving Device Report ->',
            e.toString(),
          );
        });
    }, 2000);
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
    this.platform.log.debug('Set Characteristic On ->', value);
    this.outletState.relay = value as boolean;
    this.setDeviceState(this.outletState.relay);
    callback(null);
  }

  private getOn(callback: CharacteristicGetCallback) {
    const isOn = this.outletState?.relay;
    this.platform.log.debug('Get Characteristic On ->', isOn);

    callback(null, isOn);
  }

  private getTemperature(callback: CharacteristicGetCallback) {
    const temperature: number = this.outletState?.temperature;
    this.platform.log.debug(
      'Get Characteristic Temperature ->',
      temperature,
      '° C',
    );

    callback(null, temperature);
  }

  private getOutletInUse(callback: CharacteristicGetCallback) {
    const inUse: boolean = this.outletState?.power > 0;
    this.platform.log.debug('Get Characteristic OutletInUse ->', inUse);
    callback(null, inUse);
  }

  private setDeviceState(isOn: boolean) {
    const relayUrl = `${this.baseUrl}/relay?state=${isOn ? '1' : '0'}`;
    this.platform.fetch({
      url: relayUrl,
      token: this.device.token,
    });
  }

  private async getDeviceReport(): Promise<MyStromSwitchReport> {
    const reportUrl = `${this.baseUrl}/report`;
    return await this.platform.fetch({
      url: reportUrl,
      returnBody: true,
      token: this.device.token,
    });
  }
}

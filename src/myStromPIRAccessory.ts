import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';
import { Mutex } from 'async-mutex';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo, MyStromPIRReport } from './lib/myStromTypes';
import { AccessoryActionUrl, ButtonAction } from './lib/commonTypes';
import { DeviceNotReachableError } from './lib/errors';
import { PlatformEvent } from './lib/platformEventBus';
import { DingzDaBaseAccessory } from './lib/dingzDaBaseAccessory';

// Policy for long running tasks, retry every hour
const retrySlow = Policy.handleAll()
  .orWhenResult((retry) => retry === true)
  .retry()
  .exponential({ initialDelay: 10000, maxDelay: 60 * 60 * 1000 });

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromPIRAccessory extends DingzDaBaseAccessory {
  private readonly mutex = new Mutex();
  private motionService: Service;
  private temperatureService: Service;
  private lightService: Service;

  // Eventually replaced by:
  private mystromDeviceInfo: MyStromDeviceInfo;

  private pirState = {
    motion: false,
    temperature: 0,
    light: 0,
  } as MyStromPIRReport;

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
        'myStrom AG',
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
        'PQWBB1',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.log.info('Create Motion Sensor');

    this.temperatureService =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ??
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      `Temperature ${this.device.name}`,
    );

    // create handlers for required characteristics
    this.temperatureService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on(CharacteristicEventTypes.GET, this.getTemperature.bind(this));

    // Add the LightSensor that's integrated in the dingz
    // API: /api/v1/light
    this.lightService =
      this.accessory.getService(this.platform.Service.LightSensor) ??
      this.accessory.addService(this.platform.Service.LightSensor);

    this.lightService.setCharacteristic(
      this.platform.Characteristic.Name,
      `Light ${this.device.name}`,
    );

    // create handlers for required characteristics
    this.lightService
      .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .on(CharacteristicEventTypes.GET, this.getLightLevel.bind(this));

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);
    this.motionService.setCharacteristic(
      this.platform.Characteristic.Name,
      `Motion ${this.device.name}`,
    );

    if (!(this.platform.config.motionPoller ?? true)) {
      // Implement *push* event handling
      this.platform.eb.on(PlatformEvent.ACTION, (mac, action) => {
        this.log.debug(`Processing DingzEvent.ACTION ${action}`);

        if (mac === this.device.mac) {
          this.log.debug(`Motion detected -> ${action}`);
          let isMotion: boolean | undefined;
          switch (action) {
            case ButtonAction.PIR_MOTION_STOP:
              isMotion = false;
              break;
            case ButtonAction.PIR_MOTION_START:
            default:
              isMotion = true;
              break;
          }

          this.log.debug('Motion Update from PUSH');
          this.pirState.motion = isMotion;
          this.motionService.setCharacteristic(
            this.platform.Characteristic.MotionDetected,
            this.pirState.motion,
          );
        }
      });
    }

    // Set the callback URL (Override!)
    retrySlow.execute(() => {
      this.getButtonCallbackUrl()
        .then((callBackUrl) => {
          if (this.platform.config.callbackOverride) {
            this.log.warn('Override callback URL ->', callBackUrl);
            // Set the callback URL (Override!)
            this.platform.setButtonCallbackUrl({
              baseUrl: this.baseUrl,
              token: this.device.token,
              endpoints: ['pir/generic'],
            });
          } else if (
            !callBackUrl?.url.includes(this.platform.getCallbackUrl())
          ) {
            this.log.warn('Update existing callback URL ->', callBackUrl);
            // Set the callback URL (Override!)
            this.platform.setButtonCallbackUrl({
              baseUrl: this.baseUrl,
              token: this.device.token,
              oldUrl: callBackUrl.url,
              endpoints: ['pir/generic'],
            });
          } else {
            this.log.debug('Callback URL already set ->', callBackUrl?.url);
          }
        })
        .catch(this.handleRequestErrors.bind(this));
    });
  }

  /**
   * Returns the callback URL for the device
   */
  public async getButtonCallbackUrl(): Promise<AccessoryActionUrl> {
    const getCallbackEndpoint = '/api/v1/action/pir/generic';
    this.log.debug('Getting the callback URL -> ', getCallbackEndpoint);
    return await this.request.get(getCallbackEndpoint).then((response) => {
      return response.data;
    });
  }

  // Get updated device info and update the corresponding values
  protected getDeviceStateUpdate(): Promise<void> {
    return this.getDeviceReport()
      .then((report) => {
        if (report) {
          // If we are in motion polling mode, update motion from poller
          // TODO: remove this -- doesn't make sense at all
          if (this.platform.config.motionPoller ?? true) {
            this.log.info('Motion POLLING of', this.device.name, 'enabled');
            const isMotion: boolean = report.motion;
            // Only update if motionService exists *and* if there's a change in motion'
            if (this.pirState.motion !== isMotion) {
              this.log.debug('Motion Update from POLLER');
              this.pirState.motion = isMotion;
              this.motionService
                .getCharacteristic(this.platform.Characteristic.MotionDetected)
                .updateValue(this.pirState.motion);
            }
          }

          // Update temperature and light in any case
          this.pirState.temperature = report.temperature;
          this.temperatureService
            .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .updateValue(this.pirState.temperature);

          this.pirState.light = report.light ?? 0;
          this.lightService
            .getCharacteristic(
              this.platform.Characteristic.CurrentAmbientLightLevel,
            )
            .updateValue(this.pirState.light);

          return Promise.resolve();
        } else {
          return Promise.reject(new DeviceNotReachableError());
        }
      })
      .catch((e: Error) => {
        return Promise.reject(e);
      });
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Ambient Light Level" characteristic
   */
  private getLightLevel(callback: CharacteristicGetCallback) {
    const light: number = this.pirState?.light ?? 42;
    this.log.debug('Get Characteristic Ambient Light Level ->', light, ' lux');

    callback(this.reachabilityState, light);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Temperature" characteristic
   */
  private getTemperature(callback: CharacteristicGetCallback) {
    const temperature: number = this.pirState?.temperature;
    this.log.debug('Get Characteristic Temperature ->', temperature, '° C');

    callback(this.reachabilityState, temperature);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Motion Detected" characteristic
   */
  private getMotionDetected(callback: CharacteristicGetCallback) {
    // set this to a valid value for MotionDetected
    const isMotion = this.pirState.motion;
    callback(this.reachabilityState, isMotion);
  }

  private async getDeviceReport(): Promise<MyStromPIRReport> {
    const getSensorsUrl = `${this.baseUrl}/api/v1/sensors`;
    return await this.request.get(getSensorsUrl).then((response) => {
      return response.data;
    });
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.debug('Identify! -> Who am I? I am', this.accessory.displayName);
  }
}

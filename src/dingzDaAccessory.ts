import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { Policy, ConsecutiveBreaker } from 'cockatiel';
import { Mutex } from 'async-mutex';
import simpleColorConverter from 'simple-color-converter';
import qs from 'qs';

// Internal types
import {
  DingzTemperatureData,
  DingzMotionData,
  DingzDevices,
  DingzDeviceInfo,
  DingzInputInfoItem,
  DingzInputInfo,
  DeviceInfo,
  Disposable,
  DimmerTimer,
  DimmerId,
  DimmerProps,
  WindowCoveringProps,
  DingzDimmerState,
  DingzLEDState,
  WindowCoveringId,
  WindowCoveringState,
  WindowCoveringTimer,
} from './util/internalTypes';

import { MethodNotImplementedError } from './util/errors';
import { DingzDaHomebridgePlatform } from './platform';

// Define a policy that will retry 20 times at most
const retry = Policy.handleAll()
  .retry()
  .exponential({ maxDelay: 10 * 1000, maxAttempts: 20 });

// Create a circuit breaker that'll stop calling the executed function for 10
// seconds if it fails 5 times in a row. This can give time for e.g. a database
// to recover without getting tons of traffic.
const circuitBreaker = Policy.handleAll().circuitBreaker(
  10 * 1000,
  new ConsecutiveBreaker(5),
);
const retryWithBreaker = Policy.wrap(retry, circuitBreaker);

// Policy for long running tasks, retry every hour
const retrySlow = Policy.handleAll()
  .orWhenResult((retry) => retry === true)
  .retry()
  .exponential({ initialDelay: 10000, maxDelay: 60 * 60 * 1000 });
/**
 * Interfaces
 */

interface Success {
  name: string;
  occupation: string;
}

interface Error {
  code: number;
  errors: string[];
}

/**
  Implemented Characteristics:
  [x] Dimmer (Lightbulb)
  [x] Blinds (WindowCovering)
  [x] Temperature (CurrentTemperature)
  [x] PIR (MotionSensor)
  [x] LED (ColorLightbulb)
  [] Buttons (StatelessProgrammableButton or so)
  [] Light Level (LightSensor/AmbientLightLevel)
*/

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class DingzDaAccessory implements Disposable {
  private readonly mutex = new Mutex();

  private services: Service[] = [];

  private _updatedDeviceInfo: DingzDeviceInfo | undefined;
  private _updatedDeviceInputConfig: DingzInputInfoItem | undefined;

  private switchOn = false;
  private device: DeviceInfo;
  private dingzDeviceInfo: DingzDeviceInfo;
  private baseUrl: string;

  // Todo: Make proper internal representation
  private dingzStates = {
    Temperature: 0,
    Dimmers: {
      0: { on: false, value: 0, ramp: 0 },
      1: { on: false, value: 0, ramp: 0 },
      2: { on: false, value: 0, ramp: 0 },
      3: { on: false, value: 0, ramp: 0 },
    } as DimmerProps,
    WindowCovers: {
      0: {
        target: { blind: 0, lamella: 0 },
        current: { blind: 0, lamella: 0 },
      } as WindowCoveringState,
      1: {
        target: { blind: 0, lamella: 0 },
        current: { blind: 0, lamella: 0 },
      } as WindowCoveringState,
    } as WindowCoveringProps,
    Motion: false,
    LED: {
      on: false,
      hsv: '0;0;100',
      rgb: 'FFFFFF',
      mode: 'hsv',
    } as DingzLEDState,
  };

  // Take stock of intervals to dispose at the end of the life of the Accessory
  private serviceTimers: NodeJS.Timer[] = [];
  private motionTimer: NodeJS.Timer | undefined;
  private dimmerTimers = {} as DimmerTimer;
  private windowCoveringTimers = {} as WindowCoveringTimer;

  constructor(
    private readonly platform: DingzDaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set Base URL
    this.device = this.accessory.context.device;
    this.dingzDeviceInfo = this.device.hwInfo as DingzDeviceInfo;
    this.baseUrl = `http://${this.device.address}`;

    this.platform.log.debug(
      'Setting informationService Characteristics ->',
      this.device.model,
    );
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Iolo AG')
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.dingzDeviceInfo.fw_version_puck,
      )
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.dingzDeviceInfo.hw_version_puck,
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.dingzDeviceInfo.puck_sn,
      );
    /****
     * How to discover Accessories:
     * - Check for UDP Packets and/or use manually configured accessories
     */

    // Add Dimmers, Blinds etc.
    this.platform.log.debug('Adding output devices -> [...]');
    retryWithBreaker
      .execute(() => this.getDeviceInputConfig())
      .then((data) => {
        this.platform.log.debug('Got DeviceInputConfig ->', data);
        if (data.inputs) {
          this.device.dingzInputInfo = data.inputs;
        }
        this.addOutputServices();
        setInterval(() => {
          // TODO: Set rechability if call times out too many times
          // Set up an interval to fetch Dimmer states
          this.getDeviceDimmers().then((state) => {
            if (typeof state !== 'undefined') {
              // push the new value to HomeKit
              this.platform.log.debug(
                'Retrieval of new state data successful ->',
                state,
              );
              this.dingzStates.Dimmers = state;
            }
          });
        }, 2500);
      });

    /**
     * Add auxiliary services (Motion, Temperature)
     */
    if (this.dingzDeviceInfo.has_pir) {
      // Dingz has a Motion sensor -- let's create it
      this.addMotionService();
    } else {
      this.platform.log.info(
        'Your Dingz',
        this.accessory.displayName,
        'has no Motion sensor.',
      );
    }
    // Dingz has a temperature sensor and an LED,
    // make these available here
    this.addTemperatureService();
    this.addLEDService();

    this.services.forEach((service) => {
      this.platform.log.info(
        'Service created ->',
        service.getCharacteristic(this.platform.Characteristic.Name).value,
      );
    });

    // Retry at least once every day
    retrySlow.execute(() => {
      this.updateAccessory();
      return true;
    });
  }

  private addTemperatureService() {
    const temperatureService: Service =
      this.accessory.getService(this.platform.Service.TemperatureSensor) ??
      this.accessory.addService(this.platform.Service.TemperatureSensor);
    temperatureService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Temperature',
    );

    // create handlers for required characteristics
    temperatureService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on(CharacteristicEventTypes.GET, this.getTemperature.bind(this));
    this.services.push(temperatureService);

    const updateInterval: NodeJS.Timer = setInterval(() => {
      // Get temperature value from Device
      let currentTemperature: number;
      this.getDeviceTemperature().then((data) => {
        if (data.success) {
          currentTemperature = data.temperature;

          if (this.dingzStates.Temperature !== currentTemperature) {
            this.dingzStates.Temperature = currentTemperature;

            temperatureService
              .getCharacteristic(
                this.platform.Characteristic.CurrentTemperature,
              )
              .updateValue(currentTemperature);
            this.platform.log.debug(
              'Pushed updated current Temperature state of',
              temperatureService.getCharacteristic(
                this.platform.Characteristic.Name,
              ).value,
              'to HomeKit:',
              currentTemperature,
            );
          }
        }
      });
    }, 10000);
    this.serviceTimers.push(updateInterval);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * to get the current value of the "Current Temperature" characteristic
   */
  private getTemperature(callback: CharacteristicSetCallback) {
    // set this to a valid value for CurrentTemperature
    const currentTemperature: number = this.dingzStates.Temperature;
    this.platform.log.debug(
      'Get Characteristic Temperature ->',
      currentTemperature,
    );

    callback(null, currentTemperature);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Motion Detected" characteristic
   */
  private getMotionDetected(callback: CharacteristicSetCallback) {
    // set this to a valid value for MotionDetected
    const isMotion = this.dingzStates.Motion;
    this.platform.log.debug(
      'Get Characteristic getMotionDetected ->',
      isMotion,
    );

    callback(null, isMotion);
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

  private addOutputServices() {
    // This is the block for the multiple services (Dimmers 1-4 / Blinds 1-2 / Buttons 1-4)
    // If "Input" is set, Dimmer 1 won't work. We have to take this into account

    // Get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    const dimmerServices: Service[] = [];
    const windowCoverServices: Service[] = [];

    const inputConfig: DingzInputInfoItem[] | undefined = this.device
      .dingzInputInfo;
    const baseName: string = this.accessory.displayName;

    /** DIP Switch
     * 0			M1& M2		(2 blinds)
     * 1			1/2L & M2	(1 blind (M2) and 2 lights)
     * 2			3/4L & M1	(1 blind (M1) and 2 lights)
     * 3			1/2/3/4L		(4 lights)
     */
    switch (this.dingzDeviceInfo.dip_config) {
      case 3:
        // DIP = 0: D0, D1, D2, D3; (Subtypes) (Unless Input, then D1, D2, D3)
        if (inputConfig && !inputConfig[0].active) {
          // D0
          dimmerServices.push(this.addDimmerService(baseName, 0));
        }
        // D1, D2, D3
        dimmerServices.push(this.addDimmerService(baseName, 1));
        dimmerServices.push(this.addDimmerService(baseName, 2));
        dimmerServices.push(this.addDimmerService(baseName, 3));
        break;
      case 2:
        // DIP = 1: M0, D2, D3;
        windowCoverServices.push(this.addWindowCoveringService(baseName, 0));
        dimmerServices.push(this.addDimmerService(baseName, 2));
        dimmerServices.push(this.addDimmerService(baseName, 3));
        break;
      case 1:
        // DIP = 2: D0, D1, M1; (Unless Input, then D1, M1);
        if (inputConfig && !inputConfig[0].active) {
          // D0
          dimmerServices.push(this.addDimmerService(baseName, 0));
        }
        dimmerServices.push(this.addDimmerService(baseName, 1));
        windowCoverServices.push(this.addWindowCoveringService(baseName, 0));
        break;
      case 0:
        // DIP = 3: M0, M1;
        windowCoverServices.push(this.addWindowCoveringService(baseName, 0));
        windowCoverServices.push(this.addWindowCoveringService(baseName, 1));
        break;
      default:
        break;
    }

    windowCoverServices.forEach((service) => {
      this.services.push(service);
    });

    dimmerServices.forEach((service) => {
      this.services.push(service);
    });
  }

  private addDimmerService(name: string, id: DimmerId = 0) {
    // Service doesn't yet exist, create new one
    // FIXME can be done more beautifully I guess
    const newService =
      this.accessory.getServiceById(
        this.platform.Service.Lightbulb,
        id.toString(),
      ) ??
      this.accessory.addService(
        this.platform.Service.Lightbulb,
        `${name} D${id + 1}`, // Name Dimmers according to WebUI, not API info
        id.toString(),
      );
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    newService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this, id)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this, id)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    newService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this, id)); // SET - bind to the 'setBrightness` method below

    const updateInterval: NodeJS.Timer = setInterval(() => {
      // assign the current brightness a random value between 0 and 100

      if (id) {
        // Id set
        const state = this.dingzStates.Dimmers[id];
        newService
          .getCharacteristic(this.platform.Characteristic.Brightness)
          .updateValue(state.value);
        newService
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(state.on);

        this.platform.log.debug(
          'Pushed updated current Brightness and On state of',
          newService.getCharacteristic(this.platform.Characteristic.Name).value,
          'to HomeKit:',
          state.value,
          '->',
          state.on,
        );
      }
    }, 10000);

    if (id && updateInterval) {
      this.dimmerTimers[id as number] = updateInterval;
    }
    return newService;
  }

  private removeDimmerService(id: 0 | 1 | 2 | 3) {
    // Remove motionService
    const service: Service | undefined = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id.toString(),
    );
    if (service) {
      this.platform.log.debug('Removing Dimmer ->', service.displayName);
      clearTimeout(this.dimmerTimers[id]);
      this.accessory.removeService(service);
    }
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  private setOn(
    id: DimmerId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.Dimmers[id].on = value as boolean;
    this.platform.log.debug('Set Characteristic D', id, 'On ->', value);
    try {
      this.setDeviceDimmer(id, value as boolean);
    } catch (e) {
      this.platform.log.error(
        'Error ->',
        e.name,
        ', unable to set Dimmer data ',
        id,
      );
    }
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getOn(id: DimmerId, callback: CharacteristicGetCallback) {
    this.platform.log.debug(
      'Dimmers: ',
      JSON.stringify(this.dingzStates.Dimmers),
    );
    const isOn: boolean = this.dingzStates.Dimmers[id].on;

    this.platform.log.debug('Get Characteristic ', id, 'On ->', isOn);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, isOn);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  private async setBrightness(
    id: DimmerId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    const isOn: boolean = value > 0 ? true : false;
    this.dingzStates.Dimmers[id].value = value as number;
    this.dingzStates.Dimmers[id].on = isOn;

    this.platform.log.debug('Set Characteristic Brightness -> ', value);
    // Call setDimmerValue()
    await this.setDeviceDimmer(id, isOn, value as number);
    // you must call the callback function
    callback(null);
  }

  // Add WindowCovering (Blinds)
  private addWindowCoveringService(name: string, id?: WindowCoveringId) {
    let service: Service;
    if (id) {
      service =
        this.accessory.getServiceById(
          this.platform.Service.WindowCovering,
          id.toString(),
        ) ??
        this.accessory.addService(
          this.platform.Service.WindowCovering,
          `${name} B${id}`,
          id.toString(),
        );
    } else {
      service =
        this.accessory.getService(this.platform.Service.WindowCovering) ??
        this.accessory.addService(this.platform.Service.WindowCovering, name);
    }
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on(
        CharacteristicEventTypes.SET,
        this.setPosition.bind(this, id as WindowCoveringId),
      );
    service
      .getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
      .on(
        CharacteristicEventTypes.SET,
        this.setTiltAngle.bind(this, id as WindowCoveringId),
      );

    service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on(
        CharacteristicEventTypes.GET,
        this.getPosition.bind(this, id as WindowCoveringId),
      );
    service
      .getCharacteristic(
        this.platform.Characteristic.CurrentHorizontalTiltAngle,
      )
      .on(
        CharacteristicEventTypes.GET,
        this.getTiltAngle.bind(this, id as WindowCoveringId),
      );

    const updateInterval: NodeJS.Timer = setInterval(() => {
      // assign the current brightness a random value between 0 and 100
      try {
        this.getWindowCovering(id as WindowCoveringId).then((state) => {
          if (typeof state !== 'undefined' && id) {
            // push the new value to HomeKit
            this.dingzStates.WindowCovers[id] = state;
            service
              .getCharacteristic(this.platform.Characteristic.TargetPosition)
              .updateValue(state.target.blind);
            service
              .getCharacteristic(
                this.platform.Characteristic.TargetHorizontalTiltAngle,
              )
              .updateValue(state.target.lamella);
            service
              .getCharacteristic(this.platform.Characteristic.CurrentPosition)
              .updateValue(state.current.blind);
            service
              .getCharacteristic(
                this.platform.Characteristic.CurrentHorizontalTiltAngle,
              )
              .updateValue(state.current.lamella);

            this.platform.log.debug(
              'Pushed updated current WindowCovering state of',
              service.getCharacteristic(this.platform.Characteristic.Name)
                .value,
              'to HomeKit:',
              JSON.stringify(state),
            );
          }
        });
      } catch (e) {
        this.platform.log.error(
          'Error ->',
          e.name,
          ', unable to fetch WindowCovering data',
        );
      }
    }, 10000);

    if (id && updateInterval) {
      this.windowCoveringTimers[id as number] = updateInterval;
    }
    return service;
  }

  private removeWindowCoveringService(id: 0 | 1) {
    // Remove motionService

    const service: Service | undefined = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id.toString(),
    );
    if (service) {
      this.platform.log.debug(
        'Removing WindowCovering ->',
        service.displayName,
      );
      this.accessory.removeService(service);
      clearTimeout(this.windowCoveringTimers[id]);
    }
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  private async setPosition(
    id: WindowCoveringId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    const blind: number = value as number;
    const lamella: number = this.dingzStates.WindowCovers[id].target.lamella;
    this.dingzStates.WindowCovers[id].target.blind = blind;

    this.platform.log.debug('Set Characteristic TargetPosition -> ', value);
    // Call setDimmerValue()
    await this.setWindowCovering(id, blind, lamella);
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getPosition(
    id: WindowCoveringId,
    callback: CharacteristicGetCallback,
  ) {
    this.platform.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    const position: number = this.dingzStates.WindowCovers[id].current.blind;

    this.platform.log.debug(
      'Get Characteristic for WindowCovering',
      id,
      'Current Position ->',
      position,
    );

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, position);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  private async setTiltAngle(
    id: WindowCoveringId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    const blind: number = this.dingzStates.WindowCovers[id].target.blind;
    const lamella: number = value as number;
    this.dingzStates.WindowCovers[id].target.lamella = lamella;

    this.platform.log.debug(
      'Set Characteristic TargetHorizontalTiltAngle on ',
      id,
      '->',
      value,
    );
    // Call setDimmerValue()
    await this.setWindowCovering(id, blind, lamella);
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getTiltAngle(
    id: WindowCoveringId,
    callback: CharacteristicGetCallback,
  ) {
    this.platform.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    const tiltAngle: number = this.dingzStates.WindowCovers[id].current.lamella;

    this.platform.log.debug(
      'Get Characteristic for WindowCovering',
      id,
      'Current TiltAngle ->',
      tiltAngle,
    );

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, tiltAngle);
  }

  /**
   * Motion Service Methods
   */
  private addMotionService() {
    let service: Service | undefined = undefined;

    service =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);
    service.setCharacteristic(this.platform.Characteristic.Name, 'Motion');
    this.services.push(service);
    // Only check for motion if we have a PIR and set the Interval
    const motionInterval: NodeJS.Timer = setInterval(() => {
      let isMotion: boolean;
      try {
        this.getDeviceMotion().then((data) => {
          if (data.success) {
            isMotion = data.motion;

            // Only update if motionService exists *and* if there's a change in motion'
            if (service && this.dingzStates.Motion !== isMotion) {
              this.dingzStates.Motion = isMotion;
              service
                .getCharacteristic(this.platform.Characteristic.MotionDetected)
                .updateValue(isMotion);
              this.platform.log.debug(
                'Pushed updated current Motion state of',
                service.getCharacteristic(this.platform.Characteristic.Name)
                  .value,
                'to HomeKit:',
                isMotion,
              );
            }
          }
        });
      } catch (e) {
        this.platform.log.error(
          'Error ->',
          e.name,
          ', unable to fetch DeviceMotion data',
        );
      }
    }, 2000); // Shorter term updates for motion sensor
    this.motionTimer = motionInterval;
  }

  // Remove motion service
  private removeMotionService() {
    // Remove motionService & motionTimer
    if (this.motionTimer) {
      clearTimeout(this.motionTimer);
      this.motionTimer = undefined;
    }
    const service: Service | undefined = this.accessory.getService(
      this.platform.Service.MotionSensor,
    );
    if (service) {
      this.platform.log.warn('Removing Motion service ->', service.displayName);
      this.accessory.removeService(service);
    }
  }

  // Updates the Accessory (e.g. if the config has changed)
  private async updateAccessory(): Promise<void> {
    this.platform.log.warn('Update accessory -> Check for changed config.');

    retryWithBreaker
      .execute(() => this.getDeviceInputConfig())
      .then((inputConfig) => {
        if (inputConfig && inputConfig.inputs[0]) {
          this._updatedDeviceInputConfig = inputConfig.inputs[0];
        }
      });

    retryWithBreaker
      .execute(() => this.getDingzDeviceInfo())
      .then((deviceInfo) => {
        this._updatedDeviceInfo = deviceInfo;
      });

    const currentDingzDeviceInfo: DingzDeviceInfo = this.accessory.context
      .device.dingzDeviceInfo;
    const updatedDingzDeviceInfo: DingzDeviceInfo =
      this._updatedDeviceInfo ?? currentDingzDeviceInfo;

    const currentDingzInputInfo: DingzInputInfoItem = this.accessory.context
      .device.dingzInputInfo[0];
    const updatedDingzInputInfo: DingzInputInfoItem =
      this._updatedDeviceInputConfig ?? currentDingzInputInfo;

    try {
      // FIXME: Crashes occasionally
      if (
        currentDingzDeviceInfo &&
        currentDingzDeviceInfo.has_pir !== updatedDingzDeviceInfo.has_pir
      ) {
        // Update PIR Service
        this.platform.log.warn('Update accessory -> PIR config changed.');
        if (updatedDingzDeviceInfo.has_pir) {
          // Add PIR service
          this.addMotionService();
        } else {
          // Remove PIR service
          this.removeMotionService();
        }
      }

      // Something about the Input config changed -- either remove or add the Dimmer,
      // but only if DIP is not set to WindowCovers
      // Update PIR Service
      if (updatedDingzInputInfo.active || currentDingzInputInfo.active) {
        if (
          this.accessory.getServiceById(this.platform.Service.Lightbulb, '0')
        ) {
          this.platform.log.warn(
            'Input active. Dimmer Service 0 can not exist -> remove',
          );
          this.removeDimmerService(0);
        }
      } else if (
        !updatedDingzInputInfo.active &&
        !this.accessory.getServiceById(this.platform.Service.Lightbulb, '0') &&
        (updatedDingzDeviceInfo.dip_config === 1 ||
          updatedDingzDeviceInfo.dip_config === 3)
      ) {
        // Only add Dimmer 0 if we're not in "WindowCover" mode
        this.platform.log.warn(
          'No Input defined. Attempting to add Dimmer Service D0.',
        );
        this.addDimmerService(this.accessory.displayName, 0);
      }
      // DIP overrides Input
      if (
        currentDingzDeviceInfo &&
        currentDingzDeviceInfo.dip_config !== updatedDingzDeviceInfo.dip_config
      ) {
        // Update Dimmer & Blinds Services
        throw new MethodNotImplementedError(
          'Update Dimmer accessories not yet implemented -> ' +
            this.accessory.displayName +
            '',
        );
      }
    } finally {
      this.accessory.context.device.dingzDeviceInfo = updatedDingzDeviceInfo;
      this.accessory.context.device.dingzInputInfo = [updatedDingzInputInfo];
      this.platform.log.warn(
        'DingZ Device Info: ',
        JSON.stringify(updatedDingzDeviceInfo),
      );
    }
  }

  private addLEDService() {
    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    const ledService =
      this.accessory.getServiceById(this.platform.Service.Lightbulb, 'LED') ??
      this.accessory.addService(this.platform.Service.Lightbulb, 'LED', 'LED');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    ledService.setCharacteristic(this.platform.Characteristic.Name, 'LED');

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    ledService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setLEDOn.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getLEDOn.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    ledService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setLEDBrightness.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    ledService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .on(CharacteristicEventTypes.SET, this.setLEDHue.bind(this)); // SET - bind to the 'setBrightness` method below

    // register handlers for the Brightness Characteristic
    ledService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .on(CharacteristicEventTypes.SET, this.setLEDSaturation.bind(this)); // SET - bind to the 'setBrightness` method below

    this.services.push(ledService);
    // Here we change update the brightness to a random value every 5 seconds using
    // the `updateCharacteristic` method.
    setInterval(() => {
      this.getDeviceLED()
        .then((state) => {
          // push the new value to HomeKit
          this.dingzStates.LED = state;
          if (state.mode === 'hsv') {
            const hsv = state.hsv.split(';');
            this.dingzStates.LED.hue = parseInt(hsv[0]);
            this.dingzStates.LED.saturation = parseInt(hsv[1]);
            this.dingzStates.LED.value = parseInt(hsv[2]);
          } else {
            // rgbw
            const hsv = new simpleColorConverter({
              color: `hex #${state.rgb}`, // Should be the most compatible form
              to: 'hsv',
            });
            this.dingzStates.LED.hue = hsv.c;
            this.dingzStates.LED.saturation = hsv.s;
            this.dingzStates.LED.value = hsv.i;
          }

          ledService
            .getCharacteristic(this.platform.Characteristic.Hue)
            .setValue(this.dingzStates.LED.hue);
          ledService
            .getCharacteristic(this.platform.Characteristic.Saturation)
            .setValue(this.dingzStates.LED.saturation);
          ledService
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .setValue(this.dingzStates.LED.value);
          ledService
            .getCharacteristic(this.platform.Characteristic.On)
            .setValue(this.dingzStates.LED.on);
          this.platform.log.debug(
            'Pushed updated current LED state to HomeKit ->',
            this.dingzStates.LED,
          );
        })
        .catch((e) => {
          this.platform.log.debug(
            'Error while retrieving LED Device Report ->',
            e,
          );
        });
    }, 10000);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  private setLEDOn(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to turn your device on/off
    this.platform.log.debug('Set LED Characteristic On ->', value);
    this.dingzStates.LED.on = value as boolean;
    const state = this.dingzStates.LED;
    this.setDeviceLED({ isOn: state.on });
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getLEDOn(callback: CharacteristicGetCallback) {
    // implement your own code to check if the device is on
    const isOn = this.dingzStates.LED.on;
    this.platform.log.debug('Get LED Characteristic On ->', isOn);

    callback(null, isOn);
  }

  private setLEDHue(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness    const isOn: boolean = value > 0 ? true : false;
    this.dingzStates.LED.hue = value as number;

    this.platform.log.debug('Set LED Characteristic Hue -> ', value);
    const state: DingzLEDState = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;
    this.setDeviceLED({
      isOn: state.on,
      color: color,
    });
    callback(null);
  }

  private setLEDSaturation(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    this.dingzStates.LED.saturation = value as number;

    this.platform.log.debug('Set LED Characteristic Saturation -> ', value);
    const state: DingzLEDState = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;
    this.setDeviceLED({
      isOn: state.on,
      color: color,
    });
    callback(null);
  }

  private setLEDBrightness(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    // implement your own code to set the brightness
    this.dingzStates.LED.value = value as number;

    this.platform.log.debug('Set LED Characteristic Brightness -> ', value);
    // Call setDimmerValue()
    const state: DingzLEDState = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;
    this.setDeviceLED({
      isOn: state.on,
      color: color,
    });
    callback(null);
  }

  // Disposes the Accessory
  dispose() {
    // Dispose of intervals
    this.platform.log.debug('Clearing timers ->', this.dimmerTimers);
    if (this.motionTimer) {
      clearTimeout(this.motionTimer);
    }

    for (const key in this.dimmerTimers) {
      clearTimeout(this.dimmerTimers[key]);
    }
  }

  /**
   * Device Methods -- these are used to retrieve the data from the Dingz
   * TODO: Refactor duplicate code into proper API caller
   */

  private async getDingzDeviceInfo(): Promise<DingzDeviceInfo> {
    const dingzDevices = await this.platform.getDingzDeviceInfo({
      address: this.device.address,
      token: this.device.token,
    });
    try {
      const dingzDeviceInfo: DingzDeviceInfo = (dingzDevices as DingzDevices)[
        this.device.mac
      ];
      if (dingzDeviceInfo) {
        return dingzDeviceInfo;
      }
    } catch (e) {
      this.platform.log.debug('Error in getting Device Info ->', e.message);
    }
    throw new Error('Dingz Device update failed -> Empty data.');
  }

  // Data Fetchers
  private async getDeviceTemperature(): Promise<DingzTemperatureData> {
    const getTemperatureUrl = `${this.baseUrl}/api/v1/temp`;
    return await this.platform.fetch({
      url: getTemperatureUrl,
      returnBody: true,
      token: this.device.token,
    });
  }

  private async getDeviceMotion(): Promise<DingzMotionData> {
    const getMotionUrl = `${this.baseUrl}/api/v1/motion`;
    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: getMotionUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
  }

  // Set individual dimmer
  private async setDeviceDimmer(
    id: DimmerId,
    isOn?: boolean,
    level?: number,
  ): Promise<void> {
    // /api/v1/dimmer/<DIMMER>/on/?value=<value>
    this.platform.log.debug(
      `Dimmer ${id} set to ${isOn}: ${level ? level : 'Keep level'}`,
    );
    const setDimmerUrl = `${this.baseUrl}/api/v1/dimmer/${id}/${
      isOn ? 'on' : 'off'
    }/${level ? '?value=' + level : ''}`;
    await this.platform.fetch({
      url: setDimmerUrl,
      method: 'POST',
      token: this.device.token,
    });
  }

  private async getDeviceDimmer(
    id: DimmerId,
  ): Promise<DingzDimmerState | undefined> {
    const getDimmerUrl = `${this.baseUrl}/api/v1/dimmer/${id}`;
    return await this.platform.fetch({
      url: getDimmerUrl,
      returnBody: true,
      token: this.device.token,
    });
  }

  // Get all values at once
  private async getDeviceDimmers(): Promise<DimmerProps | undefined> {
    const getDimmerUrl = `${this.baseUrl}/api/v1/dimmer/`;
    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: getDimmerUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
  }

  // Set individual dimmer
  private async setWindowCovering(
    id: WindowCoveringId,
    blind?: number,
    lamella?: number,
  ): Promise<void> {
    // {{ip}}/api/v1/shade/0?blind=<value>&lamella=<value>
    const setWindowCoveringUrl = `${this.baseUrl}/api/v1/dimmer/${id}/?${
      blind ? '&blind=' + blind : ''
    }${lamella ? '&lamella=' + lamella : ''}`;
    await this.platform.fetch({
      url: setWindowCoveringUrl,
      method: 'POST',
      token: this.device.token,
    });
  }

  private async getWindowCovering(
    id: WindowCoveringId,
  ): Promise<WindowCoveringState> {
    const getWindowCoveringUrl = `${this.baseUrl}/api/v1/shade/${id}`;
    return await this.platform.fetch({
      url: getWindowCoveringUrl,
      returnBody: true,
      token: this.device.token,
    });
  }

  private async getWindowCoverings(): Promise<WindowCoveringProps> {
    const getWindowCoveringUrl = `${this.baseUrl}/api/v1/shade/`;
    return await this.platform.fetch({
      url: getWindowCoveringUrl,
      returnBody: true,
      token: this.device.token,
    });
  }

  // TODO: Feedback on API doc
  private async setDeviceLED({
    isOn,
    color,
  }: {
    isOn: boolean;
    color?: string;
  }): Promise<void> {
    const setDimmerUrl = `${this.baseUrl}/api/v1/led/set`;
    await this.platform.fetch({
      url: setDimmerUrl,
      method: 'POST',
      token: this.device.token,
      body: qs.stringify({
        action: isOn ? 'on' : 'off',
        color: color ?? undefined,
        mode: color ? 'hsv' : undefined,
        ramp: 150,
      }),
    });
  }

  private async getDeviceLED(): Promise<DingzLEDState> {
    const reportUrl = `${this.baseUrl}/api/v1/led/get`;
    return await this.platform.fetch({
      url: reportUrl,
      returnBody: true,
      token: this.device.token,
    });
  }

  private async getDeviceInputConfig(): Promise<DingzInputInfo> {
    const setDimmerUrl = `${this.baseUrl}/api/v1/input_config`; // /api/v1/dimmer/<DIMMER>/on/?value=<value>

    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: setDimmerUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
  }
}

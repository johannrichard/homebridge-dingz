import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { EventEmitter } from 'events';
import { Policy } from 'cockatiel';
import { Mutex } from 'async-mutex';
import simpleColorConverter from 'simple-color-converter';
import qs from 'qs';

// Internal types
import {
  ButtonId,
  ButtonState,
  DimmerId,
  DimmerState,
  DimmerTimer,
  DingzDeviceInfo,
  DingzDimmerConfig,
  DingzDimmerConfigValue,
  DingzInputConfig,
  DingzInputInfoItem,
  DingzLEDState,
  DingzMotionData,
  DingzState,
  WindowCoveringId,
  WindowCoveringTimer,
  WindowCoveringState,
} from './util/dingzTypes';
import {
  ButtonAction,
  DeviceInfo,
  AccessoryActionUrl,
} from './util/commonTypes';

import {
  MethodNotImplementedError,
  DeviceNotReachableError,
} from './util/errors';
import { DingzDaHomebridgePlatform } from './platform';
import { DingzEvent } from './util/dingzEventBus';

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
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class DingzDaAccessory extends EventEmitter {
  private readonly mutex = new Mutex();

  private services: Service[] = [];
  private motionService?: Service;

  private _updatedDeviceInfo?: DingzDeviceInfo;
  private _updatedDeviceInputConfig?: DingzInputInfoItem;

  private switchOn = false;
  private device: DeviceInfo;
  private dingzDeviceInfo: DingzDeviceInfo;
  private baseUrl: string;

  // Todo: Make proper internal representation
  private dingzStates = {
    // Outputs
    Dimmers: [] as DimmerState[],
    WindowCovers: [] as WindowCoveringState[],
    LED: {
      on: false,
      hsv: '0;0;100',
      rgb: 'FFFFFF',
      mode: 'hsv',
    } as DingzLEDState,
    // Inputs
    Buttons: {
      '1': { event: ButtonAction.SINGLE_PRESS, state: ButtonState.OFF },
      '2': { event: ButtonAction.SINGLE_PRESS, state: ButtonState.OFF },
      '3': { event: ButtonAction.SINGLE_PRESS, state: ButtonState.OFF },
      '4': { event: ButtonAction.SINGLE_PRESS, state: ButtonState.OFF },
    },
    // Sensors
    Temperature: 0,
    Motion: false,
    Brightness: 0,
  };

  // Take stock of intervals to dispose at the end of the life of the Accessory
  private serviceTimers: NodeJS.Timer[] = [];
  private motionTimer?: NodeJS.Timer;
  private dimmerTimers = {} as DimmerTimer;
  private windowCoveringTimers = {} as WindowCoveringTimer;

  constructor(
    private readonly platform: DingzDaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    super();

    // Set Base URL
    this.device = this.accessory.context.device;
    this.dingzDeviceInfo = this.device.hwInfo as DingzDeviceInfo;
    this.baseUrl = `http://${this.device.address}`;

    // Sanity check for "empty" SerialNumber
    this.platform.log.debug(
      `Attempting to set SerialNumber (which can not be empty) -> puck_sn: <${this.dingzDeviceInfo.puck_sn}>`,
    );
    const serialNumber: string =
      this.dingzDeviceInfo.puck_sn === ''
        ? this.device.mac // MAC will always be defined for a correct device
        : this.dingzDeviceInfo.puck_sn;
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .updateCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        this.device.name,
      )
      .updateCharacteristic(this.platform.Characteristic.Name, this.device.name)
      .updateCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'iolo AG',
      )
      .updateCharacteristic(
        this.platform.Characteristic.AppMatchingIdentifier,
        'ch.iolo.dingz.consumer',
      )
      .updateCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .updateCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.dingzDeviceInfo.fw_version ?? 'Unknown',
      )
      .updateCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.dingzDeviceInfo.hw_version_puck ?? 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        serialNumber,
      );
    /****
     * How to discover Accessories:
     * - Check for UDP Packets and/or use manually configured accessories
     */

    // Add Dimmers, Blinds etc.
    this.platform.log.info(
      'Adding output devices for ',
      this.device.address,
      ' -> [...]',
    );

    // FIXME: Is there a better way to handle errors?
    this.getConfigs()
      .then(([inputConfig, dimmerConfig]) => {
        if (
          inputConfig?.inputs &&
          dimmerConfig?.dimmers &&
          dimmerConfig?.dimmers.length === 4
        ) {
          this.device.dingzInputInfo = inputConfig.inputs;
          this.device.dimmerConfig = dimmerConfig;

          // Now we have what we need and can create the services …
          this.addOutputServices();
          setInterval(() => {
            // TODO: Set rechability if call times out too many times
            // Set up an interval to fetch Dimmer states
            this.getDeviceState().then((state) => {
              if (typeof state !== 'undefined' && state?.config) {
                // Outputs
                this.dingzStates.Dimmers = state.dimmers;
                this.dingzStates.LED = state.led;
                // Sensors
                this.dingzStates.Temperature = state.sensors.room_temperature;
                this.dingzStates.Brightness = state.sensors.brightness;
                this.platform.eb.emit(DingzEvent.STATE_UPDATE);
              }
            });
          }, 10000);
        }
      }) // FIXME: Don't chain this way, improve error handling
      .then(() => {
        /**
         * Add auxiliary services (Motion, Temperature)
         */
        if (this.dingzDeviceInfo.has_pir) {
          // dingz has a Motion sensor -- let's create it
          this.addMotionService();
        } else {
          this.platform.log.info(
            'Your dingz',
            this.accessory.displayName,
            'has no Motion sensor.',
          );
        }
        // dingz has a temperature sensor and an LED,
        // make these available here
        this.addTemperatureService();
        this.addLEDService();
        this.addLightSensorService();
        this.addButtonServices();

        this.services.forEach((service) => {
          this.platform.log.info(
            'Service created ->',
            service.getCharacteristic(this.platform.Characteristic.Name).value,
          );
        });

        this.enablePIRCallback();
        this.getButtonCallbackUrl().then((callBackUrl) => {
          if (!callBackUrl?.url.includes(this.platform.getCallbackUrl())) {
            this.platform.log.warn(
              'Update existing callback URL ->',
              callBackUrl,
            );
            // Set the callback URL (Override!)
            const endpoints = this.dingzDeviceInfo.has_pir
              ? ['generic', 'pir/single']
              : ['generic'];
            this.platform.setButtonCallbackUrl({
              baseUrl: this.baseUrl,
              token: this.device.token,
              oldUrl: callBackUrl.url,
              endpoints: endpoints,
            });
          } else {
            this.platform.log.debug(
              'Callback URL already set ->',
              callBackUrl?.url,
            );
          }
        });

        // Retry at least once every day
        retrySlow.execute(() => {
          this.updateAccessory();
          return true;
        });
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

    this.platform.eb.on(
      DingzEvent.STATE_UPDATE,
      this.updateTemperature.bind(this, temperatureService),
    );
  }

  private updateTemperature(temperatureService: Service) {
    const currentTemperature: number = this.dingzStates.Temperature;

    temperatureService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .updateValue(currentTemperature);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * to get the current value of the "Current Temperature" characteristic
   */
  private getTemperature(callback: CharacteristicSetCallback) {
    // set this to a valid value for CurrentTemperature
    const currentTemperature: number = this.dingzStates.Temperature;
    callback(null, currentTemperature);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Motion Detected" characteristic
   */
  private getMotionDetected(callback: CharacteristicSetCallback) {
    // set this to a valid value for MotionDetected
    const isMotion = this.dingzStates.Motion;
    callback(null, isMotion);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.platform.log.info(
      'Identify! -> Who am I? I am',
      this.accessory.displayName,
      '-> MAC:',
      this.device.mac,
    );
  }

  private addLightSensorService() {
    // Add the LightSensor that's integrated in the dingz
    // API: /api/v1/light

    const lightService =
      this.accessory.getService(this.platform.Service.LightSensor) ??
      this.accessory.addService(this.platform.Service.LightSensor);

    lightService.setCharacteristic(this.platform.Characteristic.Name, 'Light');
    this.services.push(lightService);

    this.platform.eb.on(
      DingzEvent.STATE_UPDATE,
      this.updateLightSensor.bind(this, lightService),
    );
  }

  private updateLightSensor(lightService: Service) {
    const intensity: number = this.dingzStates.Brightness;
    lightService
      .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .updateValue(intensity);
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
    const dimmerConfig: DingzDimmerConfig | undefined = this.device
      .dimmerConfig;

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
          dimmerServices.push(
            this.addDimmerService({
              name: dimmerConfig?.dimmers[0].name,
              output: dimmerConfig?.dimmers[0].output,
              id: 'D1',
              index: 0,
            }),
          );
        }
        // D1, D2, D3
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[1].name,
            output: dimmerConfig?.dimmers[1].output,
            id: 'D2',
            index: 1,
          }),
        );
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[2].name,
            output: dimmerConfig?.dimmers[2].output,
            id: 'D3',
            index: 2,
          }),
        );
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[3].name,
            output: dimmerConfig?.dimmers[3].output,
            id: 'D4',
            index: 3,
          }),
        );
        break;
      case 2:
        // DIP = 1: M0, D2, D3;
        windowCoverServices.push(this.addWindowCoveringService('Blind', 0));
        // Dimmers are always 0 based
        // i.e. if outputs 1 / 2 are for blinds, outputs 3/4 will be dimmer 0/1
        // We use the "index" value of the dingz to determine what to use
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[0].name,
            output: dimmerConfig?.dimmers[0].output,
            id: 'D3',
            index: 0,
          }),
        );
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[1].name,
            output: dimmerConfig?.dimmers[1].output,
            id: 'D4',
            index: 1,
          }),
        );
        break;
      case 1:
        // DIP = 2: D0, D1, M1; (Unless Input, then D1, M1);
        if (inputConfig && !inputConfig[0].active) {
          // D0
          dimmerServices.push(
            this.addDimmerService({
              name: dimmerConfig?.dimmers[0].name,
              output: dimmerConfig?.dimmers[0].output,
              id: 'D1',
              index: 0,
            }),
          );
        }
        dimmerServices.push(
          this.addDimmerService({
            name: dimmerConfig?.dimmers[1].name,
            output: dimmerConfig?.dimmers[1].output,
            id: 'D2',
            index: 1,
          }),
        );
        windowCoverServices.push(this.addWindowCoveringService('Blind', 0));
        break;
      case 0:
        // DIP = 3: M0, M1;
        windowCoverServices.push(this.addWindowCoveringService('Blind', 0));
        windowCoverServices.push(this.addWindowCoveringService('Blind', 1));
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

  private addButtonServices() {
    // Create Buttons
    // Add Event Listeners
    this.services.push(this.addButtonService('dingz Button 1', '1'));
    this.services.push(this.addButtonService('dingz Button 2', '2'));
    this.services.push(this.addButtonService('dingz Button 3', '3'));
    this.services.push(this.addButtonService('dingz Button 4', '4'));

    this.platform.eb.on(
      DingzEvent.BTN_PRESS,
      (mac, action: ButtonAction, button: ButtonId | '5') => {
        if (mac === this.device.mac && button) {
          this.platform.log.debug(
            `Button ${button} of ${this.device.name} pressed -> ${action}, MAC: ${mac} (This: ${this.device.mac})`,
          );
          if (button === '5') {
            // PUSH MOTION
            if (!(this.platform.config.motionPoller ?? true)) {
              this.platform.log.debug(
                `Button ${button} of ${this.device.name} Motion -> ${action}`,
              );
              this.platform.log.debug('Motion Update from CALLBACK');
              this.motionService
                ?.getCharacteristic(this.platform.Characteristic.MotionDetected)
                .updateValue(
                  action === ButtonAction.PIR_MOTION_START ? true : false,
                );
            }
          } else {
            this.dingzStates.Buttons[button].event = action ?? 1;
            this.dingzStates.Buttons[button].state =
              this.dingzStates.Buttons[button].state === ButtonState.OFF
                ? ButtonState.ON
                : ButtonState.OFF;
            const service = this.accessory.getServiceById(
              this.platform.Service.StatelessProgrammableSwitch,
              button,
            );
            const ProgrammableSwitchEvent = this.platform.Characteristic
              .ProgrammableSwitchEvent;
            service
              ?.getCharacteristic(
                this.platform.Characteristic.ProgrammableSwitchOutputState,
              )
              .updateValue(this.dingzStates.Buttons[button].state);
            this.platform.log.info(
              `Button ${button} of ${this.device.name} (${service?.displayName}) pressed -> ${action}`,
            );
            switch (action) {
              case ButtonAction.SINGLE_PRESS:
                service
                  ?.getCharacteristic(ProgrammableSwitchEvent)
                  .updateValue(ProgrammableSwitchEvent.SINGLE_PRESS);
                break;
              case ButtonAction.DOUBLE_PRESS:
                service
                  ?.getCharacteristic(ProgrammableSwitchEvent)
                  .updateValue(ProgrammableSwitchEvent.DOUBLE_PRESS);
                break;
              case ButtonAction.LONG_PRESS:
                service
                  ?.getCharacteristic(ProgrammableSwitchEvent)
                  .updateValue(ProgrammableSwitchEvent.LONG_PRESS);
                break;
            }
          }
        }
      },
    );
  }

  private addButtonService(name: string, button: ButtonId): Service {
    this.platform.log.debug('Adding Button Service ->', name, ' -> ', button);

    const buttonService =
      this.accessory.getServiceById(
        this.platform.Service.StatelessProgrammableSwitch,
        button,
      ) ??
      this.accessory.addService(
        this.platform.Service.StatelessProgrammableSwitch,
        name ?? `dingz Button ${button}`, // Name Dimmers according to WebUI, not API info
        button,
      );

    buttonService.setCharacteristic(
      this.platform.Characteristic.ServiceLabelIndex,
      button,
    );

    // Stateful Programmable Switches are not anymore exposed in HomeKit. However,
    //  the "ProgrammableSwitchOutputState" Characteristic added to a
    // StatelessProgrammableSwitch (i.e., a button), can be read out -- and used --
    // by third-party apps for HomeKite, allowing users to create automations
    // not only based on the button events, but also based on a state that's toggled
    buttonService
      .getCharacteristic(
        this.platform.Characteristic.ProgrammableSwitchOutputState,
      )
      .on(
        CharacteristicEventTypes.GET,
        this.getSwitchButtonState.bind(this, button),
      );
    // .on(
    //   CharacteristicEventTypes.SET,
    //   this.setSwitchButtonState.bind(this, button),
    // );

    buttonService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .on(CharacteristicEventTypes.GET, this.getButtonState.bind(this, button));

    return buttonService;
  }

  private getButtonState(
    button: ButtonId,
    callback: CharacteristicGetCallback,
  ) {
    const currentState = this.dingzStates.Buttons[button].event;
    callback(null, currentState);
  }

  private getSwitchButtonState(
    button: ButtonId,
    callback: CharacteristicGetCallback,
  ) {
    const currentState = this.dingzStates.Buttons[button].state;
    this.platform.log.info(
      'Get Switch State ->',
      button,
      '-> state:',
      currentState,
    );
    callback(null, currentState);
  }

  private setSwitchButtonState(
    button: ButtonId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.Buttons[button].state = value as ButtonState;
    this.platform.log.info('Set Switch State ->', button, '-> state:', value);
    callback(null);
  }

  private addDimmerService({
    name,
    output,
    id,
    index,
  }: {
    name?: string;
    output?: DingzDimmerConfigValue;
    id: 'D1' | 'D2' | 'D3' | 'D4';
    index: DimmerId;
  }) {
    // Service doesn't yet exist, create new one
    const newService =
      this.accessory.getServiceById(this.platform.Service.Lightbulb, id) ??
      this.accessory.addService(
        this.platform.Service.Lightbulb,
        name ?? `Dimmer ${id}`, // Name Dimmers according to WebUI, not API info
        id,
      );

    // register handlers for the On/Off Characteristic
    newService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this, index)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this, index)); // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic but only if not dimmable
    if (output && output !== 'non_dimmable') {
      newService
        .getCharacteristic(this.platform.Characteristic.Brightness)
        .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this, index)); // SET - bind to the 'setBrightness` method below
    }

    // Update State
    this.platform.eb.on(
      DingzEvent.STATE_UPDATE,
      this.updateDimmerState.bind(this, index, output, newService, id),
    );
    return newService;
  }

  private updateDimmerState(
    index: number,
    output: string | undefined,
    newService: Service,
    id: string,
  ) {
    if (index) {
      // index set
      const state = this.dingzStates.Dimmers[index];
      // Check that "state" is valid
      if (state) {
        if (output && output !== 'non_dimmable') {
          newService
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .updateValue(state.value);
        }
        newService
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(state.on);
      } else {
        this.platform.log.warn(
          'We have an issue here: state should be non-empty but is undefined.',
          'Continue here, not killing myself anymore.',
          `For the records, device: ${this.device.address} - id: ${id},  index: ${index} and output is: `,
          JSON.stringify(this.dingzStates),
        );
      }
    }
  }

  private removeDimmerService(id: 'D1' | 'D2' | 'D3' | 'D4') {
    // Remove DimmerService
    const service: Service | undefined = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id,
    );
    if (service) {
      this.platform.log.debug('Removing Dimmer ->', service.displayName);
      clearTimeout(this.dimmerTimers[id]);
      this.accessory.removeService(service);
    }
  }

  private setOn(
    index: DimmerId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    try {
      this.dingzStates.Dimmers[index].on = value as boolean;
      this.setDeviceDimmer(index, value as boolean);
    } catch (e) {
      this.platform.log.error(
        'Error ->',
        e.name,
        ', unable to set Dimmer data ',
        index,
      );
    }
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getOn(index: DimmerId, callback: CharacteristicGetCallback) {
    const isOn: boolean = this.dingzStates.Dimmers[index]?.on ?? false;
    callback(null, isOn);
  }

  private async setBrightness(
    index: DimmerId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const isOn: boolean = value > 0 ? true : false;
    this.dingzStates.Dimmers[index].value = value as number;
    this.dingzStates.Dimmers[index].on = isOn;

    await this.setDeviceDimmer(index, isOn, value as number);
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

    // Set min/max Values
    // FIXME: #24 different modes with/without lamella exist
    service
      .getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
      .setProps({ minValue: 0, maxValue: 90 }) // dingz Maximum values
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
    service
      .getCharacteristic(this.platform.Characteristic.PositionState)
      .on(
        CharacteristicEventTypes.GET,
        this.getPositionState.bind(this, id as WindowCoveringId),
      );

    const updateInterval: NodeJS.Timer = setInterval(() => {
      try {
        this.getWindowCovering(id as WindowCoveringId).then((state) => {
          if (typeof state !== 'undefined' && typeof id === 'number') {
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
              state,
            );
          } else {
            this.platform.log.warn(
              'Failed to push updated Window Covering',
              state,
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
    }, 5000);

    if (id && updateInterval) {
      this.windowCoveringTimers[id as number] = updateInterval;
    }

    // this.platform.eb.on(
    //   DingzEvent.STATE_UPDATE,
    //   this.updateWindowCoveringState.bind(
    //     this,
    //     id as WindowCoveringId,
    //     service,
    //   ),
    // );
    return service;
  }

  // Window Covering functions
  // TODO: Use available information to more accurately set WindowCovering State
  private updateWindowCoveringState(id: WindowCoveringId, service: Service) {
    const state: WindowCoveringState = this.dingzStates.WindowCovers[id];

    if (state) {
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
        .updateValue((state.current.lamella / 100) * 90); // Set in °, Get in % (...)

      let positionState: number;
      if (state.target.blind > state.current.blind) {
        positionState = this.platform.Characteristic.PositionState.DECREASING;
      } else if (state.target.blind < state.current.blind) {
        positionState = this.platform.Characteristic.PositionState.INCREASING;
      } else {
        positionState = this.platform.Characteristic.PositionState.STOPPED;
      }
      this.platform.log.debug('WindowCovering Position State:', positionState);
      service
        .getCharacteristic(this.platform.Characteristic.PositionState)
        .setValue(positionState);
      // .updateValue(positionState);
    }
  }

  private async setPosition(
    id: WindowCoveringId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const blind: number = value as number;

    if (this.dingzStates.WindowCovers[id]) {
      const lamella: number = this.dingzStates.WindowCovers[id].target.lamella;
      this.dingzStates.WindowCovers[id].target.blind = blind;

      await this.setWindowCovering(id, blind, lamella);
    }
    callback(null);
  }

  private getPosition(
    id: WindowCoveringId,
    callback: CharacteristicGetCallback,
  ) {
    this.platform.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    const blind: number = this.dingzStates.WindowCovers[id]?.current.blind;

    this.platform.log.debug(
      'Get Characteristic for WindowCovering',
      id,
      'Current Position ->',
      blind,
    );

    callback(null, blind);
  }

  private async setTiltAngle(
    id: WindowCoveringId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const blind: number = this.dingzStates.WindowCovers[id].target.blind;
    const lamella: number = value as number;
    this.dingzStates.WindowCovers[id].target.lamella = lamella;

    this.platform.log.debug(
      'Set Characteristic TargetHorizontalTiltAngle on ',
      id,
      '->',
      value,
    );
    await this.setWindowCovering(id, blind, lamella);
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

    callback(null, tiltAngle);
  }

  private getPositionState(
    id: WindowCoveringId,
    callback: CharacteristicGetCallback,
  ) {
    this.platform.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    let positionState = 0;
    const state = this.dingzStates.WindowCovers[id];
    if (state) {
      if (state.target.blind > state.current.blind) {
        positionState = this.platform.Characteristic.PositionState.DECREASING;
      } else if (state.target.blind < state.current.blind) {
        positionState = this.platform.Characteristic.PositionState.INCREASING;
      } else {
        positionState = this.platform.Characteristic.PositionState.STOPPED;
      }
      this.platform.log.debug('WindowCovering Position State:', positionState);

      this.platform.log.debug(
        'Get Characteristic for WindowCovering',
        id,
        'Current Position State ->',
        positionState,
      );
    }

    callback(null, positionState);
  }

  /**
   * Motion Service Methods
   */
  private addMotionService() {
    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);
    this.motionService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Motion',
    );
    this.services.push(this.motionService);
    // Only check for motion if we have a PIR and set the Interval
    if (this.platform.config.motionPoller ?? true) {
      this.platform.log.info('Motion POLLING of', this.device.name, 'enabled');
      const motionInterval: NodeJS.Timer = setInterval(() => {
        this.getDeviceMotion()
          .then((data) => {
            if (data?.success) {
              const isMotion: boolean = data.motion;
              // Only update if motionService exists *and* if there's a change in motion'
              if (this.motionService && this.dingzStates.Motion !== isMotion) {
                this.platform.log.debug('Motion Update from POLLER');
                this.dingzStates.Motion = isMotion;
                this.motionService
                  ?.getCharacteristic(
                    this.platform.Characteristic.MotionDetected,
                  )
                  .updateValue(isMotion);
              }
            } else {
              throw new DeviceNotReachableError(
                `Device can not be reached ->
              ${this.device.name}-> ${this.device.address}`,
              );
            }
          })
          .catch((e) => {
            this.platform.log.error(
              'Error ->',
              e.name,
              ', unable to fetch DeviceMotion data',
            );
          });
      }, 2000); // Shorter term updates for motion sensor
      this.motionTimer = motionInterval;
    }
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
      this.platform.log.info('Removing Motion service ->', service.displayName);
      this.accessory.removeService(service);
    }
  }

  // Updates the Accessory (e.g. if the config has changed)
  private async updateAccessory(): Promise<void> {
    this.platform.log.info(
      'Update accessory ',
      this.device.address,
      '-> Check for changed config.',
    );

    this.getConfigs().then(([inputConfig, dimmerConfig]) => {
      if (inputConfig?.inputs[0]) {
        this._updatedDeviceInputConfig = inputConfig.inputs[0];
      }
      this.device.dimmerConfig = dimmerConfig;
    });

    this.getDingzDeviceInfo().then((deviceInfo) => {
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

    const dimmerConfig: DingzDimmerConfig | undefined = this.device
      .dimmerConfig;

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
          this.accessory.getServiceById(this.platform.Service.Lightbulb, 'D1')
        ) {
          this.platform.log.warn(
            'Input active. Dimmer Service 0 can not exist -> remove',
          );
          this.removeDimmerService('D1');
        }
      } else if (
        !updatedDingzInputInfo.active &&
        !this.accessory.getServiceById(this.platform.Service.Lightbulb, 'D1') &&
        (updatedDingzDeviceInfo.dip_config === 1 ||
          updatedDingzDeviceInfo.dip_config === 3)
      ) {
        // Only add Dimmer 0 if we're not in "WindowCover" mode
        this.platform.log.warn(
          'No Input defined. Attempting to add Dimmer Service D1.',
        );
        this.addDimmerService({
          name: dimmerConfig?.dimmers[0].name,
          output: dimmerConfig?.dimmers[0].output,
          id: 'D1',
          index: 0,
        });
      }
      // DIP overrides Input
      if (
        currentDingzDeviceInfo &&
        currentDingzDeviceInfo.dip_config !== updatedDingzDeviceInfo.dip_config
      ) {
        // Update Dimmer & Blinds Services
        throw new MethodNotImplementedError(
          'Update Dimmer accessories not yet implemented -> ' +
            this.accessory.displayName,
        );
      }

      this.updateDimmerServices();
    } finally {
      this.accessory.context.device.dingzDeviceInfo = updatedDingzDeviceInfo;
      this.accessory.context.device.dingzInputInfo = [updatedDingzInputInfo];
    }
  }

  // Updates the Dimemr Services with their correct name
  private updateDimmerServices() {
    // Figure out what we have here
    switch (this.dingzDeviceInfo.dip_config) {
      case 3:
        this.setDimmerConfig('D1', 0);
        this.setDimmerConfig('D2', 1);
        this.setDimmerConfig('D3', 2);
        this.setDimmerConfig('D4', 3);
        break;
      case 2:
      case 1:
        this.setDimmerConfig('D1', 0);
        this.setDimmerConfig('D2', 1);
        break;
      case 0:
      default:
        break;
    }
  }

  private setDimmerConfig(id: 'D1' | 'D2' | 'D3' | 'D4', index: DimmerId) {
    const service: Service | undefined = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id,
    );
    if (service) {
      const dimmerConfig = this.device.dimmerConfig;
      service.setCharacteristic(
        this.platform.Characteristic.Name,
        dimmerConfig?.dimmers[index].name ?? `Dimmer ${id}`,
      );
      if (dimmerConfig?.dimmers[index].output === 'non_dimmable') {
        service.removeCharacteristic(
          service.getCharacteristic(this.platform.Characteristic.Brightness),
        );
      } else if (
        !service.testCharacteristic(this.platform.Characteristic.Brightness)
      ) {
        // Only add listeners if needed, i.e. if Characteristic is not yet defined
        service.addCharacteristic(this.platform.Characteristic.Brightness);
        service
          .getCharacteristic(this.platform.Characteristic.Brightness)
          .on(
            CharacteristicEventTypes.SET,
            this.setBrightness.bind(this, index),
          ); // SET - bind to the 'setBrightness` method below
      }
    }
  }

  private addLEDService() {
    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    const ledService =
      this.accessory.getServiceById(this.platform.Service.Lightbulb, 'LED') ??
      this.accessory.addService(this.platform.Service.Lightbulb, 'LED', 'LED');

    // set the service name, this is what is displayed as the default name on the Home app
    ledService.setCharacteristic(this.platform.Characteristic.Name, 'LED');

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
    this.platform.eb.on(
      DingzEvent.STATE_UPDATE,
      this.updateLEDState.bind(this, ledService),
    );
  }

  private updateLEDState(ledService: Service) {
    const state: DingzLEDState = this.dingzStates.LED;
    if (state.mode === 'hsv') {
      const hsv = state.hsv.split(';');
      this.dingzStates.LED.hue = parseInt(hsv[0]);
      this.dingzStates.LED.saturation = parseInt(hsv[1]);
      this.dingzStates.LED.value = parseInt(hsv[2]);
    } else {
      // rgbw
      const hsv = new simpleColorConverter({
        color: `hex #${state.rgb}`,
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
  }

  private setLEDOn(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.on = value as boolean;
    const state = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;
    this.setDeviceLED({ isOn: state.on, color: color });
    callback(null);
  }

  private getLEDOn(callback: CharacteristicGetCallback) {
    const isOn = this.dingzStates.LED.on;
    callback(null, isOn);
  }

  private setLEDHue(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.hue = value as number;

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
    this.dingzStates.LED.saturation = value as number;

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
    this.dingzStates.LED.value = value as number;

    const state: DingzLEDState = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;
    this.setDeviceLED({
      isOn: state.on,
      color: color,
    });
    callback(null);
  }

  /**
   * Device Methods -- these are used to retrieve the data from the Dingz
   * TODO: Refactor duplicate code into proper API caller
   */
  private async getDingzDeviceInfo(): Promise<DingzDeviceInfo> {
    const [dingzDevices] = await this.platform.getDingzDeviceInfo({
      address: this.device.address,
      token: this.device.token,
    });
    try {
      const dingzDeviceInfo: DingzDeviceInfo = dingzDevices[this.device.mac];
      if (dingzDeviceInfo) {
        return dingzDeviceInfo;
      }
    } catch (e) {
      this.platform.log.error('Error in getting Device Info ->', e.message);
    }
    throw new Error('dingz Device update failed -> Empty data.');
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
    index: DimmerId,
    isOn?: boolean,
    level?: number,
  ): Promise<void> {
    // /api/v1/dimmer/<DIMMER>/on/?value=<value>
    const setDimmerUrl = `${this.baseUrl}/api/v1/dimmer/${index}/${
      isOn ? 'on' : 'off'
    }/${level ? '?value=' + level : ''}`;
    await this.platform.fetch({
      url: setDimmerUrl,
      method: 'POST',
      token: this.device.token,
    });
  }

  // Set individual dimmer
  private async setWindowCovering(
    id: WindowCoveringId,
    blind: number,
    lamella: number,
  ): Promise<void> {
    // {{ip}}/api/v1/shade/0?blind=<value>&lamella=<value>
    const setWindowCoveringUrl = `${this.baseUrl}/api/v1/shade/${id}/`;
    await this.platform.fetch({
      url: setWindowCoveringUrl,
      method: 'POST',
      token: this.device.token,
      body: qs.stringify(
        {
          blind: blind,
          lamella: lamella,
        },
        { encode: false },
      ),
    });
  }

  // We need Target vs Current to accurately update WindowCoverings
  private async getWindowCovering(
    id: WindowCoveringId,
  ): Promise<WindowCoveringState> {
    const getWindowCoveringUrl = `${this.baseUrl}/api/v1/shade/${id}`;
    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: getWindowCoveringUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
  }

  // TODO: Feedback on API doc
  private async setDeviceLED({
    isOn,
    color,
  }: {
    isOn: boolean;
    color: string;
  }): Promise<void> {
    const setLEDUrl = `${this.baseUrl}/api/v1/led/set`;
    await this.platform.fetch({
      url: setLEDUrl,
      method: 'POST',
      token: this.device.token,
      body: qs.stringify(
        {
          action: isOn ? 'on' : 'off',
          color: color,
          mode: 'hsv', // Fixed for the time being
          ramp: 150,
        },
        { encode: false },
      ),
    });
  }

  // Get Input & Dimmer Config
  private async getConfigs(): Promise<[DingzInputConfig, DingzDimmerConfig]> {
    const getInputConfigUrl = `${this.baseUrl}/api/v1/input_config`;
    const getDimmerConfigUrl = `${this.baseUrl}/api/v1/dimmer_config`;

    return Promise.all<DingzInputConfig, DingzDimmerConfig>([
      this.platform.fetch({
        url: getInputConfigUrl,
        returnBody: true,
        token: this.device.token,
      }),
      this.platform.fetch({
        url: getDimmerConfigUrl,
        returnBody: true,
        token: this.device.token,
      }),
    ]);
  }

  private async getDeviceState(): Promise<DingzState> {
    const getDeviceStateUrl = `${this.baseUrl}/api/v1/state`;
    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: getDeviceStateUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
  }

  // GEt the callback URL for the device
  public async getButtonCallbackUrl(): Promise<AccessoryActionUrl> {
    const getCallbackUrl = `${this.baseUrl}/api/v1/action/generic/generic`;
    this.platform.log.debug('Getting the callback URL -> ', getCallbackUrl);
    return await this.platform.fetch({
      url: getCallbackUrl,
      method: 'GET',
      token: this.device.token,
      returnBody: true,
    });
  }

  async enablePIRCallback() {
    const setActionUrl = `${this.baseUrl}/api/v1/action/pir/press_release/enable`;
    this.platform.log.debug('Enabling the PIR callback -> ');
    await this.platform.fetch({
      url: setActionUrl,
      method: 'POST',
      token: this.device.token,
    });
  }
}

import {
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import simpleColorConverter from 'simple-color-converter';
import qs from 'qs';
import semver from 'semver';
import limit from 'limit-number';

// Internal types
import { RETRY_TIMEOUT } from './settings';
import {
  ButtonId,
  ButtonState,
  DimmerId,
  DimmerIndex,
  DimmerState,
  DingzDeviceHWInfo,
  DingzDeviceConfig,
  DingzDevices,
  DingzDimmerConfigValue,
  DingzLEDState,
  DingzMotionData,
  DingzState,
  WindowCoveringIndex,
  WindowCoveringStates,
  DingzWindowCoveringConfigItem,
  ModuleId,
} from './lib/dingzTypes';
import { ButtonAction, AccessoryActionUrl, Module } from './lib/commonTypes';

import { DeviceNotReachableError } from './lib/errors';
import { DingzDaHomebridgePlatform } from './platform';
import { PlatformEvent } from './lib/platformEventBus';
import { DingzDaBaseAccessory } from './lib/dingzDaBaseAccessory';
import { AccessoryEvent } from './lib/accessoryEventBus';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DingzAccessory extends DingzDaBaseAccessory {
  private mustInit = false;
  private motionService?: Service;
  // Todo: Make proper internal representation
  private dingzStates = {
    // Outputs
    Dimmers: [] as DimmerState[],
    WindowCovers: [] as WindowCoveringStates[],
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
    Temperature: 0 as number,
    Motion: false as boolean,
    Brightness: 0 as number,
  };

  private motionTimer?: NodeJS.Timer;

  private config: DingzDeviceConfig;
  private hw: DingzDeviceHWInfo;
  private configTimestamp = 0;

  /**
   * DingzAccessory constructor
   * @param _platform platform pointer
   * @param _accessory accessory pointer
   */
  constructor(
    private readonly _platform: DingzDaHomebridgePlatform,
    private readonly _accessory: PlatformAccessory,
  ) {
    super(_platform, _accessory);

    // _accessory will contain the current config
    // regardless of wheter it is a new or a restored accessory
    this.config = this.accessory.context.config;
    this.hw = this.device.hwInfo as DingzDeviceHWInfo;

    if (this.config && this.hw) {
      // only run 'reconfigureAccessory()' if we have a config
      this.log.info('Config available, initialization started');
      this.mustInit = false;
      this.reconfigureAccessory(true);
    } else {
      this.log.warn('Config not available, initialization deferred');
      this.mustInit = true;
    }

    // Remove Reachability service if still present
    const bridgingService: Service | undefined = this.accessory.getService(
      this.platform.Service.BridgingState,
    );
    if (bridgingService) {
      this.accessory.removeService(bridgingService);
    }
  }

  private setOutputHandlers(outputService: Service, index: number) {
    outputService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(
        CharacteristicEventTypes.SET,
        this.setOn.bind(this, index as DimmerIndex),
      ) // SET - bind to the `setOn` method below
      .on(
        CharacteristicEventTypes.GET,
        this.getOn.bind(this, index as DimmerIndex),
      );

    this.eb.on(
      AccessoryEvent.PUSH_STATE_UPDATE,
      this.updateDimmerState.bind(this, outputService, index as DimmerIndex),
    );
  }

  /**
   * Set the accessory information
   * - Firmware
   * - Manufacturer
   * - S/N etc.
   */
  protected reconfigureAccessory(init = false): void {
    // Set base info
    // Persist updated info
    // Sanity check for "empty" SerialNumber
    this.log.debug(
      `Attempting to set SerialNumber (which can not be empty) -> front_sn: <${this.hw.front_sn}>`,
    );
    const serialNumber: string =
      !this.hw.front_sn || '' === this.hw.front_sn
        ? this.device.mac
        : this.hw.front_sn; // MAC will always be defined for a correct device
    this.log.debug(
      `Setting SerialNumber (which can not be empty) -> : <${serialNumber}>`,
    );
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'iolo AG')
      .setCharacteristic(
        this.platform.Characteristic.AppMatchingIdentifier,
        'ch.iolo.dingz.consumer',
      )
      // Update info from deviceInfo
      .setCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        this.accessory.displayName,
      )
      .setCharacteristic(
        this.platform.Characteristic.Name,
        this.accessory.displayName,
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.hw.fw_version ?? 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.hw.hw_version_puck ?? 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        serialNumber,
      );

    // Add Dimmers, Blinds etc.
    this.log.info(
      'Adding output devices for ',
      this.device.address,
      ' -> [...]',
    );

    this.setButtonCallbacks();

    // Now we have what we need and can create the services …
    this.configureOutputs(init);
    this.configureBlinds(init);
    this.configureButtons(init);

    // Add auxiliary services (Motion, Temperature)
    if (this.hw.has_pir) {
      // dingz has a Motion sensor -- let's create it
      this.addMotionService();
    } else {
      this.log.info('This dingz has no Motion sensor.');
      this.removeMotionService();
    }
    // dingz has a temperature sensor and an LED,
    // make these available here
    this.addTemperatureService();
    this.addLEDService();
    this.addLightSensorService();
  }

  private setButtonCallbacks() {
    // Only necessary for firmware version < 1.2.x
    if (semver.lt(this.hw.fw_version, '1.2.0')) {
      this.log.debug('Enable PIR callback for older firmware revisions');
      this.enablePIRCallback();
    }

    this.getButtonCallbackUrl()
      .then((callBackUrl) => {
        // Set the callback URL
        const endpoints = ['generic'];
        const platformCallbackUrl = this.platform.getCallbackUrl();

        // Add PIR callbacks, depending on dingz Firmware version
        if (this.hw.has_pir) {
          if (semver.lt(this.hw.fw_version, '1.2.0')) {
            endpoints.push('pir/single');
          } else if (semver.lt(this.hw.fw_version, '1.4.0')) {
            endpoints.push('pir/generic', 'pir/rise', 'pir/fall');
          } else {
            // FIXES #511: Newer FW have (yet!) other endpoint for PIR callbacks
            endpoints.push('pir1/rise', 'pir1/fall');
          }
        }

        if (this.platform.config.callbackOverride) {
          this.log.warn('Override callback URL ->', callBackUrl);

          this.platform.setButtonCallbackUrl({
            baseUrl: this.baseUrl,
            token: this.device.token,
            endpoints: endpoints,
          });
        } else if (
          // FIXME: because of #511
          (semver.lt(this.hw.fw_version, '1.4.0') &&
            !callBackUrl?.url?.includes(platformCallbackUrl)) ||
          (semver.gte(this.hw.fw_version, '1.4.0') &&
            !callBackUrl?.generic?.includes(platformCallbackUrl))
        ) {
          this.log.warn('Update existing callback URL ->', callBackUrl);

          this.platform.setButtonCallbackUrl({
            baseUrl: this.baseUrl,
            token: this.device.token,
            oldUrl: callBackUrl.url,
            endpoints: endpoints,
          });
        } else {
          this.log.debug('Callback URL already set ->', callBackUrl);
        }
      })
      .catch(this.handleRequestErrors.bind(this));
  }

  // Get updated device info and update the corresponding values
  protected getDeviceStateUpdate(): Promise<void> {
    return this.getDeviceState()
      .then((state) => {
        if (typeof state !== 'undefined') {
          // Outputs
          this.dingzStates.Dimmers = state.dimmers;
          this.dingzStates.LED = state.led;
          // Sensors
          this.dingzStates.Temperature = state.sensors.room_temperature;
          this.dingzStates.Brightness = state.sensors.brightness;
          // Lamellas
          this.dingzStates.WindowCovers = state.blinds;

          if (
            this.reachabilityState ||
            this.configTimestamp !== state.config.timestamp
          ) {
            // Push config change
            this.log.debug('Config changes, update accessories');
            DingzAccessory.getConfig({
              address: this.device.address,
              token: this.device.token,
            })
              .then(({ dingzDevices, dingzConfig }) => {
                const newHw = dingzDevices[this.device.mac];

                this.configTimestamp = state.config.timestamp;
                if (this.mustInit) {
                  this.log.warn('Deferred initialization started');
                  this.mustInit = false;
                  this.device.hwInfo = newHw;
                  this.hw = newHw;
                  this.config = dingzConfig;
                  this.accessory.context.device = this.device;
                  this.accessory.context.config = this.config;
                  this.reconfigureAccessory(true);
                } else {
                  this.updateAccessory({
                    deviceHwInfo: newHw,
                    dingzConfig: dingzConfig,
                  });
                }
              })
              .catch(this.handleRequestErrors.bind(this));
          }
          // Push the Update to HomeBridge
          this.eb.emit(AccessoryEvent.PUSH_STATE_UPDATE);
          return Promise.resolve();
        } else {
          return Promise.reject(new DeviceNotReachableError());
        }
      })
      .catch((e: Error) => {
        // invalidate config
        return Promise.reject(e);
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

    this.eb.on(
      AccessoryEvent.PUSH_STATE_UPDATE,
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
    callback(this.reachabilityState, currentTemperature);
  }

  private addLightSensorService() {
    // Add the LightSensor that's integrated in the dingz
    // API: /api/v1/light

    const lightService =
      this.accessory.getService(this.platform.Service.LightSensor) ??
      this.accessory.addService(this.platform.Service.LightSensor);

    lightService.setCharacteristic(this.platform.Characteristic.Name, 'Light');

    this.eb.on(
      AccessoryEvent.PUSH_STATE_UPDATE,
      this.updateLightSensor.bind(this, lightService),
    );
  }

  private updateLightSensor(lightService: Service) {
    const intensity: number = this.dingzStates.Brightness;
    lightService
      .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .updateValue(limit(0.0001, 100000, intensity)); // fixes #300
  }

  private configureBlinds(initHandlers = false): void {
    // This is the block for the multiple services (Dimmers 1-4 / Blinds 1-2 / Buttons 1-4)
    // If "Input" is set, Dimmer 1 won't work. We have to take this into account
    if (!this.config.windowCoveringConfig) {
      return;
    }

    const w: DingzWindowCoveringConfigItem[] | undefined =
      this.config.windowCoveringConfig.blinds;

    /** DIP Switch
     * 0			M1& M2		(2 blinds)
     * 1			1/2L & M2	(1 blind (M2) and 2 lights)
     * 2			3/4L & M1	(1 blind (M1) and 2 lights)
     * 3			1/2/3/4L		(4 lights)
     */

    switch (this.hw.dip_config) {
      case 3:
        // DIP = 0: D0, D1, D2, D3; (Subtypes) (Unless Input, then D1, D2, D3)
        // D1, D2, D3
        this.reconfigureWindowCovering({
          id: 'M1',
          connected: false,
        });
        this.reconfigureWindowCovering({
          id: 'M2',
          connected: false,
        });
        break;
      case 2:
        // DIP = 1: M1, D2, D3;
        if (w && w[0]) {
          this.reconfigureWindowCovering({
            name: w[0].name,
            id: 'M1',
            index: 0,
            connected: true,
            initHandlers: initHandlers,
          });
        }
        this.reconfigureWindowCovering({
          id: 'M2',
          connected: false,
        });

        // Dimmers are always 0 based
        // i.e. if outputs 1 / 2 are for blinds, outputs 3/4 will be dimmer 0/1
        // We use the "index" value of the dingz to determine what to use
        break;
      case 1:
        // DIP = 2: D0, D1, M2; (Unless Input, then D1, M2);
        this.reconfigureWindowCovering({
          id: 'M1',
          connected: false,
        });
        if (w && w[1]) {
          // in this configuration, the second motor has the name we need
          this.reconfigureWindowCovering({
            name: w[1].name,
            id: 'M2',
            index: 1,
            connected: true,
            initHandlers: initHandlers,
          });
        }
        break;
      case 0:
        // DIP = 3: M1, M2;
        if (w && w[0] && w[1]) {
          this.reconfigureWindowCovering({
            name: w[0].name,
            id: 'M1',
            index: 0,
            connected: true,
            initHandlers: initHandlers,
          });
          this.reconfigureWindowCovering({
            name: w[1].name,
            id: 'M2',
            index: 1,
            connected: true,
            initHandlers: initHandlers,
          });
        }
        break;
      default:
        break;
    }
  }

  private configureButtons(initHandler = false) {
    // Create Buttons
    const b = this.config.buttonConfig.buttons;
    this.reconfigureButtonService({
      name: b[0].name && b[0].name !== '' ? b[0].name : 'Button 1',
      button: Module.BTN1,
      initHandler,
    });
    this.reconfigureButtonService({
      name: b[1].name && b[1].name !== '' ? b[1].name : 'Button 2',
      button: Module.BTN2,
      initHandler,
    });
    this.reconfigureButtonService({
      name: b[2].name && b[2].name !== '' ? b[2].name : 'Button 3',
      button: Module.BTN3,
      initHandler,
    });
    this.reconfigureButtonService({
      name: b[3].name && b[3].name !== '' ? b[3].name : 'Button 4',
      button: Module.BTN4,
      initHandler,
    });

    // Add Event Listeners
    this.platform.eb.on(
      PlatformEvent.ACTION,
      (mac, action: ButtonAction, module: ModuleId) => {
        if (mac === this.device.mac && module) {
          this.log.debug(
            `Module ${module} triggered -> ${action}, MAC: ${mac} (This: ${this.device.mac})`,
          );
          switch (module) {
            case Module.INPUT:
              // Fix for v1.2.x firmware (#318)
              // INPUT (Unassigned)
              this.log.info(`Button ${module} Input -> ${action} (no action)`);
              break;
            case Module.PIR:
              // PUSH MOTION
              this.log.info(`Module ${module} Motion -> ${action}`);
              this.log.debug('Motion Update from CALLBACK');
              this.motionService
                ?.getCharacteristic(this.platform.Characteristic.MotionDetected)
                .setValue(
                  action === ButtonAction.PIR_MOTION_START ? true : false,
                );
              break;
            case Module.BTN1:
            case Module.BTN2:
            case Module.BTN3:
            case Module.BTN4:
              {
                this.dingzStates.Buttons[module].event = action ?? 1;
                this.dingzStates.Buttons[module].state =
                  this.dingzStates.Buttons[module].state === ButtonState.OFF
                    ? ButtonState.ON
                    : ButtonState.OFF;
                const service = this.accessory.getServiceById(
                  this.platform.Service.StatelessProgrammableSwitch,
                  module,
                );
                const ProgrammableSwitchEvent =
                  this.platform.Characteristic.ProgrammableSwitchEvent;
                service
                  ?.getCharacteristic(
                    this.platform.Characteristic.ProgrammableSwitchOutputState,
                  )
                  .updateValue(this.dingzStates.Buttons[module].state);
                this.log.info(
                  `Button ${module} (${service?.displayName}) pressed -> ${action}`,
                );

                switch (action) {
                  case ButtonAction.SINGLE_PRESS:
                    service
                      ?.getCharacteristic(ProgrammableSwitchEvent)
                      .setValue(ProgrammableSwitchEvent.SINGLE_PRESS);
                    break;
                  case ButtonAction.DOUBLE_PRESS:
                    service
                      ?.getCharacteristic(ProgrammableSwitchEvent)
                      .setValue(ProgrammableSwitchEvent.DOUBLE_PRESS);
                    break;
                  case ButtonAction.LONG_PRESS:
                    service
                      ?.getCharacteristic(ProgrammableSwitchEvent)
                      .setValue(ProgrammableSwitchEvent.LONG_PRESS);
                    break;
                }

                // Immediately update states after button pressed
                this.getDeviceStateUpdate();
              }
              break;
            default:
              this.log.error(
                `Unknown Module ${module} triggered -> MAC: ${mac} (This: ${this.device.mac})`,
              );
              break;
          }
        }
      },
    );
  }

  private reconfigureButtonService({
    name,
    button,
    initHandler = false,
  }: {
    name: string;
    button: ButtonId;
    initHandler?: boolean | undefined;
  }): Service {
    this.log.info('Adding Button Service ->', name, ' -> ', button);

    const buttonService =
      this.accessory.getServiceById(
        this.platform.Service.StatelessProgrammableSwitch,
        button,
      ) ??
      this.accessory.addService(
        this.platform.Service.StatelessProgrammableSwitch,
        name ?? `Button ${button}`, // Name Dimmers according to WebUI, not API info
        button,
      );

    buttonService.setCharacteristic(
      this.platform.Characteristic.Name,
      name ?? `Button ${button}`,
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
    if (initHandler) {
      buttonService
        .getCharacteristic(
          this.platform.Characteristic.ProgrammableSwitchOutputState,
        )
        .on(
          CharacteristicEventTypes.GET,
          this.getSwitchButtonState.bind(this, button),
        );
      buttonService
        .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .on(
          CharacteristicEventTypes.GET,
          this.getButtonState.bind(this, button),
        );
    }
    return buttonService;
  }

  private getButtonState(
    button: ButtonId,
    callback: CharacteristicGetCallback,
  ) {
    const currentState = this.dingzStates.Buttons[button].event;
    callback(this.reachabilityState, currentState);
  }

  private getSwitchButtonState(
    button: ButtonId,
    callback: CharacteristicGetCallback,
  ) {
    const currentState = this.dingzStates.Buttons[button].state;
    this.log.info('Get Switch State of ->', button, '-> state:', currentState);
    callback(this.reachabilityState, currentState);
  }

  private setSwitchButtonState(
    button: ButtonId,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.Buttons[button].state = value as ButtonState;
    this.log.info('Set Switch State of ->', button, '-> state:', value);
    callback(this.reachabilityState);
  }

  private reconfigureOutput({
    name,
    output,
    id,
    index,
    initHandlers,
  }: {
    name: string;
    output: DingzDimmerConfigValue;
    id: DimmerId;
    index: DimmerIndex;
    initHandlers: boolean;
  }): Service | undefined {
    if (output === 'not_connected') {
      this.removeOutput(id);
      return;
    }

    this.log.info(
      `setDimmerConfig() -> Configuring output '${name}' as '${output}' (${id}/${index})`,
    );
    const existing = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id,
    );
    const service: Service =
      existing ??
      this.accessory.addService(
        this.platform.Service.Lightbulb,
        name, // Name Dimmers according to WebUI, not API info
        id,
      );

    // Update name
    service.getCharacteristic(this.platform.Characteristic.Name).setValue(name);

    // add / configure Brightness
    if (
      output === 'non_dimmable' &&
      service.testCharacteristic(this.platform.Characteristic.Brightness)
    ) {
      service.removeCharacteristic(
        service.getCharacteristic(this.platform.Characteristic.Brightness),
      );
    } else if (output !== 'non_dimmable') {
      try {
        // Add listener in any case, but first destroy existing ones (should fix #256)
        service.removeCharacteristic(
          service.getCharacteristic(this.platform.Characteristic.Brightness),
        );
      } catch (e) {
        this.log.warn('Attempt to remove "Brightness" characteristic failed');
      } finally {
        service.addCharacteristic(this.platform.Characteristic.Brightness);
        service
          .getCharacteristic(this.platform.Characteristic.Brightness)
          .on(
            CharacteristicEventTypes.SET,
            this.setBrightness.bind(this, index),
          ); // SET - bind to the 'setBrightness` method below
      }
    }
    if (initHandlers || !existing) {
      this.setOutputHandlers(service, index);
    }
    return service;
  }

  private updateDimmerState(service: Service, index: DimmerIndex): void {
    if (service && index !== null) {
      // index set
      const state = this.dingzStates.Dimmers[index];
      // Check that "state" is valid
      if (state) {
        if (
          service.testCharacteristic(this.platform.Characteristic.Brightness)
        ) {
          service
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .updateValue(state.output);
        }
        service
          .getCharacteristic(this.platform.Characteristic.On)
          .updateValue(state.on);
      }
    }
  }

  private setOn(
    index: DimmerIndex,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.Dimmers[index].on = value as boolean;
    this.setDeviceDimmer(index, callback, value as boolean);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getOn(index: DimmerIndex, callback: CharacteristicGetCallback) {
    const isOn: boolean = this.dingzStates.Dimmers[index]?.on ?? false;
    callback(this.reachabilityState, isOn);
  }

  private async setBrightness(
    index: DimmerIndex,
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const isOn: boolean = value > 0 ? true : false;
    this.dingzStates.Dimmers[index].output = value as number;
    this.dingzStates.Dimmers[index].on = isOn;

    this.setDeviceDimmer(index, callback, isOn, value as number);
  }

  /**
   * Configure a WindowCovering
   */
  private reconfigureWindowCovering({
    name,
    id,
    index,
    connected,
    initHandlers = false,
  }: {
    name?: string;
    id: string;
    index?: WindowCoveringIndex;
    connected: boolean;
    initHandlers?: boolean;
  }): void {
    const existing = this.accessory.getServiceById(
      this.platform.Service.WindowCovering,
      id,
    );

    if (connected && name && index !== undefined) {
      this.log.info(
        `configureWindowCoveringService() -> add Blind ${name} (${id}/${index})`,
      );
      const service: Service =
        existing ??
        this.accessory.addService(
          this.platform.Service.WindowCovering,
          name,
          id,
        );
      // each service must implement at-minimum the "required characteristics" for the given service type
      // see https://developers.homebridge.io/#/service/Lightbulb
      service
        .getCharacteristic(this.platform.Characteristic.Name)
        .setValue(name);
      if (initHandlers || !existing) {
        this.initWindowCoveringService(service, index);
      }
    } else if (!connected && existing) {
      this.log.info(
        `configureWindowCoveringService() -> remove Blind (${id}/${index})`,
      );
      this.accessory.removeService(existing);
    }
  }

  // Add WindowCovering (Blinds)
  private initWindowCoveringService(
    service: Service,
    index: WindowCoveringIndex,
  ): void {
    // register handlers for the WindoCovering TargetPosition
    service
      .getCharacteristic(this.platform.Characteristic.TargetPosition)
      .on(CharacteristicEventTypes.SET, this.setPosition.bind(this, index));

    // Set min/max Values
    // FIXME: Implement different lamella/blind modes #24
    service
      .getCharacteristic(this.platform.Characteristic.TargetHorizontalTiltAngle)
      .setProps({
        minValue: 0,
        maxValue: 90,
        minStep: this.platform.config.minStepTiltAngle,
      }) // dingz Maximum values
      .on(CharacteristicEventTypes.SET, this.setTiltAngle.bind(this, index));

    service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on(CharacteristicEventTypes.GET, this.getPosition.bind(this, index));
    service
      .getCharacteristic(
        this.platform.Characteristic.CurrentHorizontalTiltAngle,
      )
      .on(CharacteristicEventTypes.GET, this.getTiltAngle.bind(this, index));
    service
      .getCharacteristic(this.platform.Characteristic.PositionState)
      .on(
        CharacteristicEventTypes.GET,
        this.getPositionState.bind(this, index),
      );

    // Subscribe to the update event
    this.eb.on(
      AccessoryEvent.PUSH_STATE_UPDATE,
      this.updateWindowCoveringState.bind(this, index, service),
    );
  }

  // Window Covering functions
  private updateWindowCoveringState(
    index: WindowCoveringIndex,
    service: Service,
  ) {
    const id = this.getWindowCoveringId(index);
    const state: WindowCoveringStates = this.dingzStates.WindowCovers[id];
    if (state) {
      /**
       * TODO: Fix Hardware Buttons and UI buttons
       * It can be complicated:
       * - We're moving by setting new positions in the UI [x]
       * - We're moving by pressing the "up/down" buttons in the UI or Hardware [x]
       */
      service
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .updateValue(state.position);
      service
        .getCharacteristic(
          this.platform.Characteristic.TargetHorizontalTiltAngle,
        )
        .updateValue((state.lamella / 100) * 90); // Lamella position set in ° in HomeKit

      let positionState: number;
      switch (state.moving) {
        case 'down':
          positionState = this.platform.Characteristic.PositionState.DECREASING;
          break;
        case 'up':
          positionState = this.platform.Characteristic.PositionState.INCREASING;
          break;
        case 'stop':
          positionState = this.platform.Characteristic.PositionState.STOPPED;
          service
            .getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .updateValue(state.position);
          service
            .getCharacteristic(
              this.platform.Characteristic.CurrentHorizontalTiltAngle,
            )
            .updateValue((state.lamella / 100) * 90); // Lamella position set in ° in HomeKit
          break;
      }
      service
        .getCharacteristic(this.platform.Characteristic.PositionState)
        .updateValue(positionState);
    }
  }

  private async setPosition(
    index: WindowCoveringIndex,
    position: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    const id = this.getWindowCoveringId(index);
    const windowCovering = this.dingzStates.WindowCovers[id];
    if (windowCovering) {
      // Make sure we're setting motion when changing the position
      if (position > windowCovering.position) {
        windowCovering.moving = 'up';
      } else if (position < windowCovering.position) {
        windowCovering.moving = 'down';
      } else {
        windowCovering.moving = 'stop';
      }

      this.log.warn('Blinds moving: ', windowCovering.moving, '-->', position);

      await this.setWindowCovering({
        id: id,
        blind: position as number,
        lamella: (windowCovering.lamella / 90) * 100, // FIXES #419, we must convert ° to %
        callback: callback,
      });
    }
  }

  private getPosition(
    index: WindowCoveringIndex,
    callback: CharacteristicGetCallback,
  ) {
    this.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    const id = this.getWindowCoveringId(index);
    const blind: number = this.dingzStates.WindowCovers[id]?.position ?? 0; // fixes #300 - down by default

    this.log.debug(
      'Get Characteristic for WindowCovering',
      index,
      'Current Position ->',
      blind,
    );

    callback(this.reachabilityState, blind);
  }

  private async setTiltAngle(
    index: WindowCoveringIndex,
    angle: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.log.debug(
      'Set Characteristic TargetHorizontalTiltAngle on ',
      index,
      '->',
      `${angle}°`,
    );
    const id = this.getWindowCoveringId(index);
    if (this.dingzStates.WindowCovers[id]) {
      await this.setWindowCovering({
        id: id,
        blind: this.dingzStates.WindowCovers[id].position,
        lamella: ((angle as number) / 90) * 100, // FIXES #419, we must convert ° to %
        callback: callback,
      });
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getTiltAngle(
    index: WindowCoveringIndex,
    callback: CharacteristicGetCallback,
  ) {
    this.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );

    const id = this.getWindowCoveringId(index);
    const tiltAngle: number = this.dingzStates.WindowCovers[id]?.lamella ?? 0; // Implement fix for #300s

    this.log.debug(
      'Get Characteristic for WindowCovering',
      index,
      'Current TiltAngle ->',
      tiltAngle,
    );

    // FIXES #371, #419: internally, it's % (but only in newer firmware, v1.2.0 and lower has ° as well), HomeKit expects °
    const maxTiltValue = semver.lt(this.hw.fw_version, '1.2.0') ? 90 : 100;
    callback(this.reachabilityState, (tiltAngle / maxTiltValue) * 90);
  }

  private getPositionState(
    index: WindowCoveringIndex,
    callback: CharacteristicGetCallback,
  ) {
    this.log.debug(
      'WindowCoverings: ',
      JSON.stringify(this.dingzStates.WindowCovers),
    );
    let positionState = this.platform.Characteristic.PositionState.STOPPED;

    const id = this.getWindowCoveringId(index);
    const moving = this.dingzStates.WindowCovers[id]?.moving;

    if (moving) {
      switch (moving) {
        case 'down':
          positionState = this.platform.Characteristic.PositionState.DECREASING;
          break;
        case 'up':
          positionState = this.platform.Characteristic.PositionState.INCREASING;
          break;
        case 'stop':
          positionState = this.platform.Characteristic.PositionState.STOPPED;
          break;
      }

      this.log.debug(
        'Get Characteristic for WindowCovering',
        index,
        'Current Position State ->',
        positionState,
      );
    }
    callback(this.reachabilityState, positionState);
  }

  /**
   * Motion Service Methods
   */
  private addMotionService() {
    this.log.info('addMotionService() -> adding motion service');
    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);
    this.motionService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Motion',
    );
    // Only check for motion if we have a PIR and set the Interval
    if (this.platform.config.motionPoller ?? true) {
      this.log.info('Motion POLLING enabled');
      const motionInterval: NodeJS.Timer = setInterval(() => {
        this.getDeviceMotion()
          .then((data) => {
            if (data?.success) {
              const isMotion: boolean = data.motion;
              // Only update if motionService exists *and* if there's a change in motion'
              if (this.motionService && this.dingzStates.Motion !== isMotion) {
                this.log.debug('Motion Update from POLLER');
                this.dingzStates.Motion = isMotion;
                this.motionService
                  ?.getCharacteristic(
                    this.platform.Characteristic.MotionDetected,
                  )
                  .updateValue(isMotion);
              }
            } else {
              throw new DeviceNotReachableError(
                `Device can not be reached -> ${this.accessory.displayName}-> ${this.device.address}`,
              );
            }
          })
          .catch((e) => {
            this.log.error(
              'Error -> unable to fetch DeviceMotion data',
              e.name,
              e.toString(),
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
      this.log.info(
        'removeMotionService(): Removing Motion service ->',
        service.displayName,
      );
      this.accessory.removeService(service);
    }
  }

  // Updates the Accessory (e.g. if the config has changed)
  protected updateAccessory({
    deviceHwInfo,
    dingzConfig,
  }: {
    deviceHwInfo: DingzDeviceHWInfo;
    dingzConfig: DingzDeviceConfig;
  }): void {
    if (this.reachabilityState !== null) {
      this.log.warn('Device recovered from unreachable state');
      this.reachabilityState = null;
    }

    this.log.warn(
      `Config changed -> will update accessory (${this.device.address})`,
    );
    let updatedDingzDeviceInfo: DingzDeviceHWInfo | undefined;
    try {
      updatedDingzDeviceInfo = deviceHwInfo ?? this.hw;
      if (this.hw && this.hw.has_pir !== updatedDingzDeviceInfo.has_pir) {
        // Update PIR Service
        this.log.warn('Update accessory -> PIR config changed.');
        if (updatedDingzDeviceInfo.has_pir) {
          // Add PIR service
          this.addMotionService();
        } else {
          // Remove PIR service
          this.removeMotionService();
        }
      }
      // Update output, blind, input services
      this.device.hwInfo = deviceHwInfo;
      this.hw = deviceHwInfo;
      this.config = dingzConfig;
      this.accessory.context.device = this.device;
      this.accessory.context.config = this.config;

      this.configureOutputs();
      this.configureBlinds();
      this.configureButtons();
    } finally {
      if (updatedDingzDeviceInfo) {
        this.accessory.context.device.dingzDeviceInfo = updatedDingzDeviceInfo;
      }
    }
  }

  /**
   * Updates the dimemr services based on their current configuration
   */
  private configureOutputs(initHandlers = false): void {
    // Figure out what we have here
    if (!this.config || (this.config && !this.config.dimmerConfig)) {
      return;
    }

    const d = this.config.dimmerConfig.dimmers;
    const i = this.config.inputConfig.inputs;
    switch (this.hw.dip_config) {
      case 3:
        if (i[0] && !i[0].active && d[0].output !== 'not_connected') {
          this.reconfigureOutput({
            name: d[0].name ?? 'Output 1',
            id: 'D1',
            index: 0,
            output: d[0].output,
            initHandlers: initHandlers,
          });
        } else {
          this.removeOutput('D1');
        }
        this.reconfigureOutput({
          name: d[1].name ?? 'Output 2',
          id: 'D2',
          index: 1,
          output: d[1].output,
          initHandlers: initHandlers,
        });
        this.reconfigureOutput({
          name: d[2].name ?? 'Output 3',
          id: 'D3',
          index: 2,
          output: d[2].output,
          initHandlers: initHandlers,
        });
        this.reconfigureOutput({
          name: d[3].name ?? 'Output 4',
          id: 'D4',
          index: 3,
          output: d[3].output,
          initHandlers: initHandlers,
        });
        break;
      case 2:
        this.removeOutput('D1');
        this.removeOutput('D2');
        this.reconfigureOutput({
          name: d[2].name ?? 'Output 3',
          id: 'D3',
          index: 0,
          output: d[2].output,
          initHandlers: initHandlers,
        });
        this.reconfigureOutput({
          name: d[3].name ?? 'Output 4',
          id: 'D4',
          index: 1,
          output: d[3].output,
          initHandlers: initHandlers,
        });
        break;
      case 1:
        if (i[0] && !i[0].active && d[0].output !== 'not_connected') {
          this.reconfigureOutput({
            name: d[0].name ?? 'Output 1',
            id: 'D1',
            index: 0,
            output: d[0].output,
            initHandlers: initHandlers,
          });
        } else {
          this.removeOutput('D1');
        }
        this.reconfigureOutput({
          name: d[1].name ?? 'Output 2',
          id: 'D2',
          index: 1,
          output: d[1].output,
          initHandlers: initHandlers,
        });
        this.removeOutput('D3');
        this.removeOutput('D4');
        break;
      case 0:
        this.removeOutput('D1');
        this.removeOutput('D2');
        this.removeOutput('D3');
        this.removeOutput('D4');
        break;
      default:
        break;
    }
  }

  private removeOutput(id: DimmerId): void {
    const service: Service | undefined = this.accessory.getServiceById(
      this.platform.Service.Lightbulb,
      id,
    );
    if (service) {
      // Remove dimmer since not connected
      this.log.info(`setDimmerConfig() -> Removing output (${id})`);
      this.accessory.removeService(service);
      return;
    }
  }

  private addLEDService() {
    const systemConfig = this.config.systemConfig;
    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    const ledService =
      this.accessory.getServiceById(this.platform.Service.Lightbulb, 'LED') ??
      this.accessory.addService(this.platform.Service.Lightbulb, 'LED', 'LED');

    // set the service name, this is what is displayed as the default name on the Home app
    let ledName = 'LED';
    if (systemConfig?.dingz_name) {
      ledName = `${systemConfig?.dingz_name} LED`;
    }
    ledService.setCharacteristic(this.platform.Characteristic.Name, ledName);
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

    this.eb.on(
      AccessoryEvent.PUSH_STATE_UPDATE,
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
      this.dingzStates.LED.hue = hsv.color.h;
      this.dingzStates.LED.saturation = hsv.color.s;
      this.dingzStates.LED.value = hsv.color.v;
    }

    ledService
      .getCharacteristic(this.platform.Characteristic.Hue)
      .updateValue(this.dingzStates.LED.hue);
    ledService
      .getCharacteristic(this.platform.Characteristic.Saturation)
      .updateValue(this.dingzStates.LED.saturation);
    ledService
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .updateValue(this.dingzStates.LED.value);
    ledService
      .getCharacteristic(this.platform.Characteristic.On)
      .updateValue(this.dingzStates.LED.on);
  }

  private setLEDOn(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.on = value as boolean;
    this.setDeviceLED(callback);
  }

  private getLEDOn(callback: CharacteristicGetCallback) {
    const isOn = this.dingzStates.LED.on;
    callback(this.reachabilityState, isOn);
  }

  private setLEDHue(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.hue = value as number;
    this.setDeviceLED(callback);
  }

  private setLEDSaturation(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.saturation = value as number;
    this.setDeviceLED(callback);
  }

  private setLEDBrightness(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ) {
    this.dingzStates.LED.value = value as number;
    this.setDeviceLED(callback);
  }

  // Get Input & Dimmer Config
  public static async getConfig({
    address,
    token,
  }: {
    address: string;
    token?: string;
    caller?: string;
  }): Promise<{
    dingzDevices: DingzDevices;
    dingzConfig: DingzDeviceConfig;
  }> {
    const deviceInfoEndpoint = '/api/v1/device';
    const deviceConfigEndpoint = '/api/v1/system_config';
    const inputConfigEndpoint = '/api/v1/input_config';
    const dimmerConfigEndpoint = '/api/v1/dimmer_config';
    const blindConfigEndpoint = '/api/v1/blind_config';
    const buttonConfigEndpoint = '/api/v1/button_config';

    const config: AxiosRequestConfig = {
      baseURL: `http://${address}`,
      timeout: RETRY_TIMEOUT * 1500, // devices can be a bit slow, give more time for config
      headers: { Token: token ?? '' },
    };
    const [
      dingzDevicesResponse,
      systemConfigResponse,
      inputConfigResponse,
      dimmerConfigResponse,
      blindConfigResponse,
      buttonConfigResponse,
    ] = await Promise.all<AxiosResponse>([
      DingzAccessory.axios.get(deviceInfoEndpoint, config),
      DingzAccessory.axios.get(deviceConfigEndpoint, config),
      DingzAccessory.axios.get(inputConfigEndpoint, config),
      DingzAccessory.axios.get(dimmerConfigEndpoint, config),
      DingzAccessory.axios.get(blindConfigEndpoint, config),
      DingzAccessory.axios.get(buttonConfigEndpoint, config),
    ]).catch((e: AxiosError) => {
      if (e.code === 'ECONNABORTED') {
        throw new DeviceNotReachableError(
          `${
            e.code ?? ''
          }: Device ${address} not reachable after ${RETRY_TIMEOUT} s\n\n${
            e.stack
          }`,
        );
      } else {
        throw e;
      }
    });
    const deviceConfig: DingzDeviceConfig = {
      systemConfig: systemConfigResponse.data,
      inputConfig: inputConfigResponse.data,
      dimmerConfig: dimmerConfigResponse.data,
      windowCoveringConfig: blindConfigResponse.data,
      buttonConfig: buttonConfigResponse.data,
    };
    return {
      dingzDevices: dingzDevicesResponse.data,
      dingzConfig: deviceConfig,
    };
  }

  private async getDeviceMotion(): Promise<DingzMotionData> {
    const getMotionEndpoint = '/api/v1/motion';
    return await this.request
      .get(getMotionEndpoint)
      .then((response) => {
        return response.data;
      })
      .catch(this.handleRequestErrors.bind(this));
  }

  // Set individual dimmer
  private async setDeviceDimmer(
    index: DimmerIndex,
    callback: CharacteristicSetCallback,
    isOn?: boolean,
    level?: number,
  ) {
    // /api/v1/dimmer/<DIMMER>/on/?value=<value>
    const setDimmerEndpoint = `/api/v1/dimmer/${index}/${isOn ? 'on' : 'off'}/${
      level ? '?value=' + level : ''
    }`;
    await this.request
      .post(setDimmerEndpoint)
      .catch(this.handleRequestErrors.bind(this))
      .finally(() => {
        callback(this.reachabilityState);
      });
  }

  // Set individual dimmer
  private setWindowCovering({
    id,
    blind,
    lamella,
    callback,
  }: {
    id: WindowCoveringIndex;
    blind: number;
    lamella: number;
    callback: CharacteristicSetCallback;
  }) {
    // The API only accepts integer numbers.
    // As we juggle with ° vs %, we must round
    // the values for blind and lamella to the nearest integer
    blind = Math.round(blind);
    lamella = Math.round(lamella);

    this.log.debug(
      `Setting WindowCovering ${id} to position ${blind} and angle ${lamella}°`,
    );
    // The API says the parameters can be omitted. This is not true
    // {{ip}}/api/v1/shade/0?blind=<value>&lamella=<value>
    const setWindowCoveringEndpoint = `${this.baseUrl}/api/v1/shade/${id}`;
    this.request
      .post(
        setWindowCoveringEndpoint,
        qs.stringify(
          {
            blind: blind,
            lamella: lamella,
          },
          { encode: false },
        ),
      )
      .catch(this.handleRequestErrors.bind(this))
      .finally(() => {
        callback(this.reachabilityState);
      });
  }

  /**
   * Set the LED on the dingz
   * @param callback: Characteristic callback
   */
  private setDeviceLED(callback: CharacteristicSetCallback) {
    const state: DingzLEDState = this.dingzStates.LED;
    const color = `${state.hue};${state.saturation};${state.value}`;

    const setLEDEndpoint = `${this.baseUrl}/api/v1/led/set`;
    this.request
      .post(
        setLEDEndpoint,
        qs.stringify(
          {
            action: state.on ? 'on' : 'off',
            color: color,
            mode: 'hsv', // Fixed for the time being
            ramp: 150,
          },
          { encode: false },
        ),
      )
      .catch(this.handleRequestErrors.bind(this))
      .finally(() => {
        callback(this.reachabilityState);
      });
  }

  // Get the current state
  // This function is called regularly and contains all necessary
  // information for an update of all sensors and states
  private async getDeviceState(): Promise<DingzState> {
    const getDeviceStateEndpoint = `${this.baseUrl}/api/v1/state`;
    return await this.request.get(getDeviceStateEndpoint).then((response) => {
      return response.data;
    });
  }

  /**
   * Returns the callback URL for the device
   */
  public async getButtonCallbackUrl(): Promise<AccessoryActionUrl> {
    // FIXES #511: different endpoint URLs for Callback from FW v1.4.x forward
    const getCallbackEndpoint = semver.gte(this.hw.fw_version, '1.4.0')
      ? '/api/v1/action/generic'
      : '/api/v1/action/generic/generic';
    this.log.debug('Getting the callback URL -> ', getCallbackEndpoint);
    return await this.request.get(getCallbackEndpoint).then((response) => {
      return response.data;
    });
  }

  /**
   * Get the right blind state.
   * It's complicated ...
   * @param index *aboslute* index value (i.e. 0/1)
   */
  private getWindowCoveringId(index: WindowCoveringIndex): 0 | 1 {
    if (index === 0) {
      // we have either two blinds *but* index 0
      return 0;
    } else if (this.dingzStates.WindowCovers.length === 1 && index === 1) {
      // we have one blind and it's index 1
      return 0;
    } else {
      return 1;
    }
  }

  /**
   * Enable the PIR callback
   */
  private enablePIRCallback() {
    const setActionEndpoint = '/api/v1/action/pir/press_release/enable';
    this.log.debug('Enabling the PIR callback -> ');
    this.request
      .post(setActionEndpoint)
      .catch(this.handleRequestErrors.bind(this));
  }
}

import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';

import { DingzDaHomebridgePlatform } from './platform';
import {
  MyStromButtonPlusBattery,
  MyStromButtonPlusReport,
} from './lib/myStromTypes';
import { ButtonAction, Module } from './lib/commonTypes';
import { PlatformEvent } from './lib/platformEventBus';
import { ButtonId, ButtonState } from './lib/dingzTypes';
import { MyStromButtonAccessory } from './myStromButtonAccessory';

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
export class MyStromButtonPlusAccessory extends MyStromButtonAccessory {
  // Eventually replaced by:
  // FIXME: Upgrade for multiple buttons
  private buttonActions: ButtonAction[] = [
    ButtonAction.SINGLE_PRESS,
    ButtonAction.SINGLE_PRESS,
    ButtonAction.SINGLE_PRESS,
    ButtonAction.SINGLE_PRESS,
  ];

  private buttonStates: ButtonState[] = [
    ButtonState.OFF,
    ButtonState.OFF,
    ButtonState.OFF,
    ButtonState.OFF,
  ];

  private batteryService: Service | undefined = undefined;
  private temperatureService: Service | undefined = undefined;
  private humidityService: Service | undefined = undefined;

  private buttonPlusState = {
    temperature: 0,
    humidity: 0,
    battery: {
      voltage: 0,
      charging: false,
    },
    charger: {
      voltage: 0,
      connected: false,
    },
  } as MyStromButtonPlusReport;

  constructor(
    protected readonly _platform: DingzDaHomebridgePlatform,
    protected readonly _accessory: PlatformAccessory,
  ) {
    super(_platform, _accessory);

    // Set Base URL
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
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'N/A')
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        'PQWBB1',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    // get the StatelessProgrammableSwitch service if it exists,
    // otherwise create a new StatelessProgrammableSwitch service
    // you can create multiple services for each accessory
    this.log.debug('Create Stateless Programmable Switch');
    this.buttonServiceSetup();

    // Button Plus 2nd Gen has a temperature sensor, make it available here
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

    // Button Plus 2nd Gen has a humidity sensor, make it available here
    // create a new Humidity Sensor service
    this.humidityService =
      this.accessory.getService(this.platform.Service.HumiditySensor) ??
      this.accessory.addService(this.platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Humidity',
    );

    // create handlers for required characteristics
    this.humidityService
      .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on(CharacteristicEventTypes.GET, this.getHumidity.bind(this));

    // Set the callback URL (Override!)
    retrySlow.execute(() => {
      this.platform.setButtonCallbackUrl({
        baseUrl: this.baseUrl,
        token: this.device.token,
        endpoints: ['generic/generic'], // Buttons need the 'generic' endpoint specifically set
      });
    });
  }

  private getTemperature(callback: CharacteristicGetCallback) {
    const temperature: number = this.buttonPlusState?.temperature;
    this.log.debug('Get Characteristic Temperature ->', temperature, '° C');
    callback(this.reachabilityState, temperature);
  }

  private getHumidity(callback: CharacteristicGetCallback) {
    const humidity: number = this.buttonPlusState?.humidity;
    this.log.debug(
      'Get Characteristic Humidity ->',
      humidity,
      '% (relative humidity)',
    );
    callback(this.reachabilityState, humidity);
  }

  // FIXME: initHandler is probably not needed
  protected buttonServiceSetup(initHandler = false) {
    // Create Buttons
    this.reconfigureButtonService({
      name: 'Button 1',
      button: Module.BTN1,
      initHandler,
    });
    this.reconfigureButtonService({
      name: 'Button 2',
      button: Module.BTN2,
      initHandler,
    });
    this.reconfigureButtonService({
      name: 'Button 3',
      button: Module.BTN3,
      initHandler,
    });
    this.reconfigureButtonService({
      name: 'Button 4',
      button: Module.BTN4,
      initHandler,
    });

    // Add Event Listeners
    this.platform.eb.on(
      PlatformEvent.ACTION,
      (
        mac: string,
        action: ButtonAction,
        module: Module,
        battery: number,
        temperature: number,
        humidity: number,
      ) => {
        if (mac === this.device.mac && module) {
          this.log.debug(
            `Module ${module} triggered -> ${action}, MAC: ${mac} (This: ${this.device.mac})`,
          );

          // battery, temperature and humidity are reported in any case
          if (this.batteryService && battery) {
            // TODO: Check if true
            // MyStrom Button+ (2nd Gen) reportedly returns voltages when updating via button actions
            // see https://github.com/myStrom/mystrom-button/blob/master/user/peri.c (IQS)
            // MAX: 4500 mv
            // MIN: 3000 mv
            const range =
              MyStromButtonPlusBattery.BATTERY_MAX -
              MyStromButtonPlusBattery.BATTERY_MIN;
            this.batteryLevel =
              ((battery - MyStromButtonPlusBattery.BATTERY_MIN) * 100) / range;
            this.batteryService
              .getCharacteristic(this.platform.Characteristic.BatteryLevel)
              .updateValue(this.batteryLevel);
            this.log.debug(
              `Setting new battery level to ${this.batteryLevel}%`,
            );
          }

          if (this.temperatureService && temperature) {
            this.buttonPlusState.temperature = temperature;
            this.temperatureService
              .getCharacteristic(
                this.platform.Characteristic.CurrentTemperature,
              )
              .updateValue(temperature);
            this.log.debug(
              `Setting new battery temperature to ${temperature}%`,
            );
          }

          if (this.humidityService && humidity) {
            this.buttonPlusState.humidity = humidity;
            this.humidityService
              .getCharacteristic(
                this.platform.Characteristic.CurrentRelativeHumidity,
              )
              .updateValue(humidity);
            this.log.debug(`Setting new humidty level to ${humidity}%`);
          }

          switch (module) {
            case Module.BTN1:
            case Module.BTN2:
            case Module.BTN3:
            case Module.BTN4:
              {
                this.buttonActions[module] = action ?? 1;
                this.buttonStates[module] =
                  this.buttonStates[module] === ButtonState.OFF
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
                  .updateValue(this.buttonStates[module]);
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
                // this.getDeviceStateUpdate();
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
    // the "ProgrammableSwitchOutputState" Characteristic added to a
    // StatelessProgrammableSwitch (i.e., a button), can be read out -- and used --
    // by third-party apps for HomeKite, allowing users to create automations
    // not only based on the button events, but also based on a state that's toggled
    if (initHandler) {
      /* TODO: not needed anymore?
        buttonService
        .getCharacteristic(
          this.platform.Characteristic.ProgrammableSwitchOutputState,
        )
        .on(
          CharacteristicEventTypes.GET,
          this.getSwitchButtonState.bind(this, button),
        ); */
      buttonService
        .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .on(
          CharacteristicEventTypes.GET,
          this.getButtonStateById.bind(this, button),
        );
    }
    return buttonService;
  }

  private getButtonStateById(
    button: ButtonId,
    callback: CharacteristicGetCallback,
  ) {
    const currentState = this.buttonActions[button];
    callback(this.reachabilityState, currentState);
  }

  // Button Plus can be queried (experimental API)
  // Get updated device info and update the corresponding values
  protected getDeviceStateUpdate(): Promise<void> {
    return Promise.resolve();
  }
}

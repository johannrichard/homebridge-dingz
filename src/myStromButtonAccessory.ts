import { CharacteristicEventTypes, Nullable } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceHWInfo } from './lib/myStromTypes';
import { ButtonAction } from './lib/commonTypes';
import { PlatformEvent } from './lib/platformEventBus';
import { ButtonState } from './lib/dingzTypes';
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
export class MyStromButtonAccessory extends DingzDaBaseAccessory {
  // Eventually replaced by:
  private buttonState: ButtonAction = ButtonAction.SINGLE_PRESS;
  private switchButtonState: ButtonState = ButtonState.OFF;
  protected batteryLevel: Nullable<number> = 0;
  protected chargingState = false;

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

    const batteryService: Service =
      this.accessory.getService(this.platform.Service.Battery) ??
      this.accessory.addService(this.platform.Service.Battery);

    batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on(CharacteristicEventTypes.GET, this.getBatteryLevel.bind(this));

    batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on(CharacteristicEventTypes.GET, this.getStatusBatteryLow.bind(this));

    batteryService
      .getCharacteristic(this.platform.Characteristic.ChargingState)
      .on(CharacteristicEventTypes.GET, this.getChargingState.bind(this));

    // get the StatelessProgrammableSwitch service if it exists,
    // otherwise create a new StatelessProgrammableSwitch service
    // you can create multiple services for each accessory
    this.log.info('Create Stateless Programmable Switch');
    this.buttonServiceSetup();

    // Set the callback URL (Override!)
    retrySlow.execute(() => {
      this.platform.setButtonCallbackUrl({
        baseUrl: this.baseUrl,
        token: this.device.token,
        endpoints: ['generic'], // Buttons need the 'generic' endpoint specifically set
      });
    });
  }

  // Set-up the button (override in subclasses)
  protected buttonServiceSetup() {
    const buttonService: Service =
      this.accessory.getService(
        this.platform.Service.StatelessProgrammableSwitch,
      ) ??
      this.accessory.addService(
        this.platform.Service.StatelessProgrammableSwitch,
      );

    buttonService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name ?? `${this.accessory.context.device.model}`,
    );

    buttonService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .on(CharacteristicEventTypes.GET, this.getButtonState.bind(this));

    // Stateful Programmable Switches are not anymore exposed in HomeKit. However,
    //  the "ProgrammableSwitchOutputState" Characteristic added to a
    // StatelessProgrammableSwitch (i.e., a button), can be read out -- and used --
    // by third-party apps for HomeKite, allowing users to create automations
    // not only based on the button events, but also based on a state that's toggled
    buttonService
      .getCharacteristic(
        this.platform.Characteristic.ProgrammableSwitchOutputState,
      )
      .on(CharacteristicEventTypes.GET, this.getButtonState.bind(this));

    this.platform.eb.on(PlatformEvent.ACTION, (mac, action, battery) => {
      if (mac === this.device.mac) {
        this.buttonState = action ?? ButtonAction.SINGLE_PRESS;
        this.batteryLevel = battery;

        const batteryService = this.accessory.getService(
          this.platform.Service.Battery,
        );

        if (batteryService) {
          batteryService
            .getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .updateValue(battery);
        }
        const buttonService = this.accessory.getService(
          this.platform.Service.StatelessProgrammableSwitch,
        );

        const ProgrammableSwitchEvent =
          this.platform.Characteristic.ProgrammableSwitchEvent;
        if (buttonService) {
          this.log.debug(`Button (${this.device.mac}) pressed -> ${action}`);
          switch (action) {
            case ButtonAction.SINGLE_PRESS:
              buttonService
                .getCharacteristic(ProgrammableSwitchEvent)
                .updateValue(ProgrammableSwitchEvent.SINGLE_PRESS);
              break;
            case ButtonAction.DOUBLE_PRESS:
              buttonService
                .getCharacteristic(ProgrammableSwitchEvent)
                .updateValue(ProgrammableSwitchEvent.DOUBLE_PRESS);
              break;
            case ButtonAction.LONG_PRESS:
              buttonService
                .getCharacteristic(ProgrammableSwitchEvent)
                .updateValue(ProgrammableSwitchEvent.LONG_PRESS);
              break;
            default:
              this.log.info(
                'Heartbeat (Unknown action) ->',
                this.device.address,
                '-> Device is alive, though, will try to update info!',
              );
              this.platform
                .getMyStromDeviceInfo({
                  address: this.device.address,
                  token: this.device.token,
                })
                .then((data) => {
                  if (typeof data !== 'undefined') {
                    const info = data as MyStromDeviceHWInfo;
                    this.accessory.context.device.hwInfo = info;
                    if (batteryService) {
                      batteryService
                        .getCharacteristic(
                          this.platform.Characteristic.ChargingState,
                        )
                        .updateValue(info.charge ?? false);
                    }
                  }
                });
              break;
          }
        }
      }
    });
  }

  private getButtonState(callback: CharacteristicGetCallback) {
    const currentState = this.buttonState;
    callback(this.reachabilityState, currentState);
  }

  protected getSwitchButtonState(callback: CharacteristicGetCallback) {
    const currentState = this.switchButtonState;
    this.log.info('Get Switch State ->', currentState);
    callback(this.reachabilityState, currentState);
  }

  protected getBatteryLevel(callback: CharacteristicGetCallback) {
    const currentLevel = this.batteryLevel;
    callback(this.reachabilityState, currentLevel);
  }

  protected getStatusBatteryLow(callback: CharacteristicGetCallback) {
    const currentLevel: number = this.batteryLevel ?? 0;
    callback(
      null,
      currentLevel <= 10
        ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );
  }

  protected getChargingState(callback: CharacteristicGetCallback) {
    const currentState = this.chargingState;
    callback(this.reachabilityState, currentState);
  }

  // Buttons can not be queried -- always resolve Promise
  protected getDeviceStateUpdate(): Promise<void> {
    this.log.debug(
      'getDeviceStateUpdate() not implemented for',
      this.device.accessoryClass,
    );
    return Promise.resolve();
  }
}

import { CharacteristicEventTypes, Nullable } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo } from './lib/myStromTypes';
import { ButtonAction } from './lib/commonTypes';
import { DingzEvent } from './lib/dingzEventBus';
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
  private mystromDeviceInfo: MyStromDeviceInfo;
  private buttonState?: ButtonAction;
  private switchButtonState?: ButtonState;
  private batteryLevel: Nullable<number> = 0;
  private chargingState = false;

  constructor(
    private readonly _platform: DingzDaHomebridgePlatform,
    private readonly _accessory: PlatformAccessory,
  ) {
    super(_platform, _accessory);

    // Set Base URL
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;

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

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.platform.log.info(
      'Create Stateless Programmable Switch -> ',
      this.device.name,
    );
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
    // .on(
    //   CharacteristicEventTypes.SET,
    //   this.setSwitchButtonState.bind(this, button),
    // );

    const batteryService: Service =
      this.accessory.getService(this.platform.Service.BatteryService) ??
      this.accessory.addService(this.platform.Service.BatteryService);

    batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on(CharacteristicEventTypes.GET, this.getBatteryLevel.bind(this));

    batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on(CharacteristicEventTypes.GET, this.getStatusBatteryLow.bind(this));

    batteryService
      .getCharacteristic(this.platform.Characteristic.ChargingState)
      .on(CharacteristicEventTypes.GET, this.getChargingState.bind(this));

    this.platform.eb.on(DingzEvent.ACTION, (mac, action, battery) => {
      if (mac === this.device.mac) {
        this.buttonState = action ?? ButtonAction.SINGLE_PRESS;
        this.batteryLevel = battery;

        const batteryService = this.accessory.getService(
          this.platform.Service.BatteryService,
        );

        if (batteryService) {
          batteryService
            .getCharacteristic(this.platform.Characteristic.BatteryLevel)
            .updateValue(battery);
        }
        const buttonService = this.accessory.getService(
          this.platform.Service.StatelessProgrammableSwitch,
        );

        const ProgrammableSwitchEvent = this.platform.Characteristic
          .ProgrammableSwitchEvent;
        if (buttonService) {
          this.platform.log.debug(
            `Button of ${this.device.name} (${this.device.mac}) pressed -> ${action}`,
          );
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
              this.platform.log.info(
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
                    const info = data as MyStromDeviceInfo;
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

    // Set the callback URL (Override!)
    retrySlow.execute(() => {
      this.platform.setButtonCallbackUrl({
        baseUrl: this.baseUrl,
        token: this.device.token,
        endpoints: ['generic'], // Buttons need the 'generic' endpoint specifically set
      });
    });
  }

  private getButtonState(callback: CharacteristicGetCallback) {
    const currentState = this.buttonState;
    callback(null, currentState);
  }

  private getSwitchButtonState(callback: CharacteristicGetCallback) {
    const currentState = this.switchButtonState;
    this.platform.log.info('Get Switch State ->', currentState);
    callback(null, currentState);
  }

  private getBatteryLevel(callback: CharacteristicGetCallback) {
    const currentLevel = this.batteryLevel;
    callback(null, currentLevel);
  }

  private getStatusBatteryLow(callback: CharacteristicGetCallback) {
    const currentLevel: number = this.batteryLevel ?? 0;
    callback(
      null,
      currentLevel <= 10
        ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
    );
  }

  private getChargingState(callback: CharacteristicGetCallback) {
    const currentState = this.chargingState;
    callback(null, currentState);
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
}

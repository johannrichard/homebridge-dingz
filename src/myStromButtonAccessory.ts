import { CharacteristicEventTypes, Nullable } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo } from './util/myStromTypes';
import { DeviceInfo, ButtonAction } from './util/commonTypes';
import { DingzEvent } from './util/dingzEventBus';

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
export class MyStromButtonAccessory {
  // Eventually replaced by:
  private device: DeviceInfo;
  private mystromDeviceInfo: MyStromDeviceInfo;
  private baseUrl: string;
  private buttonState?: ButtonAction;
  private batteryLevel: Nullable<number> = 0;
  private chargingState = false;

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
        this.platform.Service.StatefulProgrammableSwitch,
      ) ??
      this.accessory.addService(
        this.platform.Service.StatefulProgrammableSwitch,
      );

    buttonService.setCharacteristic(
      this.platform.Characteristic.Name,
      this.device.name ?? `${accessory.context.device.model}`,
    );

    buttonService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .on(CharacteristicEventTypes.GET, this.getButtonState.bind(this));

    const batteryService: Service =
      this.accessory.getService(this.platform.Service.BatteryService) ??
      this.accessory.addService(this.platform.Service.BatteryService);

    batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on(CharacteristicEventTypes.GET, this.getBatteryLevel.bind(this));

    batteryService
      .getCharacteristic(this.platform.Characteristic.ChargingState)
      .on(CharacteristicEventTypes.GET, this.getChargingState.bind(this));

    this.platform.eb.on(DingzEvent.BTN_PRESS, (mac, action, battery) => {
      if (mac === this.device.mac) {
        this.buttonState = action ?? 1;
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
          this.platform.Service.StatefulProgrammableSwitch,
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
                    accessory.context.device.hwInfo = info;
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
        endpoints: [],
      });
    });
  }

  private getButtonState(callback: CharacteristicGetCallback) {
    const currentState = this.buttonState;
    callback(null, currentState);
  }

  private getBatteryLevel(callback: CharacteristicGetCallback) {
    const currentLevel = this.batteryLevel;
    callback(null, currentLevel);
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

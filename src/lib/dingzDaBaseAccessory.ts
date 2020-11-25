import { PlatformAccessory } from 'homebridge';
import { DingzDaHomebridgePlatform } from '../platform';
import { DeviceInfo } from './commonTypes';
import { DingzEvent } from './dingzEventBus';

export class DingzDaBaseAccessory {
  protected device: DeviceInfo;
  protected baseUrl: string;

  constructor(
    protected readonly platform: DingzDaHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    this.device = this.accessory.context.device;
    this.baseUrl = `http://${this.device.address}`;

    // Register listener for updated device info (e.g. on restore with new IP)
    this.platform.eb.on(
      DingzEvent.UPDATE_DEVICE_INFO,
      (deviceInfo: DeviceInfo) => {
        if (deviceInfo.mac === this.device.mac) {
          this.platform.log.debug(
            'Updated device info received -> update accessory address',
          );

          // Update core info (mainly address)
          if (this.device.address !== deviceInfo.address) {
            this.platform.log.info(
              'Accessory IP changed for',
              this.device.name,
              '-> Updating accessory from ->',
              this.device.address,
              'to',
              deviceInfo.address,
            );
            this.device.address = deviceInfo.address;
            this.baseUrl = `http://${this.device.address}`;

            // Set AccessoryInformation and Update its configuration
            this.setAccessoryInformation();
            this.updateAccessory();
          }
        }
      },
    );
  }

  // Override these if specific actions needed on updates on restore
  protected setAccessoryInformation() {
    this.platform.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }

  protected updateAccessory() {
    this.platform.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }
}

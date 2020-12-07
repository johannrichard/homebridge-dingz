import { APIEvent } from 'homebridge';
import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { Policy, ConsecutiveBreaker } from 'cockatiel';
import { createSocket, Socket, RemoteInfo } from 'dgram';
import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import * as bodyParser from 'body-parser';
import i4h from 'intervals-for-humans';
import chalk from 'chalk';
import isValidHost from 'is-valid-host';
import * as os from 'os';
import e = require('express');

// Internal Types
import { ButtonId, DingzDeviceInfo } from './lib/dingzTypes';
import { MyStromDeviceInfo, MyStromSwitchTypes } from './lib/myStromTypes';

import {
  DeviceInfo,
  AccessoryTypes,
  DeviceTypes,
  AccessoryType,
  ButtonAction,
} from './lib/commonTypes';

import {
  InvalidTypeError,
  DeviceNotImplementedError,
  DeviceNotReachableError,
} from './lib/errors';

import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DINGZ_DISCOVERY_PORT,
  DINGZ_CALLBACK_PORT,
  STATE_UPDATE_INTERVAL,
} from './settings';

// TODO: Some refactoring for better event handling, cleanup of the code and separation of concerns
import { PlatformEventBus, PlatformEvent } from './lib/platformEventBus';

// Accessory classes
import { DingzAccessory } from './dingzAccessory';
import { MyStromSwitchAccessory } from './myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from './myStromLightbulbAccessory';
import { MyStromButtonAccessory } from './myStromButtonAccessory';
import { MyStromPIRAccessory } from './myStromPIRAccessory';

// Define a policy that will retry 20 times at most
const retry = Policy.handleAll()
  .retry()
  .attempts(20)
  .exponential({
    maxDelay: i4h('1h') as number,
    initialDelay: i4h('2s') as number,
  });

// Create a circuit breaker that'll stop calling the executed function for 10
// seconds if it fails 5 times in a row. This can give time for e.g. a database
// to recover without getting tons of traffic.
const circuitBreaker = Policy.handleAll().circuitBreaker(
  10 * 1000,
  new ConsecutiveBreaker(5),
);
const retryWithBreaker = Policy.wrap(retry, circuitBreaker);

/**
 * HomebridgePlatform
 * This class is the main constructor for the plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DingzDaHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;
  public readonly eb = new PlatformEventBus();

  // this is used to track restored cached accessories
  public accessories: AccessoryTypes = {};
  private discovered = new Map();
  private readonly app: e.Application = e();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    axiosRetry(axios, { retries: 5, retryDelay: axiosRetry.exponentialDelay });

    this.log.debug(
      chalk.redBright('[Platform]'),
      'Finished initializing platform:',
      this.config.name,
    );

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug('Executed didFinishLaunching callback');
      // Adds decvices from Config
      if (this.config.devices) {
        this.addDevices();
      }
      // Discovers devices from UDP
      if (this.config.autoDiscover) {
        this.setupDeviceDiscovery();
      }

      // set-up the callback server ...
      this.callbackServer();

      this.eb.on(PlatformEvent.REQUEST_STATE_UPDATE, () => {
        this.log.debug('Event -> PlatformEvent.REQUEST_STATE_UPDATE');
      });

      // Set the update interval in seconds
      const updateInterval: number =
        !this.config.pollerInterval ||
        this.config.pollerInterval < STATE_UPDATE_INTERVAL
          ? STATE_UPDATE_INTERVAL
          : this.config.pollerInterval;

      this.log.debug(`Platform poll interval: ${updateInterval}s`);
      setInterval(() => {
        this.eb.emit(PlatformEvent.REQUEST_STATE_UPDATE);
      }, updateInterval * 1000);
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(
      'Restoring accessory from cache:',
      accessory.displayName,
      '->',
      accessory.context.device.accessoryClass,
    );

    // TODO: Remove the device if it has vanished for too long (i.e. restore was not possible for a long time)
    const context = accessory.context;
    let platformAccessory: AccessoryType;
    if (context.device && context.device.accessoryClass) {
      this.log.debug(
        'Restoring accessory of class ->',
        context.device.accessoryClass,
      );

      switch (context.device.accessoryClass) {
        case 'DingzDaAccessory':
        case 'DingzAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new DingzAccessory(this, accessory);
          break;
        case 'MyStromSwitchAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromSwitchAccessory(this, accessory);
          break;
        case 'MyStromLightbulbAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromLightbulbAccessory(this, accessory);
          break;
        case 'MyStromButtonAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromButtonAccessory(this, accessory);
          break;
        case 'MyStromPIRAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromPIRAccessory(this, accessory);
          break;
        default:
          this.log.warn(
            'No Accessory type defined for Accessory',
            accessory.displayName,
            'can not restore',
          );
          return;
      }
      this.accessories[accessory.UUID] = platformAccessory;
    } else {
      this.log.warn(
        'No Accessory device context for Accessory',
        accessory.displayName,
        'can not restore',
      );
    }
  }

  private addDevices() {
    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.config.devices) {
      // Call addDevice, retry until found
      this.log.info('Add Device from config: ', device.type, '->', device.name);
      switch (device.type) {
        case 'dingz':
          retryWithBreaker.execute(() =>
            this.addDingzDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        case 'myStromSwitch':
          retryWithBreaker.execute(() =>
            this.addMyStromSwitchDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        case 'myStromBulb':
        case 'myStromLED': // Share the same code
          retryWithBreaker.execute(() =>
            this.addMyStromLightbulbDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        case 'myStromPIR':
          retryWithBreaker.execute(() =>
            this.addMyStromPIRDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        default:
          this.log.info(
            'Device type',
            device.deviceType,
            'is currently unsupported. Will skip',
          );
          break;
      }
    }
  }

  // Add one device based on address and name
  private async addDingzDevice({
    address,
    name,
    token,
  }: {
    address: string;
    name: string;
    token?: string;
  }): Promise<boolean> {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(
      `addDingzDevice() --> Add configured device -> ${name} (${address})`,
    );

    return await DingzAccessory.getConfigs({
      address: address,
      token: token,
    })
      .then(({ dingzDevices, systemConfig: dingzConfig }) => {
        this.log.debug('Got Device ->', JSON.stringify(dingzDevices));
        if (typeof dingzDevices !== 'undefined') {
          const keys = Object.keys(dingzDevices);
          const mac = keys[0]; // keys[0]
          const info: DingzDeviceInfo = dingzDevices[mac];

          if (info.type !== 'dingz') {
            throw new InvalidTypeError(
              `Device ${name} at ${address} is of the wrong type (${info.type} instead of "dingz")`,
            );
          }

          // Fixme: Fetch more info about the Device (particularly Name)
          const deviceInfo: DeviceInfo = {
            name:
              dingzConfig.dingz_name && dingzConfig.dingz_name !== ''
                ? dingzConfig.dingz_name
                : name,
            address: address,
            mac: mac.toUpperCase(),
            token: token,
            model: info.front_hw_model ?? 'dingz',
            hwInfo: info,
            accessoryClass: 'DingzAccessory',
          };

          const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

          // check that the device has not already been registered by checking the
          // cached devices we stored in the `configureAccessory` method above
          if (!this.accessories[uuid]) {
            this.log.info('Registering new accessory:', deviceInfo.name);
            // create a new accessory
            const accessory = new this.api.platformAccessory(
              deviceInfo.name,
              uuid,
            );

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = deviceInfo;

            // create the accessory handler (which will add services as needed)
            // this is imported from `dingzDaAccessory.ts`
            const dingzDaAccessory = new DingzAccessory(this, accessory);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
              accessory,
            ]);

            // push into accessory cache
            this.accessories[uuid] = dingzDaAccessory;
            return true;
          } else {
            this.log.warn('Accessory already initialized');

            // Update Names et al. from new device info
            // Might be needed e.g. when IP address changes
            this.eb.emit(PlatformEvent.UPDATE_DEVICE_INFO, deviceInfo);
            this.accessories[uuid].identify();
            return true;
          }
        } else {
          return false;
        }
      })
      .catch((e) => {
        if (e instanceof DeviceNotReachableError) {
          this.log.error(
            `addDingzDevice() --> Device not reachable -> ${name} (${address})`,
          );
          return false;
        } else {
          throw e;
        }
      });
  }

  // Add one device based on address and name
  private addMyStromSwitchDevice({
    address,
    name = 'Switch',
    token,
  }: {
    address: string;
    name?: string;
    token?: string;
  }): boolean {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(`Add configured/discovered device -> ${name} (${address})`);
    const success = this.getMyStromDeviceInfo({
      address,
      token,
      endpoint: 'info', // We use the old endpoint
    }).then((data) => {
      if (typeof data !== 'undefined') {
        const info = data as MyStromDeviceInfo;

        if (
          // FIXME: Fix the API Documentation
          // The type info returned varies with Firmware versions.
          // Newer Firmwares seem to have string-based types whereas
          // older ones use the numbers from the API documentation
          info.type !== 'WS2' &&
          info.type !== 106 &&
          info.type !== 'WSEU' &&
          info.type !== 107 &&
          info.type !== undefined // Switch V1 does not have a type
        ) {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Switch")`,
          );
        }

        const deviceInfo: DeviceInfo = {
          name: name,
          address: address,
          mac: info.mac.toUpperCase(),
          token: token,
          model: MyStromSwitchTypes[info.type] ?? 'CH v1',
          hwInfo: info,
          accessoryClass: 'MyStromSwitchAccessory',
        };

        const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

        // check that the device has not already been registered by checking the
        // cached devices we stored in the `configureAccessory` method above
        if (!this.accessories[uuid]) {
          this.log.info('Registering new accessory:', deviceInfo.name);
          // create a new accessory
          const accessory = new this.api.platformAccessory(
            deviceInfo.name,
            uuid,
          );

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = deviceInfo;

          // create the accessory handler (which will add services as needed)
          // this is imported from `dingzDaAccessory.ts`
          const myStromSwitchAccessory = new MyStromSwitchAccessory(
            this,
            accessory,
          );

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);

          // push into accessory cache
          this.accessories[uuid] = myStromSwitchAccessory;
          return true;
        } else {
          this.log.warn('Accessory already initialized');
          this.eb.emit(PlatformEvent.UPDATE_DEVICE_INFO, deviceInfo);
          this.accessories[uuid].identify();
          return true;
        }
      }
    });

    // Nothing found, throw error
    if (!success) {
      throw new DeviceNotReachableError(
        `Device not found -> ${name} (${address})`,
      );
    }
    return true;
  }

  // Add one device based on address and name
  private addMyStromLightbulbDevice({
    address,
    name = 'Lightbulb/LED',
    token,
  }: {
    address: string;
    name?: string;
    token?: string;
  }): boolean {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(`Add configured/discovered device -> ${name} (${address})`);
    const success = this.getMyStromDeviceInfo({
      address,
      token,
    }).then((data) => {
      if (typeof data !== 'undefined') {
        const info = data as MyStromDeviceInfo;

        if (info.type !== 102 && info.type !== 105 && info.type !== 'WRS') {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Lightbulb")`,
          );
        }

        const deviceInfo: DeviceInfo = {
          name: info.name ?? name,
          address: address,
          mac: info.mac.toUpperCase(),
          token: token,
          model: '102',
          hwInfo: info,
          accessoryClass: 'MyStromLightbulbAccessory',
        };

        const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

        // check that the device has not already been registered by checking the
        // cached devices we stored in the `configureAccessory` method above
        if (!this.accessories[uuid]) {
          this.log.info('Registering new accessory:', deviceInfo.name);
          // create a new accessory
          const accessory = new this.api.platformAccessory(
            deviceInfo.name,
            uuid,
          );

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = deviceInfo;

          // create the accessory handler (which will add services as needed)
          // this is imported from `dingzDaAccessory.ts`
          const myStromLightbulbAccessory = new MyStromLightbulbAccessory(
            this,
            accessory,
          );

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);

          // push into accessory cache
          this.accessories[uuid] = myStromLightbulbAccessory;
          return true;
        } else {
          this.log.warn('Accessory already initialized');
          this.eb.emit(PlatformEvent.UPDATE_DEVICE_INFO, deviceInfo);
          this.accessories[uuid].identify();
          return true;
        }
      }
    });

    // Nothing found, throw error
    if (!success) {
      throw new DeviceNotReachableError(
        `Device not found -> ${name} (${address})`,
      );
    }
    return true;
  }

  // Add one device based on address and name
  private addMyStromPIRDevice({
    address,
    name,
    token,
  }: {
    address: string;
    name?: string;
    token?: string;
  }): boolean {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(
      `Add configured/discovered myStrom PIR device -> (${address})`,
    );
    const success = this.getMyStromDeviceInfo({
      address,
      token,
    }).then((data) => {
      if (typeof data !== 'undefined') {
        const info = data as MyStromDeviceInfo;

        // Need this to identify the right type
        if (info.type !== 110) {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Lightbulb")`,
          );
        }

        const pirName: string =
          name ?? 'my PIR ' + info.mac.toUpperCase().substr(6, 6);
        const deviceInfo: DeviceInfo = {
          name: pirName,
          address: address,
          mac: info.mac.toUpperCase(),
          token: token,
          model: '110',
          hwInfo: info as MyStromDeviceInfo,
          accessoryClass: 'MyStromPIRAccessory',
        };

        const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

        // check that the device has not already been registered by checking the
        // cached devices we stored in the `configureAccessory` method above
        if (!this.accessories[uuid]) {
          this.log.info('Registering new accessory:', deviceInfo.name);
          // create a new accessory
          const accessory = new this.api.platformAccessory(
            deviceInfo.name,
            uuid,
          );

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = deviceInfo;

          // create the accessory handler (which will add services as needed)
          // this is imported from `dingzDaAccessory.ts`
          const myStromPIRAccessory = new MyStromPIRAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);

          // push into accessory cache
          this.accessories[uuid] = myStromPIRAccessory;
          return true;
        } else {
          this.log.warn('Accessory already initialized');
          this.eb.emit(PlatformEvent.UPDATE_DEVICE_INFO, deviceInfo);
          this.accessories[uuid].identify();
          return true;
        }
      }
    });

    // Nothing found, throw error
    if (!success) {
      throw new DeviceNotReachableError(
        `Device not found -> ${name} (${address})`,
      );
    }
    return true;
  }

  // Add one device based on address and name
  private addMyStromButtonDevice({
    address,
    name = 'Button',
    token,
    mac,
  }: {
    address: string;
    name?: string;
    token?: string;
    mac: string;
  }): boolean {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(
      `Add configured/discovered myStrom Button device -> ${name} (${address})`,
    );

    const deviceInfo: DeviceInfo = {
      name: name,
      address: address,
      mac: mac?.toUpperCase(),
      token: token,
      model: '104',
      accessoryClass: 'MyStromButtonAccessory',
    };

    const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

    // check that the device has not already been registered by checking the
    // cached devices we stored in the `configureAccessory` method above
    if (!this.accessories[uuid]) {
      this.log.info('Registering new accessory:', name);
      // create a new accessory
      const accessory = new this.api.platformAccessory(name, uuid);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = deviceInfo;

      // create the accessory handler (which will add services as needed)
      // this is imported from `dingzDaAccessory.ts`
      const myStromButtonAccessory = new MyStromButtonAccessory(
        this,
        accessory,
      );

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);

      // push into accessory cache
      this.accessories[uuid] = myStromButtonAccessory;

      // Buttons can be initialized without fetching all Info -- however it would be good to fetch it anyway
      this.getMyStromDeviceInfo({
        address,
        token,
      }).then((data) => {
        if (typeof data !== 'undefined') {
          const info = data as MyStromDeviceInfo;

          if (info.type !== 104) {
            throw new InvalidTypeError(
              `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Button")`,
            );
          }
          accessory.context.device.hwInfo = info;
        }
      });

      return true;
    } else {
      this.log.warn('Accessory already initialized');
      this.eb.emit(PlatformEvent.UPDATE_DEVICE_INFO, deviceInfo);
      this.accessories[uuid].identify();
      return true;
    }

    return false;
    // Won't work ...
    const success = this.getMyStromDeviceInfo({
      address,
      token,
    }).then((data) => {
      if (typeof data !== 'undefined') {
        const info = data as MyStromDeviceInfo;

        if (info.type !== 104) {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Lightbulb")`,
          );
        }

        const deviceInfo: DeviceInfo = {
          name: info.name ?? name,
          address: address,
          mac: info.mac.toUpperCase(),
          token: token,
          model: '102',
          hwInfo: info,
          accessoryClass: 'MyStromLightbulbAccessory',
        };

        const uuid = this.api.hap.uuid.generate(deviceInfo.mac);

        // check that the device has not already been registered by checking the
        // cached devices we stored in the `configureAccessory` method above
        if (!this.accessories[uuid]) {
          this.log.info('Registering new accessory:', deviceInfo.name);
          // create a new accessory
          const accessory = new this.api.platformAccessory(
            deviceInfo.name,
            uuid,
          );

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = deviceInfo;

          // create the accessory handler (which will add services as needed)
          // this is imported from `dingzDaAccessory.ts`
          const myStromLightbulbAccessory = new MyStromLightbulbAccessory(
            this,
            accessory,
          );

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);

          // push into accessory cache
          this.accessories[uuid] = myStromLightbulbAccessory;
          return true;
        } else {
          this.log.warn('Accessory already initialized');
          this.accessories[uuid].identify();
          return true;
        }
      }
    });

    // Nothing found, throw error
    if (!success) {
      throw new DeviceNotReachableError(
        `Device not found -> ${name} (${address})`,
      );
    }
    return true;
  }

  private datagramMessageHandler(msg: Uint8Array, remoteInfo: RemoteInfo) {
    // const mac: string = dataBuffer.toString('hex', 0, 6);

    try {
      if (msg.length !== 8) {
        throw new DeviceNotImplementedError('Detected data can not be parsed.');
      }

      const t: DeviceTypes = msg[6];
      const mac: string = this.byteToHexString(msg.subarray(0, 6));
      const deviceSuffix: string = mac.substr(6, 6);

      if (!this.discovered.has(mac)) {
        switch (t) {
          case DeviceTypes.MYSTROM_BUTTON_PLUS:
            throw new DeviceNotImplementedError(
              `Device discovered at ${remoteInfo.address} of unsupported type ${DeviceTypes[t]}`,
            );
            break;
          case DeviceTypes.MYSTROM_BUTTON:
            retryWithBreaker
              .execute(() => {
                this.addMyStromButtonDevice({
                  address: remoteInfo.address,
                  name: `Button ${deviceSuffix}`,
                  token: this.config.globalToken,
                  mac: mac,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          case DeviceTypes.MYSTROM_LEDSTRIP:
            retryWithBreaker
              .execute(() => {
                this.addMyStromLightbulbDevice({
                  address: remoteInfo.address,
                  name: `LED Strip ${deviceSuffix}`,
                  token: this.config.globalToken,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          case DeviceTypes.MYSTROM_BULB:
            retryWithBreaker
              .execute(() => {
                this.addMyStromLightbulbDevice({
                  address: remoteInfo.address,
                  name: `Lightbulb ${deviceSuffix}`,
                  token: this.config.globalToken,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          case DeviceTypes.MYSTROM_SWITCH_CHV1:
          case DeviceTypes.MYSTROM_SWITCH_CHV2:
          case DeviceTypes.MYSTROM_SWITCH_EU:
            retryWithBreaker
              .execute(() => {
                this.addMyStromSwitchDevice({
                  address: remoteInfo.address,
                  name: `Switch ${deviceSuffix}`,
                  token: this.config.globalToken,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          case DeviceTypes.MYSTROM_PIR:
            retryWithBreaker
              .execute(() => {
                this.addMyStromPIRDevice({
                  address: remoteInfo.address,
                  name: `PIR ${deviceSuffix}`,
                  token: this.config.globalToken,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          case DeviceTypes.DINGZ:
            retryWithBreaker
              .execute(() => {
                this.addDingzDevice({
                  address: remoteInfo.address,
                  name: `DINGZ ${deviceSuffix}`,
                  token: this.config.globalToken,
                });
              })
              .then(() => {
                this.discovered.set(mac, remoteInfo);
              });
            break;
          default:
            this.log.warn(`Unknown device: ${t}`);
            break;
        }
      } else {
        this.log.debug('Stopping discovery of already known device:', mac);
      }
    } catch (e) {
      if (e instanceof DeviceNotImplementedError) {
        // Degrade gracefully if type not found
        this.log.warn(e.message);
      } else if (e instanceof DeviceNotReachableError) {
        this.log.warn(e.message);
      } else {
        throw e;
      }
    }
  }

  // Steup device discovery. This will run for 10 minutes and then stop
  // If you want tore-discover, just restart Homebridge
  private setupDeviceDiscovery() {
    const discoverySocket: Socket = createSocket({
      type: 'udp4',
    });

    discoverySocket.on('message', this.datagramMessageHandler.bind(this));
    this.log.info('Starting discovery');
    discoverySocket.bind(DINGZ_DISCOVERY_PORT);
    setTimeout(() => {
      this.log.info('Stopping discovery');
      discoverySocket.close();
    }, 600000); // Discover for 10 min then stop
    return true;
  }

  private getAccessoryByMac(mac: string): AccessoryType {
    const uuid = this.api.hap.uuid.generate(mac.toUpperCase());
    return this.accessories[uuid];
  }

  // Set the callback URL for the device
  // FIXME: Move this to a platform accessory base class
  public async setButtonCallbackUrl({
    baseUrl,
    token,
    oldUrl,
    endpoints,
  }: {
    baseUrl: string;
    token?: string;
    oldUrl?: string;
    endpoints: string[];
  }): Promise<void> {
    const setActionUrl = `${baseUrl}/api/v1/action/`;
    let callbackUrl: string = this.getCallbackUrl();
    if (oldUrl?.endsWith('||')) {
      callbackUrl = `${oldUrl}${callbackUrl}`;
    } else if (oldUrl) {
      callbackUrl = `${oldUrl}||${callbackUrl}`;
    }
    this.log.debug('Setting the callback URL -> ', callbackUrl);
    endpoints.forEach((endpoint) => {
      this.log.debug(setActionUrl, 'Endpoint -> ', endpoint);
      axios
        .post(`${setActionUrl}${endpoint}`, callbackUrl, {
          headers: { Token: token ?? '' },
        })
        .catch(this.handleError.bind(this));
    });
  }

  // Create a Service to listen for dingz Button events
  private callbackServer() {
    this.app.use(bodyParser.urlencoded());
    this.app.post('/button', this.handleRequest.bind(this));
    this.app.listen(this.config.callbackPort ?? DINGZ_CALLBACK_PORT, () =>
      this.log.warn(
        `Callback server listening for POST requests on ${
          this.config.callbackPort ?? DINGZ_CALLBACK_PORT
        }... use ${this.getCallbackUrl()} as URL for your dingz or MyStrom callbacks`,
      ),
    );
  }

  private handleRequest(request: e.Request, response: e.Response) {
    if (request.url) {
      response.writeHead(204); // 204 No content
      response.end(() => {
        this.log.debug('Incoming request ->', request.body);
        const b = request.body;
        const mac: string = b.mac ?? '';
        const button = b.index;
        const action = b.action;
        const battery = b.battery;

        // Various types of callbacks
        if (button) {
          this.log.info(chalk.blueBright('[ACTION] dingz'), request.ip);
          // attempt-auto add of either a dingz
          if (
            request.connection.remoteAddress &&
            isValidHost(request.connection.remoteAddress)
          ) {
            this.addDingzDevice({
              address: request.connection.remoteAddress,
              name: `DINGZ ${mac.substr(6, 6)}`,
            });
          }
          this.eb.emit(
            PlatformEvent.ACTION,
            mac,
            action as ButtonAction,
            button as ButtonId,
          );
        } else {
          if (action) {
            this.log.info(chalk.blueBright('[ACTION] Simple'), request.ip);
            this.eb.emit(
              PlatformEvent.ACTION,
              mac,
              action as ButtonAction,
              battery as number,
            );
          } else {
            this.log.info(chalk.blueBright('[HEARTBEAT]'), request.ip);
            this.eb.emit(
              PlatformEvent.ACTION,
              mac,
              action as ButtonAction,
              battery,
            );
          }
        }
      });
    }
  }

  public getCallbackUrl(): string {
    const hostname: string = this.config.callbackHostname ?? os.hostname();
    const port: number = this.config.callbackPort ?? DINGZ_CALLBACK_PORT;
    return `post://${hostname}:${port}/button`;
  }

  /**
   * Device Methods -- these are used to retrieve the data from the dingz
   * FIXME: API Endpoint
   * Officially, the API is at /api/v1/info but there's
   * an undocumenten API at /info which also works for V1 switches
   */
  async getMyStromDeviceInfo({
    address,
    token,
    endpoint = 'api/v1/info',
  }: {
    address: string;
    token?: string;
    endpoint?: 'api/v1/info' | 'info';
  }): Promise<MyStromDeviceInfo | void> {
    this.log.debug('Fetching myStrom Device Info:', address);

    const deviceInfoUrl = `http://${address}/${endpoint}`;
    return await axios(deviceInfoUrl, {
      headers: {
        Token: token ?? '',
      },
    })
      .then((response) => {
        return response.data;
      })
      .catch(this.handleError.bind(this));
  }

  private handleError = (e: AxiosError) => {
    if (e.response) {
      this.log.error('HTTP Response Error ->' + e.code);
      this.log.error(e.message);
      this.log.error(e.response.data);
      this.log.error(e.response.status.toString());
      this.log.error(e.response.headers);
    } else {
      this.log.error('HTTP Response Error ->' + e.config.url);
      this.log.error(e.message);
    }
  };

  private byteToHexString(uint8arr: Uint8Array): string {
    if (!uint8arr) {
      return '';
    }

    let hexStr = '';
    for (let i = 0; i < uint8arr.length; i++) {
      let hex = (uint8arr[i] & 0xff).toString(16);
      hex = hex.length === 1 ? '0' + hex : hex;
      hexStr += hex;
    }

    return hexStr.toUpperCase();
  }
}

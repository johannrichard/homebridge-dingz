import { APIEvent } from 'homebridge';
import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import { fetch, Headers, AbortController } from 'popsicle/dist/node';

import { Policy, ConsecutiveBreaker } from 'cockatiel';

// Internal Types
import {
  DingzDevices,
  DingzDeviceInfo,
  DeviceInfo,
  DingzAccessories,
  DeviceTypes,
  MyStromDeviceInfo,
  MYSTROM_SWITCH_TYPES,
} from './util/internalTypes';

import {
  InvalidTypeError,
  DeviceNotImplementedError,
  DeviceNotReachableError,
} from './util/errors';

import { PLATFORM_NAME, PLUGIN_NAME, DINGZ_DISCOVERY_PORT } from './settings';
import { createSocket, Socket, RemoteInfo } from 'dgram';

// TODO: Some refactoring for beter event handling, cleanup of the code and separation of concerns
import { DingzDaAccessory } from './dingzDaAccessory';
import { MyStromSwitchAccessory } from './myStromSwitchAccessory';
import { MyStromLightbulbAccessory } from './myStromLightbulbAccessory';

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
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DingzDaHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public accessories: DingzAccessories = {};

  private readonly discoverySocket: Socket = createSocket('udp4');

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.addDevices(); // Adds decvices from Config
      if (this.config.autoDiscover) {
        // Discovers devices from UDP
        this.setupDeviceDiscovery();
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(
      'Restoring accessory from cache:',
      accessory.displayName,
      '->',
      accessory.context.device.accessoryClass,
    );

    const context = accessory.context;
    let platformAccessory:
      | DingzDaAccessory
      | MyStromSwitchAccessory
      | MyStromLightbulbAccessory;
    if (context.device && context.device.accessoryClass) {
      this.log.debug(
        'Restoring accessory of class ->',
        context.device.accessoryClass,
      );
      switch (context.device.accessoryClass) {
        case 'DingzDaAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new DingzDaAccessory(this, accessory);
          break;
        case 'MyStromSwitchAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromSwitchAccessory(this, accessory);
          break;
        case 'MyStromLightbulbAccessory':
          // add the restored accessory to the accessories cache so we can track if it has already been registered
          platformAccessory = new MyStromLightbulbAccessory(this, accessory);
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

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  private async addDevices() {
    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.config.devices) {
      // Call addDevice, retry until found
      this.log.info('Add Device from config: ', device.type, '->', device.name);
      switch (device.type) {
        case 'Dingz':
          await retryWithBreaker.execute(() =>
            this.addDingzDevice(
              device.address,
              device.name,
              device.token ?? this.config.globalToken,
            ),
          );
          break;
        case 'myStromSwitch':
          await retryWithBreaker.execute(() =>
            this.addMyStromSwitchDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        case 'myStromBulb':
          await retryWithBreaker.execute(() =>
            this.addMyStromLightbulbDevice({
              address: device.address,
              name: device.name,
              token: device.token ?? this.config.globalToken,
            }),
          );
          break;
        case 'myStromLED':
        case 'myStromPIR':
        default:
          this.log.warn(
            'Device type',
            device.deviceType,
            'is currently unsupported. Will skip',
          );
          break;
      }
    }
  }

  // Add one device based on address and name
  private addDingzDevice(
    address: string,
    name = 'Unnamed DingzDa Device',
    token?: string,
  ): boolean {
    // Run a diacovery of changed things every 10 seconds
    this.log.debug(`Add configured device -> ${name} (${address})`);

    const success = this.getDingzDeviceInfo({ address, token }).then((data) => {
      this.log.debug('Got Device ->', JSON.stringify(data as DingzDevices));
      if (typeof data !== 'undefined') {
        const ddi = data as DingzDevices;
        const keys = Object.keys(ddi);
        const mac = keys[0]; // keys[0]
        const info: DingzDeviceInfo = ddi[mac];

        if (info.type !== 'dingz') {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "dingz")`,
          );
        }

        const deviceInfo: DeviceInfo = {
          name: name,
          address: address,
          mac: mac,
          token: token,
          model: info.puck_hw_model,
          hwInfo: info,
          accessoryClass: 'DingzDaAccessory',
        };

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
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
          const dingzDaAccessory = new DingzDaAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
            accessory,
          ]);

          // push into accessory cache
          this.accessories[uuid] = dingzDaAccessory;
          return true;
        } else {
          this.log.warn('Accessory already initialized');
          this.accessories[uuid].identify();
          return true;
        }
      }
    });

    if (!success) {
      // Nothing found, throw error
      throw new DeviceNotReachableError(
        `Device not found -> ${name} (${address})`,
      );
    }
    return true;
  }

  // Add one device based on address and name
  private addMyStromSwitchDevice({
    address,
    name = 'Unidentified myStrom Switch',
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
          name: info.name ?? name,
          address: address,
          mac: info.mac,
          token: token,
          model: MYSTROM_SWITCH_TYPES[info.type] ?? 'CH v1',
          hwInfo: info,
          accessoryClass: 'MyStromSwitchAccessory',
        };

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
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
    name = 'Unidentified myStrom Lightbulb',
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

        if (info.type !== 102) {
          throw new InvalidTypeError(
            `Device ${name} at ${address} is of the wrong type (${info.type} instead of "myStrom Lightbulb")`,
          );
        }

        const deviceInfo: DeviceInfo = {
          name: info.name ?? name,
          address: address,
          mac: info.mac,
          token: token,
          model: '102',
          hwInfo: info,
          accessoryClass: 'MyStromLightbulbAccessory',
        };

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
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
      switch (t) {
        case DeviceTypes.MYSTROM_BULB:
        case DeviceTypes.MYSTROM_BUTTON_PLUS:
        case DeviceTypes.MYSTROM_BUTTON:
        case DeviceTypes.MYSTROM_LEDSTRIP:
          throw new DeviceNotImplementedError(
            `Device discovered at ${remoteInfo.address} of unsupported type ${DeviceTypes[t]}`,
          );
          break;
        case DeviceTypes.MYSTROM_SWITCH_CHV1:
        case DeviceTypes.MYSTROM_SWITCH_CHV2:
        case DeviceTypes.MYSTROM_SWITCH_EU:
          this.log.debug(
            'Discovered MyStrom Switch',
            DeviceTypes[t],
            'at',
            remoteInfo.address,
            '-> Attempting to identify and add.',
          );
          retryWithBreaker.execute(() => {
            this.addMyStromSwitchDevice({
              address: remoteInfo.address,
              name: 'Auto-Discovered MyStromSwitch',
              token: this.config.globalToken,
            });
          });
          break;
        case DeviceTypes.DINGZ:
          this.log.debug(
            'Auto-Discovered Dingz Device at ',
            remoteInfo.address,
            '-> Attempting to identify and add.',
          );
          retryWithBreaker.execute(() => {
            this.addDingzDevice(
              remoteInfo.address,
              'Auto-Discovered Dingz',
              this.config.globalToken,
            );
          });
          break;
        default:
          this.log.debug(`Unknown device: ${t}`);
          break;
      }
    } catch (e) {
      if (e instanceof DeviceNotImplementedError) {
        // Degrade gracefully if type not found
        this.log.debug(e.message);
      } else {
        throw e;
      }
    }
  }

  // Steup device discovery. This will run for 10 minutes and then stop
  // If you want tore-discover, just restart Homebridge
  private setupDeviceDiscovery() {
    this.discoverySocket.on('message', this.datagramMessageHandler.bind(this));
    this.discoverySocket.bind(DINGZ_DISCOVERY_PORT);
    setTimeout(() => {
      this.log.warn('Stopping discovery');
      this.discoverySocket.close();
    }, 600000); // Discover for 10 min then stop
    return true;
  }

  /**
   * Device Methods -- these are used to retrieve the data from the Dingz
   * TODO: Refactor duplicate code into proper API caller
   */
  async getDingzDeviceInfo({
    address,
    token,
  }: {
    address: string;
    token?: string;
  }): Promise<DingzDevices> {
    const deviceInfoUrl = `http://${address}/api/v1/device`;
    return await this.fetch({
      url: deviceInfoUrl,
      returnBody: true,
      token,
    });
  }

  /**
   * Device Methods -- these are used to retrieve the data from the Dingz
   * FIXME: API Endpoint
   * Officially, the API is at /api/v1/info but there's
   * an undocumenten API at /info which also works for V1 switches
   */
  async getMyStromDeviceInfo({
    address,
    token,
  }: {
    address: string;
    token?: string;
  }): Promise<MyStromDeviceInfo> {
    const deviceInfoUrl = `http://${address}/info`;
    return await this.fetch({
      url: deviceInfoUrl,
      returnBody: true,
      token,
    });
  }

  async fetch({
    url,
    method = 'GET',
    returnBody = false,
    token,
    body,
  }: {
    url: string;
    method?: string;
    returnBody?: boolean;
    token?: string;
    body?: string;
  }) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    const headers: Headers = new Headers();
    if (token) {
      headers.set('Token', token);
    }

    this.log.debug('Fetching ', url);
    const data = await fetch(url, {
      method: method,
      headers: headers,
      signal: controller.signal,
      body: body,
    })
      .then((response) => {
        if (returnBody) {
          return response.json();
        } else {
          return response.status;
        }
      })
      .catch((e) => {
        this.log.error('Error:', e);
      });
    return data;
  }
}

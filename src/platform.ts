import {
  APIEvent,
} from 'homebridge';
import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import {
  fetch,
  AbortController,
  Headers,
} from 'popsicle/dist/node';

import { Policy, ConsecutiveBreaker } from 'cockatiel';

// Internal Types
import {
  DingzDevices,
  DingzDeviceInfo,
  DeviceInfo,
  DingzDaAccessories,
  DeviceTypes,
} from './util/internalTypes';

import { InvalidTypeError, DeviceNotImplementedError, DeviceNotReachableError } from './util/errors';

import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  DINGZ_DISCOVERY_PORT,
} from './settings';

import { createSocket, Socket, RemoteInfo } from 'dgram';
/**
  Defined / Implemented Accesories:
  [] DingzDaDimmerAccessory
  [] DingzDaMotionSensorAccessory
  [] DingzDaLEDAccessory
  [] DingzDaBlindsAccessory
  [] DingzDaTemperatureAccessory
  [] (DingzDaylightAccessory) 
  [] DingzDaButtonAccessory
*/

import { DingzDaAccessory } from './dingzDaAccessory';

// Define a policy that will retry 20 times at most
const retry = Policy.handleAll()
  .retry()
  .exponential({ maxDelay: 10 * 1000, maxAttempts: 20 });

// Create a circuit breaker that'll stop calling the executed function for 10
// seconds if it fails 5 times in a row. This can give time for e.g. a database
// to recover without getting tons of traffic.
const circuitBreaker = Policy.handleAll().circuitBreaker(10 * 1000, new ConsecutiveBreaker(5));
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
         public accessories: DingzDaAccessories = {};

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
             this.setupDeviceDiscovery(); // Discovers devices from UDP
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
           );

           // Before restoring the accessory, check whether it still exist –
           // this.api.unregisterPlatformAccessories()
           // create the accessory handler
           // this is imported from `platformAccessory.ts`
           const dingzDaAccessory = new DingzDaAccessory(this, accessory);

           // add the restored accessory to the accessories cache so we can track if it has already been registered
           this.accessories[accessory.UUID] = dingzDaAccessory;
         }

         /**
          * This is an example method showing how to register discovered accessories.
          * Accessories must only be registered once, previously created accessories
          * must not be registered again to prevent "duplicate UUID" errors.
          */
         private async addDevices() {
           /**
            * ID Gneration for the various Accessories in the myStrom / Dingz Universe:
            * DINGZ Dimmer: [MAC]-D[0-3] for Dimmer 1-4
            * DINGZ PIR: [MAC]-PIR
            * DINGZ Temperature: [MAC]-T
            * DINGZ Motion Sensor: [MAC]-M
            * DINGZ Blinds/Shades: [MAC]-BD[0-1] for Blinds 1/2
            * DINGZ Button: [MAC]-BT[0-3] for Button 1/4
            *
            * TODO: Consider to split the Platform into separate files / classes for the various Devices
            *
            */

           /**** 
     * How to discover Accessories:
     * - Check for 
    
      // {{ip}}/api/v1/device/
      MAC: {
        "fw_version": "3.14.36",
        "fw_version_puck": "0.6.1",
        "bl_version_puck": "0.0.0",
        "dip_config": 3,
        "has_pir": false,
      }
     */
           // loop over the discovered devices and register each one if it has not already been registered
           for (const device of this.config.devices) {
             // Call addDevice, retry until found
             // FIXME: Currently retries even if found
             await retryWithBreaker.execute(() =>
               this.addDevice(
                 device.address,
                 device.name,
                 device.token ?? this.config.globalToken,
               ),
             );
           }
         }

         // Add one device based on address and name
         private addDevice(
           address: string,
           name = 'Unnamed DingzDa Device',
           token?: string,
         ): boolean {
           // Run a diacovery of changed things every 10 seconds
           this.log.debug(`Add configured device -> ${name} (${address})`);

           this.getDeviceInfo(address, token).then((data) => {
             this.log.debug(
               'Got Device ->',
               JSON.stringify(data as DingzDevices),
             );
             if (typeof data !== 'undefined') {
               const ddi = data as DingzDevices;
               const keys = Object.keys(ddi);
               const mac = keys[0]; // keys[0]
               const info: DingzDeviceInfo = ddi[mac];

               // TODO: Implement addDevice for different device types. Right now, we only support Dingz(+)
               if (info.type !== 'dingz') {
                 throw new InvalidTypeError(
                   `Device ${name} at ${address} is of the wrong type (${info.type} instead of "dingz")`,
                 );
               }

               const deviceInfo: DeviceInfo = {
                 name: name,
                 address: address,
                 mac: mac,
                 type: 'dingz',
                 token: token,
                 model: info.has_pir ? 'Dingz+' : 'Dingz',
                 dingzDeviceInfo: info,
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
                 this.api.registerPlatformAccessories(
                   PLUGIN_NAME,
                   PLATFORM_NAME,
                   [accessory],
                 );

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

           // Nothing found, throw error
           throw new DeviceNotReachableError(
             `Device not found -> ${name} (${address})`,
           );
         }

         private datagramMessageHandler(msg: Buffer, remoteInfo: RemoteInfo) {
           const dataBuffer: Buffer = Buffer.from(msg);
           const rawType: number = 0xfff & dataBuffer.readInt16BE(6);
           const t: DeviceTypes = rawType as DeviceTypes;
           // const mac: string = dataBuffer.toString('hex', 0, 6);

           try {
             switch (t) {
               case DeviceTypes.MYSTROM_SWITCH_CHV1:
               case DeviceTypes.MYSTROM_BULB:
               case DeviceTypes.MYSTROM_BUTTON_PLUS:
               case DeviceTypes.MYSTROM_BUTTON:
               case DeviceTypes.MYSTROM_LEDSTRIP:
               case DeviceTypes.MYSTROM_SWITCH_CHV2:
               case DeviceTypes.MYSTROM_SWITCH_EU:
                 throw new DeviceNotImplementedError(
                   'Device discovered at ' +
                     remoteInfo.address +
                     ' of unsupported type ' +
                     DeviceTypes[t],
                 );
                 break;
               case DeviceTypes.DINGZ:
                 this.log.debug(
                   'Discovered Dingz Device at ',
                   remoteInfo.address,
                   '-> Attempting to identify and add.',
                 );
                 this.addDevice(
                   remoteInfo.address,
                   'Unnamed Dingz',
                   this.config.globalToken,
                 );
                 break;
               default:
                 this.log.debug(`Unknown device: ${rawType.toString(16)}`);
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

         private setupDeviceDiscovery() {
           this.discoverySocket.on(
             'message',
             this.datagramMessageHandler.bind(this),
           );
           this.discoverySocket.bind(DINGZ_DISCOVERY_PORT);
           return true;
         }

         /**
          * Device Methods -- these are used to retrieve the data from the Dingz
          * TODO: Refactor duplicate code into proper API caller
          */
         async getDeviceInfo(
           address: string,
           token?: string,
         ): Promise<DingzDevices> {
           const deviceInfoUrl: string = 'http://' + address + '/api/v1/device';
           return await this.fetch(deviceInfoUrl, 'GET', token);
         }

         async fetch(url: string, method = 'GET', token?: string) {
           const controller = new AbortController();
           setTimeout(() => controller.abort(), 2000);
           const headers: Headers = new Headers();
           if (token) {
             headers.set('Token', token);
           }

           const data = await fetch(url, {
             method: method,
             headers: headers,
             signal: controller.signal,
           })
             .then((response) => response.json())
             .catch(e => this.log.error('Error:', e));
           return data;
         }
}
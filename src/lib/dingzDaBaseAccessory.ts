import { PlatformAccessory } from 'homebridge';
import { DingzDaHomebridgePlatform } from '../platform';
import { DeviceInfo } from './commonTypes';
import { PlatformEvent } from './platformEventBus';
import { DingzLogger } from './dingzLogHelper';

import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

import { REQUEST_RETRIES, RETRY_TIMEOUT } from '../settings';
import { DeviceNotReachableError, MethodNotImplementedError } from './errors';
import { AccessoryEventBus } from './accessoryEventBus';
import { AxiosDebugHelper } from './axiosDebugHelper';
import chalk from 'chalk';
/**
 * DingzDaBase Accessory is our base class
 * - getDeviceStateUpdate() is the one method every child class should override
 * TODO: #140 [FIX] use interface & class inheritance to make this clearer
 */
export class DingzDaBaseAccessory {
  protected static axiosRetryConfig = {
    retries: REQUEST_RETRIES,
    retryDelay: axiosRetry.exponentialDelay,
    shouldResetTimeout: true,
  };

  protected static axios = axios;

  public readonly eb = new AccessoryEventBus();
  protected readonly device: DeviceInfo;
  protected readonly log: DingzLogger;
  protected readonly request: AxiosInstance;
  protected readonly debugHelper: AxiosDebugHelper;

  protected baseUrl: string;
  protected reachabilityState: null | Error = null;

  constructor(
    protected readonly platform: DingzDaHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    // Set-up axios instances
    this.device = this.accessory.context.device;
    this.baseUrl = `http://${this.device.address}`;

    this.log = new DingzLogger(this.device.name, platform.log);
    this.request = axios.create({
      baseURL: this.baseUrl,
      timeout: RETRY_TIMEOUT,
      headers: { Token: this.device.token ?? '' },
    });

    /**
     * Set-up the protected and static axios instance
     *
     * This leads to up to 18s delay between retries before failing
     * Each request will time-out after 3000 ms
     * maxdelay -> 2^7*100 ms -> 12.8s
     */
    axiosRetry(this.request, DingzDaBaseAccessory.axiosRetryConfig);
    axiosRetry(axios, DingzDaBaseAccessory.axiosRetryConfig);
    this.debugHelper = new AxiosDebugHelper(this.request, this.log);

    // .. and finally set-up the interval that triggers updates or
    // changes the reachability state of the device
    this.platform.eb.on(PlatformEvent.REQUEST_STATE_UPDATE, () => {
      const heartbeat: string =
        this.reachabilityState === null
          ? chalk.green('ALIVE')
          : chalk.yellow('DEAD');
      this.log.info(
        `-> REQUEST_STATE_UPDATE (${this.device.address})`,
        heartbeat,
      );
      this.getDeviceStateUpdate()
        .then(() => {
          // The device update was successful
          if (this.reachabilityState !== null) {
            // Update reachability -- obviously, we're online again
            this.reachabilityState = null;
            this.log.warn(
              `Device --> recovered from unreachable state (${this.device.address})`,
            );
          }
        })
        .catch((e) => {
          this.log.warn(
            `Device --> entered unreachable state (${this.device.address})`,
          );
          this.handleRequestErrors(e);
        });
    });

    // Register listener for updated device info (e.g. on restore with new IP)
    this.platform.eb.on(
      PlatformEvent.UPDATE_DEVICE_INFO,
      (deviceInfo: DeviceInfo) => {
        if (deviceInfo.mac === this.device.mac) {
          this.log.debug(
            'Updated device info received -> update accessory address',
          );

          // Update core info (mainly address, maybe token too)
          if (
            this.device.address !== deviceInfo.address ||
            this.device.token !== deviceInfo.token
          ) {
            this.log.info(
              'Accessory IP changed for',
              this.accessory.displayName,
              '-> Updating accessory from ->',
              this.device.address,
              'to',
              deviceInfo.address,
            );
            this.accessory.displayName = this.device.name;
            this.device.address = deviceInfo.address;
            this.device.token = deviceInfo.token;
            this.baseUrl = `http://${this.device.address}`;

            this.request.defaults = {
              baseURL: this.baseUrl,
              timeout: RETRY_TIMEOUT,
              headers: { Token: this.device.token ?? '' },
            };

            // update AccessoryInformation
            this.setAccessoryInformation();
          }

          // Set accessory to reachable and
          // updateAccessory()
          this.reachabilityState = null;
          this.updateAccessory();
        }
      },
    );
  }

  // Override these if specific actions needed on updates on restore
  protected setAccessoryInformation(): void {
    this.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }

  protected updateAccessory(): void {
    this.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }

  protected getDeviceStateUpdate(): Promise<void> {
    this.log.warn(
      'getDeviceStateUpdate() not implemented for',
      this.device.accessoryClass,
    );
    return Promise.reject(
      new MethodNotImplementedError(this.device.accessoryClass),
    );
  }

  /**
   * Handler for request errors
   * @param e AxiosError: the error returned by this.request()
   */
  protected handleRequestErrors = (e: AxiosError): void => {
    if (e && e.isAxiosError) {
      this.reachabilityState = new Error();
      switch (e.code) {
        case 'ECONNABORTED':
          this.log.error(
            'HTTP ECONNABORTED Connection aborted --> ' + this.device.address,
          );
          break;
        case 'EHOSTDOWN':
          this.log.error('HTTP EHOSTDOWN Host down --> ' + this.device.address);
          break;
        default:
          this.log.error(
            `HTTP ${e.code} ${e.message} ${e.response?.statusText ?? ' '}--> ` +
              this.device.address,
          );
          break;
      }
    } else if (e instanceof DeviceNotReachableError) {
      this.log.error(
        `DeviceNotReachableError --> ${this.accessory.displayName} (${this.device.address})`,
      );
      this.reachabilityState = new Error();
    } else {
      this.log.error(e.message + '\n' + e.stack);
      throw new Error(
        `Device request failed -> escalating error: ${e.message}`,
      );
    }
  };

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.info(
      'Identify! -> Who am I? I am a',
      this.device.accessoryClass ?? 'unkown device type',
      'listeting to the name of',
      this.device.name,
      'a.k.a.',
      this.accessory.displayName,
      '-> MAC:',
      this.device.mac,
    );
  }
}

import { PlatformAccessory } from 'homebridge';
import { DingzDaHomebridgePlatform } from '../platform';
import { DeviceInfo } from './commonTypes';
import { PlatformEvent } from './platformEventBus';
import { DingzLogger } from './dingzLogHelper';

import axios, { AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

import {
  REQUEST_RETRIES,
  RETRY_TIMEOUT,
  STATE_UPDATE_INTERVAL,
} from '../settings';
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
  protected device: DeviceInfo;
  protected static axiosRetryConfig = {
    retries: REQUEST_RETRIES,
    retryDelay: axiosRetry.exponentialDelay,
    shouldResetTimeout: true,
  };

  protected static axios = axios;

  protected readonly log: DingzLogger;
  protected readonly request: AxiosInstance;
  protected readonly debugHelper: AxiosDebugHelper;

  protected baseUrl: string;
  protected reachabilityState: null | Error = null;

  public readonly eb = new AccessoryEventBus();

  constructor(
    protected readonly platform: DingzDaHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    // Set-up axios instances
    this.device = this.accessory.context.device;
    this.baseUrl = `http://${this.device.address}`;

    this.log = platform.log as DingzLogger;
    this.log.dingzPrefix = this.accessory.context.name;

    // Set the update interval in seconds
    const updateInterval: number =
      !this.platform.config.pollerInterval ||
      this.platform.config.pollerInterval < STATE_UPDATE_INTERVAL
        ? STATE_UPDATE_INTERVAL
        : this.platform.config.pollerInterval;

    this.request = axios.create({
      baseURL: this.baseUrl,
      // We set the retry timeout at 0.7 times the update interval
      // This is 3.5s minimumtimeout for the minimum interval of 5s
      timeout: updateInterval * 1000 * 0.7,
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
      this.getDeviceStateUpdate()
        .then(() => {
          // The device update was successful
          if (this.reachabilityState !== null) {
            // Update reachability -- obviously, we're online again
            this.reachabilityState = null;
            this.log.info(
              chalk.green('[ALIVE]'),
              `Device --> recovered from unreachable state (${this.device.address})`,
            );
          }
        })
        .catch((e) => {
          this.log.warn(
            chalk.red('[DEAD]'),
            `Device --> entered unreachable state (${this.device.address})`,
          );
          this.handleRequestErrors(e);
        });
    });

    // Register listener for updated device info (e.g. on restore with new IP)
    this.platform.eb.on(
      PlatformEvent.UPDATE_DEVICE_INFO,
      (deviceInfo: DeviceInfo) => {
        const device = this.accessory.context.device;
        if (deviceInfo.mac === device.mac) {
          this.log.debug(
            'Updated device info received -> update accessory address',
          );

          // Update core info (mainly address, maybe token too)
          if (
            device.address !== deviceInfo.address ||
            device.token !== deviceInfo.token
          ) {
            this.log.info(
              'Accessory IP changed for',
              this.accessory.displayName,
              '-> Updating accessory from ->',
              device.address,
              'to',
              deviceInfo.address,
            );
            this.accessory.displayName = device.name;
            device.address = deviceInfo.address;
            device.token = deviceInfo.token;
            this.baseUrl = `http://${this.device.address}`;

            this.request.defaults = {
              baseURL: this.baseUrl,
              timeout: RETRY_TIMEOUT * 1000,
              headers: { Token: device.token ?? '' },
            };

            // update AccessoryInformation
            this.accessory.context.device = deviceInfo;
            this.reconfigureAccessory();
          }

          // Set accessory to reachable and
          this.reachabilityState = null;
        }
      },
    );
  }

  // Override these if specific actions needed on updates on restore
  protected reconfigureAccessory(init = false): void {
    this.log.debug(
      `reconfigureAccessory(${init}) not implemented for`,
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
      'listening to the name of',
      this.device.name,
      'a.k.a.',
      this.accessory.displayName,
      '-> MAC:',
      this.device.mac,
    );
  }
}

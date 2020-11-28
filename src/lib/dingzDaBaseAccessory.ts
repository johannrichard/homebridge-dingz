import { PlatformAccessory } from 'homebridge';
import { DingzDaHomebridgePlatform } from '../platform';
import { DeviceInfo } from './commonTypes';
import { PlatformEvent } from './platformEventBus';
import { DingzLogger } from './dingzLogHelper';

import axios, { AxiosRequestConfig, AxiosError, AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

import { REQUEST_RETRIES, RETRY_TIMEOUT } from '../settings';
import { DeviceNotReachableError } from './errors';
import { AxiosDebugHelper } from './axiosDebugHelper';
export class DingzDaBaseAccessory {
  protected static axiosRetryConfig = {
    retries: REQUEST_RETRIES,
    retryDelay: axiosRetry.exponentialDelay,
    shouldResetTimeout: true,
  };

  protected static axios = axios;

  protected readonly log: DingzLogger;
  protected readonly request: AxiosInstance;
  protected readonly debugHelper: AxiosDebugHelper;

  protected device: DeviceInfo;
  protected baseUrl: string;
  protected isReachable = true;

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

    // Register listener for updated device info (e.g. on restore with new IP)
    this.platform.eb.on(
      PlatformEvent.UPDATE_DEVICE_INFO,
      (deviceInfo: DeviceInfo) => {
        if (deviceInfo.mac === this.device.mac) {
          this.log.debug(
            'Updated device info received -> update accessory address',
          );

          // Update core info (mainly address)
          if (this.device.address !== deviceInfo.address) {
            this.log.info(
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
    this.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }

  protected updateAccessory() {
    this.log.debug(
      'setAccessoryInformation() not implemented for',
      this.device.accessoryClass,
    );
  }

  /**
   * Handler for request errors
   * @param e AxiosError: the error returned by this.request()
   */
  protected handleRequestErrors = (e: AxiosError) => {
    if (e.isAxiosError) {
      switch (e.code) {
        case 'ECONNABORTED':
          this.log.error(
            'HTTP ECONNABORTED Connection aborted --> ' + this.device.address,
          );
          this.isReachable = false;
          break;
        case 'EHOSTDOWN':
          this.log.error('HTTP EHOSTDOWN Host down --> ' + this.device.address);
          this.isReachable = false;
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
        `handleRequestErrors() --> ${this.device.name} (${this.device.address})`,
      );
      this.isReachable = false;
    } else {
      this.log.error(e.message + '\n' + e.stack);
      throw new Error('Device request failed -> escalating error');
    }
  };

  protected static async _fetch({
    url,
    method = 'get',
    returnBody = false,
    token,
    body,
  }: {
    url: string;
    method?: string;
    returnBody?: boolean;
    token?: string;
    body?: object | string;
  }) {
    // Retry up to 3 times, with exponential Backoff
    // (https://developers.google.com/analytics/devguides/reporting/core/v3/errors#backoff)
    const data = await axios({
      url: url,
      method: method,
      headers: {
        Token: token ?? '',
      },
      data: body,
    } as AxiosRequestConfig).then((response) => {
      if (returnBody) {
        return response.data;
      } else {
        return response.status;
      }
    });
    return data;
  }
}

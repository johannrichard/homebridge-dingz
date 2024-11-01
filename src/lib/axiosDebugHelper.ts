import {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from 'homebridge';
import { DingzLogger } from './dingzLogHelper';

/**
 * Implements AxiosDebug for classes
 */
export class AxiosDebugHelper {
  private readonly isAbsoluteURL = require('axios/lib/helpers/isAbsoluteURL');
  private readonly buildURL = require('axios/lib/helpers/buildURL');
  private readonly combineURLs = require('axios/lib/helpers/combineURLs');
  private requestUrl = '';

  /**
   *
   * @param instance AxiosInstance
   * @param logger Logger
   */
  constructor(
    readonly instance: AxiosInstance,
    readonly logger: Logger | DingzLogger,
  ) {
    this.addLogger(instance);
  }

  private getURL(config: AxiosRequestConfig) {
    let url = config.url;
    if (config.baseURL && !this.isAbsoluteURL(url)) {
      url = this.combineURLs(config.baseURL, url);
    }
    return this.buildURL(url, config.params, config.paramsSerializer);
  }

  public addLogger(
    instance: AxiosInstance,
  ): InternalAxiosRequestConfig | AxiosResponse | void {
    instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      this.request(config);
      return config;
    });
    instance.interceptors.response.use(
      (response: AxiosResponse) => {
        this.response(response);
        return response;
      },
      (error) => {
        this.error(error);
        throw error;
      },
    );
  }

  private request(config: AxiosRequestConfig) {
    this.requestUrl = this.getURL(config);
    Object.defineProperty(config, this.requestUrl, { value: this.requestUrl });
    this.logger.debug(config.method?.toUpperCase() + ' ' + this.requestUrl);
  }

  private response(response: AxiosResponse) {
    this.logger.debug(
      response.status +
        ' ' +
        response.statusText +
        ' (' +
        response.config?.method?.toUpperCase() +
        ' ' +
        this.requestUrl +
        ')',
    );
  }

  private error(error: AxiosError) {
    if (error.config) {
      this.logger.error(
        error.name + ': ' + error.message,
        '(' + error.config?.method?.toUpperCase() + ' ' + this.requestUrl + ')',
      );
    } else {
      this.logger.error(error.name + ': ' + error.message);
    }
  }
}

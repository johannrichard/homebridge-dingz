import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { PLUGIN_NAME } from './settings';
import { DingzDaHomebridgePlatform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export default function(api: API) {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, DingzDaHomebridgePlatform);
}

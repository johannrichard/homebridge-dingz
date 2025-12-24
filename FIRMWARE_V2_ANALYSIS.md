# Analysis and Recommendations for Dingz Firmware v2.x Support

## Executive Summary

After analyzing the [hass-dingz](https://github.com/siku2/hass-dingz) Home Assistant integration, which supports newer dingz firmware v2.x, I've identified key differences in API structure, endpoints, and device capabilities that need to be addressed in homebridge-dingz for firmware v2.x compatibility.

## Key Findings

### 1. API Structure Changes in Firmware v2.x

#### New State Structure
The hass-dingz implementation reveals that firmware v2.x uses a significantly different state structure:

**Current (v1.x):**
```typescript
// Separate endpoints for different data
GET /api/v1/dimmer/{id}/state
GET /api/v1/blind/{id}/state  
GET /api/v1/led/state
```

**New (v2.x):**
```typescript
// Unified state endpoint
GET /api/v1/state
{
  dimmers: StateDimmer[],
  blinds: StateBlind[],
  led: StateLed,
  sensors: StateSensors,
  dyn_light: StateDynLight,
  thermostat: StateThermostat,
  wifi: StateWifi,
  config: StateConfig,
  ddi_channels: StateDdiChannel[]  // NEW: DDI support
}
```

#### New Configuration Endpoints
```typescript
GET /api/v1/output_config    // Replaces individual dimmer configs
GET /api/v1/input_config     // Enhanced input configuration
GET /api/v1/blind_config     // Separate blind configuration
GET /api/v1/button_config    // Button configuration
GET /api/v1/ddi_channels_config  // NEW: DDI channels support
GET /api/v1/services_config  // NEW: Services (MQTT, etc.)
```

### 2. Critical Incompatibilities

#### A. Dimmer Index Structure
**v1.x:**
```typescript
interface DimmerState {
  on: boolean;
  output: number;  // 0-100
  ramp: number;
  disabled: boolean;
}
```

**v2.x:**
```typescript
interface StateDimmer {
  on: bool;
  output: int;     // Still 0-100
  ramp: int;
  readonly: bool;  // NEW: replaces "disabled"
  index: {         // NEW: relative and absolute indexing
    relative: int;
    absolute: int;
  }
}
```

#### B. Blind/Shade Changes
**v1.x:**
- Position in degrees (0-90°) for older firmware
- Transition to percentage (0-100%) in v1.2.0+

**v2.x:**
```typescript
interface StateBlind {
  moving: "up" | "down" | "stop";  // NEW: explicit movement state
  position: int;     // 0 (closed) to 100 (open)
  lamella: int;      // 0 (closed) to 100 (open)
  readonly: bool;
  index: Index;
}
```

#### C. LED State Structure
**v2.x adds:**
- `mode` field explicitly distinguishing HSV vs RGB
- Transition/ramp support in state
- More consistent color handling

### 3. New Features in Firmware v2.x

#### DDI (Dingz Digital Interface) Support
Firmware v2.x adds support for DDI channels:
```typescript
interface StateDdiChannel {
  name: string;
  en: bool;
  on: bool;
  brightness: int;
  ct_enabled: bool;              // Color temperature support
  colour_temperature: int;
  colour_temperature_k: int;
  off_timer_type: string;
  off_timer_id: int;
  off_timer_value: int;
}
```

#### Enhanced Sensor Data
```typescript
interface StateSensors {
  brightness: int;
  light_state: string;
  light_state_lpf: string;      // NEW: Low-pass filtered light state
  room_temperature: float;
  uncompensated_temperature: float;
  temp_offset: float;           // NEW: Temperature offset
  cpu_temperature: float;
  puck_temperature: float;
  fet_temperature: float;       // NEW: FET temperature
  input_state: bool;
  pirs: SensorPir[];
  power_outputs: SensorPowerOutput[];  // NEW: Power monitoring per output
}
```

#### Thermostat Support
```typescript
interface StateThermostat {
  active: bool;
  state: "off" | "heating" | "cooling";
  mode: "off" | "heating" | "cooling";
  enabled: bool;
  target_temp: int;
  min_target_temp: int;
  max_target_temp: int;
  temp: float;
}
```

#### MQTT Integration
Firmware v2.x has built-in MQTT support for real-time state updates:
```typescript
interface ServicesConfigMqtt {
  enable: bool;
  server: string;
  port: int;
  tls: bool;
  user: string;
  password: string;
}
```

### 4. RAM Management
The hass-dingz implementation includes critical RAM management:

```python
async def _assert_enough_ram(self) -> None:
    ram = await self.get_ram()
    free = ram["free"]
    largest_free_block = ram["largest_free_block"]
    
    # Limits reported by iolo
    out_of_ram = free < 30000 or largest_free_block < 1500
    if out_of_ram:
        raise NotEnoughRamError(...)
```

The device can return 5xx errors when out of RAM, requiring retry logic and RAM checks.

### 5. Request Throttling
Firmware v2.x requires request throttling (200ms minimum between requests):

```python
class _ReqThrottleLock:
    def __init__(self, duration: float = 0.2):
        self.throttle_duration = duration
```

## Recommended Changes for homebridge-dingz

### Phase 1: Core API Compatibility (High Priority)

#### 1.1 Add Firmware Version Detection
```typescript
// In dingzAccessory.ts
private async detectFirmwareVersion(): Promise<number> {
  const major = semver.major(this.hw.fw_version);
  this.log.info(`Detected firmware v${this.hw.fw_version} (major: ${major})`);
  return major;
}

private isV2Firmware(): boolean {
  return semver.gte(this.hw.fw_version, '2.0.0');
}
```

#### 1.2 Implement Unified State Endpoint Support
```typescript
// Add to dingzTypes.ts
export interface DingzUnifiedState {
  dimmers?: StateDimmer[];
  blinds?: StateBlind[];
  led?: StateLed;
  sensors?: StateSensors;
  dyn_light?: StateDynLight;
  thermostat?: StateThermostat;
  wifi?: StateWifi;
  config?: StateConfig;
  ddi_channels?: StateDdiChannel[];
}

// In dingzAccessory.ts
private async getDeviceState(): Promise<void> {
  if (this.isV2Firmware()) {
    // Use unified state endpoint for v2
    const state = await this.request<DingzUnifiedState>({
      method: 'get',
      url: `${this.device.address}/api/v1/state`,
    });
    this.updateFromUnifiedState(state);
  } else {
    // Keep existing individual endpoint calls for v1
    await this.getDeviceStateV1();
  }
}
```

#### 1.3 Update Dimmer Handling
```typescript
// Update DimmerState interface
export interface DimmerState {
  on: boolean;
  output: number;
  ramp: number;
  disabled?: boolean;   // v1.x
  readonly?: boolean;   // v2.x - replaces disabled
  index?: {
    relative: number;
    absolute: number;
  };
}

// In dimmer service handler
private handleDimmerState(dimmer: DimmerState, index: number) {
  const isReadonly = this.isV2Firmware() 
    ? dimmer.readonly 
    : dimmer.disabled;
    
  if (isReadonly) {
    this.log.debug(`Dimmer ${index} is readonly/disabled`);
    return;
  }
  // ... rest of logic
}
```

#### 1.4 Update Blind/WindowCovering Handling
```typescript
// Update WindowCoveringStates interface
export interface WindowCoveringStates {
  position: number;       // 0-100 for v2.x, may be 0-90 for v1.x
  lamella: number;        // 0-100 for v2.x
  moving?: 'up' | 'down' | 'stop';  // v2.x explicit state
  readonly?: boolean;     // v2.x
  index?: {
    relative: number;
    absolute: number;
  };
}

// Update position handling
private normalizeBlindPosition(position: number): number {
  if (this.isV2Firmware()) {
    return position;  // Already 0-100
  }
  // v1.x may use 0-90 degrees for older firmware
  const maxValue = semver.lt(this.hw.fw_version, '1.2.0') ? 90 : 100;
  return (position / maxValue) * 100;
}
```

### Phase 2: New Feature Support (Medium Priority)

#### 2.1 Add DDI Channel Support
```typescript
// Add to dingzTypes.ts
export interface DingzDdiChannelState {
  name: string;
  en: boolean;
  on: boolean;
  brightness: number;
  ct_enabled: boolean;
  colour_temperature: number;
  colour_temperature_k: number;
}

// In dingzAccessory.ts
private setupDdiChannels() {
  if (!this.isV2Firmware()) {
    return;  // DDI only in v2+
  }
  
  const ddiChannels = this.config.ddi_channels || [];
  ddiChannels.forEach((channel, index) => {
    if (channel.en) {
      this.createDdiLightService(index, channel);
    }
  });
}
```

#### 2.2 Add Thermostat Support
```typescript
// Add thermostat service for v2.x
private setupThermostat() {
  if (!this.isV2Firmware()) {
    return;
  }
  
  const thermostatConfig = this.config.thermostat;
  if (thermostatConfig?.enabled) {
    const service = this.accessory.getService(this.platform.Service.Thermostat)
      || this.accessory.addService(this.platform.Service.Thermostat);
    
    // Configure thermostat characteristics
    // ...
  }
}
```

#### 2.3 Enhanced Power Monitoring
```typescript
// Add power monitoring per output (v2.x)
export interface SensorPowerOutput {
  value: number;  // Power in watts
}

private setupPowerMonitoring() {
  if (!this.isV2Firmware()) {
    return;
  }
  
  this.dingzStates.Dimmers.forEach((dimmer, index) => {
    // Add power consumption characteristic
    const service = this.getDimmerService(index);
    service
      .getCharacteristic(this.platform.Characteristic.CurrentPowerConsumption)
      ?.onGet(async () => {
        const state = await this.getDeviceState();
        return state.sensors?.power_outputs?.[index]?.value ?? 0;
      });
  });
}
```

### Phase 3: Performance & Reliability (High Priority)

#### 3.1 Add Request Throttling
```typescript
// Add to dingzDaBaseAccessory.ts or create new utility
class RequestThrottle {
  private lastRequestTime = 0;
  private readonly minInterval = 200; // 200ms between requests

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.minInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minInterval - elapsed)
      );
    }
    
    this.lastRequestTime = Date.now();
  }
}

// In dingzAccessory.ts
private requestThrottle = new RequestThrottle();

protected async request<T>(config: AxiosRequestConfig): Promise<T> {
  await this.requestThrottle.throttle();
  return super.request<T>(config);
}
```

#### 3.2 Add RAM Check and Error Handling
```typescript
interface DingzRamInfo {
  free: number;
  largest_free_block: number;
}

private async checkRamAvailability(): Promise<void> {
  try {
    const ram = await this.request<DingzRamInfo>({
      method: 'get',
      url: `${this.device.address}/api/v1/ram`,
    });
    
    const outOfRam = ram.free < 30000 || ram.largest_free_block < 1500;
    if (outOfRam) {
      this.log.warn(
        `Device low on RAM: ${ram.free} bytes free, ` +
        `${ram.largest_free_block} largest block`
      );
      // Reduce polling frequency or skip non-essential requests
    }
  } catch (error) {
    // RAM endpoint not available in older firmware
    this.log.debug('RAM check not available');
  }
}

protected async handleError(error: unknown): void {
  if (axios.isAxiosError(error) && error.response?.status >= 500) {
    // Check if device is out of RAM
    await this.checkRamAvailability();
  }
  return super.handleError(error);
}
```

#### 3.3 Improve Error Recovery
```typescript
// Enhanced retry logic with exponential backoff
private async requestWithRetry<T>(
  config: AxiosRequestConfig,
  maxAttempts = 5,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await this.request<T>(config);
    } catch (error) {
      lastError = error as Error;
      
      if (axios.isAxiosError(error)) {
        const shouldRetry = 
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED' ||
          (error.response?.status ?? 0) >= 500;
          
        if (!shouldRetry || attempt === maxAttempts - 1) {
          throw error;
        }
      }
      
      // Exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

### Phase 4: Configuration Migration (Medium Priority)

#### 4.1 Config Version Detection and Migration
```typescript
interface DingzConfigVersion {
  version: number;  // 1 for v1.x firmware, 2 for v2.x
  timestamp: number;
}

private async migrateConfigIfNeeded(): Promise<void> {
  const currentVersion = this.isV2Firmware() ? 2 : 1;
  const storedVersion = this.config.configVersion?.version ?? 1;
  
  if (storedVersion < currentVersion) {
    this.log.info(`Migrating config from v${storedVersion} to v${currentVersion}`);
    await this.migrateConfig(storedVersion, currentVersion);
  }
}

private async migrateConfig(from: number, to: number): Promise<void> {
  if (from === 1 && to === 2) {
    // Migrate v1 to v2 config structure
    // - Update dimmer config to use readonly instead of disabled
    // - Convert blind positions if needed
    // - Add DDI channel config
    // - Add thermostat config
  }
}
```

### Phase 5: Testing Strategy

#### 5.1 Add Firmware Version Tests
```typescript
// In src/lib/__tests__/dingzAccessory.test.ts
describe('Firmware Version Detection', () => {
  it('should detect v1.x firmware', () => {
    const hw = { fw_version: '1.4.0' } as DingzDeviceHWInfo;
    const accessory = new DingzAccessory(/* ... */);
    expect(accessory.isV2Firmware()).toBe(false);
  });
  
  it('should detect v2.x firmware', () => {
    const hw = { fw_version: '2.0.0' } as DingzDeviceHWInfo;
    const accessory = new DingzAccessory(/* ... */);
    expect(accessory.isV2Firmware()).toBe(true);
  });
});
```

#### 5.2 Mock v2.x API Responses
```typescript
// In src/lib/__fixtures__/dingz-v2-state.json
{
  "dimmers": [
    {
      "on": true,
      "output": 75,
      "ramp": 500,
      "readonly": false,
      "index": { "relative": 0, "absolute": 0 }
    }
  ],
  "blinds": [
    {
      "moving": "stop",
      "position": 50,
      "lamella": 75,
      "readonly": false,
      "index": { "relative": 0, "absolute": 0 }
    }
  ],
  "sensors": {
    "brightness": 100,
    "room_temperature": 22.5,
    "power_outputs": [{ "value": 45 }]
  }
}
```

## Implementation Priority

### Critical (Blocks v2.x support):
1. ✅ Firmware version detection
2. ✅ Unified state endpoint support
3. ✅ Request throttling
4. ✅ Dimmer state structure updates
5. ✅ Blind/shade state structure updates

### High (Core functionality):
6. RAM monitoring and error handling
7. Enhanced retry logic
8. Configuration migration
9. LED state handling updates

### Medium (New features):
10. DDI channel support
11. Thermostat support
12. Enhanced power monitoring
13. MQTT state updates (via callback server)

### Low (Nice to have):
14. Dynamic lighting support
15. Extended temperature sensors
16. Services configuration UI

## Breaking Changes to Document

### For Users:
1. **Minimum Node.js version**: Already updated to >=18.0.0
2. **Homebridge version**: Already updated to >=1.11.1
3. **Config cache clearing**: Users should clear cached accessories when upgrading from v1.x to v2.x firmware
4. **Blind position values**: May change from degrees to percentage

### For Developers:
1. **API structure**: Transition from individual endpoints to unified state
2. **Type definitions**: Updated interfaces with optional fields for backward compatibility
3. **Request handling**: Mandatory throttling between requests

## Testing Plan

1. **Unit Tests**: Add tests for all new type definitions and utility functions
2. **Integration Tests**: Mock both v1.x and v2.x API responses
3. **Manual Testing**: 
   - Test with real v1.x firmware devices (if available)
   - Test with real v2.x firmware devices
   - Test migration path from v1.x to v2.x
4. **Regression Testing**: Ensure v1.x support remains intact

## Documentation Updates Needed

1. Update README.md to remove incompatibility warning for v2.x
2. Add firmware version compatibility table
3. Document new features (DDI, thermostat, power monitoring)
4. Add migration guide for v1.x to v2.x
5. Update API documentation with v2.x endpoints
6. Add troubleshooting section for v2.x specific issues

## Resources

- [Dingz API Documentation](https://api.dingz.ch)
- [Dingz Changelog](http://dingz.ch/en/changelog-en/)
- [hass-dingz Implementation](https://github.com/siku2/hass-dingz)
- [Issue #611 - Firmware v2.x breaks features](https://github.com/johannrichard/homebridge-dingz/issues/611)

## Conclusion

Supporting firmware v2.x requires significant changes to the codebase, but the hass-dingz implementation provides a clear roadmap. The key is to:

1. Implement firmware version detection first
2. Add support for unified state endpoint while maintaining v1.x compatibility
3. Update type definitions to accommodate both versions
4. Add proper request throttling and error handling
5. Incrementally add new features (DDI, thermostat, etc.)

The changes should be backward compatible, allowing the plugin to work with both v1.x and v2.x firmware versions.

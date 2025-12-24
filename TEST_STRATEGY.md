# Test Strategy for Homebridge-dingz Plugin

## Overview

This document outlines a comprehensive testing strategy for the homebridge-dingz plugin. The goal is to ensure reliability, maintainability, and prevent regressions while keeping the test suite manageable and maintainable.

## Test Pyramid Approach

We follow the test pyramid principle:
- **70%** Unit Tests (fast, isolated)
- **20%** Integration Tests (medium speed, component interactions)
- **10%** End-to-End Tests (slow, full system)

## 1. Unit Testing Strategy

### Current Coverage
- ✅ Error classes (`src/lib/errors.ts`) - 100% coverage
- ✅ Logger helper (`src/lib/dingzLogHelper.ts`) - 100% coverage

### Priority Areas for Unit Tests

#### High Priority (Core Business Logic)
1. **Event Bus Systems**
   - `src/lib/accessoryEventBus.ts`
   - `src/lib/platformEventBus.ts`
   - Test event emission, subscription, and unsubscription
   - Mock event listeners

2. **Type Definitions and Utilities**
   - `src/lib/commonTypes.ts`
   - `src/lib/dingzTypes.ts`
   - `src/lib/myStromTypes.ts`
   - Test type guards, validators, and utility functions

3. **Settings and Configuration**
   - `src/settings.ts`
   - Test constant exports and configuration parsing

#### Medium Priority (Helper Functions)
1. **Axios Debug Helper**
   - `src/lib/axiosDebugHelper.ts`
   - Mock axios interceptors
   - Test request/response logging

2. **Base Accessory**
   - `src/lib/dingzDaBaseAccessory.ts`
   - Test common accessory initialization patterns
   - Mock Homebridge API

### Unit Test Guidelines

```typescript
describe('ComponentName', () => {
  // Setup
  beforeEach(() => {
    // Initialize mocks
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toBe(expected);
    });

    it('should handle edge case', () => {
      // Test boundary conditions
    });

    it('should throw error on invalid input', () => {
      // Test error handling
    });
  });
});
```

## 2. Integration Testing Strategy

### Device Communication Tests
Test interactions between platform and device accessories without real hardware.

#### Priority Areas
1. **Platform Discovery**
   - UDP device discovery mechanism
   - Mock UDP socket responses
   - Test device addition/removal

2. **Accessory Creation**
   - Test platform creating accessories based on device info
   - Mock Homebridge platform API
   - Verify correct accessory type selection

3. **API Interactions**
   - Mock axios HTTP calls to dingz/myStrom devices
   - Test request/response handling
   - Test retry logic and error recovery

### Integration Test Example

```typescript
describe('Platform Integration', () => {
  let mockApi: MockedHomebridgeAPI;
  let platform: DingzDaHomebridgePlatform;

  beforeEach(() => {
    mockApi = createMockHomebridgeAPI();
    platform = new DingzDaHomebridgePlatform(
      mockLogger,
      mockConfig,
      mockApi
    );
  });

  it('should discover and register dingz device', async () => {
    // Mock UDP discovery response
    const mockUdpMessage = createMockDiscoveryMessage({
      type: 'dingz',
      mac: '00:11:22:33:44:55'
    });

    // Trigger discovery
    await platform.handleDiscovery(mockUdpMessage);

    // Verify accessory was registered
    expect(mockApi.registerPlatformAccessories).toHaveBeenCalledWith(
      expect.objectContaining({
        UUID: expect.any(String),
        displayName: expect.any(String)
      })
    );
  });
});
```

## 3. Mocking Strategy

### External Dependencies to Mock

1. **Homebridge API**
   - Logger
   - Platform API (registerPlatformAccessories, etc.)
   - Service and Characteristic classes
   - Events (DID_FINISH_LAUNCHING, etc.)

2. **Network Communication**
   - axios HTTP requests → use `jest-mock-axios` or custom mocks
   - UDP sockets → mock dgram
   - Express server → use `supertest` for endpoint testing

3. **Device Responses**
   - Create fixtures for common device API responses
   - Store in `__fixtures__` directories
   - Use for consistent test data

### Mock Example

```typescript
// __mocks__/homebridge.ts
export const createMockLogger = (): Logger => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
});

// __fixtures__/dingz-responses.ts
export const mockDingzDeviceInfo = {
  type: 'dingz',
  mac: '00:11:22:33:44:55',
  fw_version: '1.3.30',
  // ... other fields
};
```

## 4. Test Coverage Goals

### Short-term (3 months)
- ✅ 100% coverage for utility functions
- 🎯 50% coverage for platform core logic
- 🎯 30% coverage for accessory classes

### Long-term (6 months)
- 🎯 80% overall code coverage
- 🎯 100% coverage for critical paths (device discovery, state updates)
- 🎯 Integration tests for all device types

### Coverage Thresholds

```javascript
// jest.config.js
module.exports = {
  // ... other config
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    },
    './src/lib/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

## 5. Test Organization

```
src/
├── lib/
│   ├── __tests__/
│   │   ├── errors.test.ts
│   │   ├── dingzLogHelper.test.ts
│   │   ├── eventBus.test.ts
│   │   └── ...
│   ├── __fixtures__/
│   │   ├── dingz-responses.json
│   │   └── mystrom-responses.json
│   └── __mocks__/
│       └── axios.ts
├── __tests__/
│   ├── platform.test.ts
│   ├── dingzAccessory.test.ts
│   └── ...
└── __mocks__/
    └── homebridge.ts
```

## 6. Continuous Integration

### Pre-commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "yarn lint && yarn test:quick"
    }
  }
}
```

### CI Pipeline
1. **On Pull Request**
   - Run all unit tests
   - Run linter
   - Check code coverage (fail if below threshold)
   - Build project

2. **On Merge to Main**
   - Run full test suite
   - Generate coverage report
   - Upload to coverage service (e.g., Codecov)

## 7. Testing Tools

### Current Stack
- **Jest** - Test runner and assertion library
- **ts-jest** - TypeScript support
- **@types/jest** - TypeScript definitions

### Recommended Additions
- **supertest** - HTTP endpoint testing (for Express callback server)
- **nock** - HTTP mocking (alternative to axios mocks)
- **jest-extended** - Additional matchers
- **@shelf/jest-mongodb** - If database testing needed

## 8. Test Data Management

### Fixtures
Store realistic device responses as JSON fixtures:

```typescript
// __fixtures__/devices/dingz-v1.json
{
  "type": "dingz",
  "battery": false,
  "reachable": true,
  "meshroot": false,
  "fw_version": "1.3.30",
  "hw_version": "DZ.1.0.0",
  "fw_version_puck": "2.10.9",
  "bl_version_puck": "2.3.4",
  "hw_version_puck": "PU.3.0.2",
  "puck_production_date": "2021-06-15",
  "puck_sn": "1234567",
  "dip_config": 0,
  "ssid": "MyNetwork",
  "mac": "00:11:22:33:44:55",
  "front_color": "#FFFFFF"
}
```

### Test Builders
Create builder pattern for test data:

```typescript
class DingzDeviceBuilder {
  private data: Partial<DingzDeviceHWInfo> = {};

  withMac(mac: string) {
    this.data.mac = mac;
    return this;
  }

  withFirmwareVersion(version: string) {
    this.data.fw_version = version;
    return this;
  }

  build(): DingzDeviceHWInfo {
    return {
      ...defaultDingzDevice,
      ...this.data
    };
  }
}

// Usage
const device = new DingzDeviceBuilder()
  .withMac('AA:BB:CC:DD:EE:FF')
  .withFirmwareVersion('2.0.0')
  .build();
```

## 9. Performance Testing

While not priority for initial implementation, consider:

1. **Load Testing**
   - Test platform with multiple devices (10, 50, 100+)
   - Monitor memory usage
   - Test concurrent API requests

2. **Stress Testing**
   - Rapid state changes
   - Device connection/disconnection cycles
   - Network timeout scenarios

## 10. Test Maintenance

### Regular Activities
- **Weekly**: Review test failures, update flaky tests
- **Monthly**: Review coverage reports, identify gaps
- **Quarterly**: Refactor tests for maintainability
- **Per Release**: Update test fixtures with new API responses

### Documentation
- Keep this strategy document updated
- Document mock patterns in TESTING.md
- Add JSDoc comments to test utilities
- Maintain changelog of test infrastructure changes

## 11. Future Enhancements

1. **Visual Regression Testing** (if UI components added)
2. **Contract Testing** (verify API compatibility with real devices)
3. **Mutation Testing** (test quality of tests themselves)
4. **Snapshot Testing** (for configuration objects)
5. **E2E Tests** (with real Homebridge instance in Docker)

## Conclusion

This strategy provides a roadmap for comprehensive testing. Implementation should be incremental:
1. ✅ Phase 1: Core utilities (Complete)
2. 🎯 Phase 2: Platform and discovery logic (Next)
3. 🎯 Phase 3: Accessory classes
4. 🎯 Phase 4: Integration tests
5. 🎯 Phase 5: CI/CD integration

The goal is sustainable test coverage that provides confidence without becoming a maintenance burden.

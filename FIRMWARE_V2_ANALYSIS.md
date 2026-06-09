# Dingz Firmware v2 Capability Review (updated)

## Source reviewed

- https://github.com/siku2/hass-dingz (main branch)
- Key files: `custom_components/dingz/api.py`, `shared.py`, `light.py`, README

## What firmware v2 currently exposes

From `hass-dingz`, the current Dingz v2 API and ecosystem support include:

- Unified state endpoint: `GET /api/v1/state`
- Config endpoints:
  - `GET /api/v1/system_config`
  - `GET /api/v1/output_config`
  - `GET /api/v1/input_config`
  - `GET /api/v1/blind_config`
  - `GET /api/v1/button_config`
  - `GET /api/v1/services_config`
  - `GET /api/v1/ddi_channels_config` (optional, 404 on devices without DDI)
- Runtime features represented in state/config:
  - Light outputs (dimmable + on/off)
  - Blinds/motors with motion state
  - Front LED (HSV/RGB)
  - PIR + button + input events (best when MQTT is enabled)
  - Power and energy related output telemetry
  - Thermostat state/config
  - DDI channels (brightness + color temperature)
  - MQTT service config and MQTT push topics for live updates
- Device stability behavior handled by hass-dingz client:
  - Request throttling (~200ms lock between requests)
  - RAM guard checks on 5xx errors (`/api/v1/ram`)

## Current homebridge-dingz status

This repository already supports several firmware v2-aligned basics:

- Unified polling via `GET /api/v1/state`
- `readonly`/indexed blind state shape
- Core services: dimmers, blinds, buttons, PIR motion, LED, temperature, brightness
- Existing config fetches for system/input/blind/button config

## Functional gaps vs current v2 capabilities

Compared with hass-dingz, the main missing areas in this plugin are:

1. `output_config` usage for richer output typing (fan/socket oriented modeling)
2. `services_config` handling (especially MQTT awareness)
3. DDI channel config/state + HomeKit mapping
4. Thermostat entity/service support
5. Power/energy telemetry exposure in HomeKit-compatible form
6. Request-throttle and out-of-RAM protection strategy
7. MQTT-driven real-time update path (currently polling + callbacks only)

## Recommended implementation order

1. **Reliability first**
   - Add request-throttle lock and RAM-aware retry fallback around state/config requests.
2. **Config model modernization**
   - Extend config loading to include `output_config` and `services_config`.
3. **Feature expansion**
   - Add thermostat and DDI support.
   - Add fan/socket-oriented handling where HomeKit mapping is feasible.
4. **Telemetry improvements**
   - Expose power/energy related telemetry where appropriate.
5. **Realtime updates**
   - Add optional MQTT subscriber path for low-latency state updates.

## Practical conclusion

Firmware v2 support in this plugin is partially in place, but it does not yet match the breadth of capabilities currently used by `hass-dingz`. The largest value-add next steps are reliability hardening (throttle + RAM checks), richer config ingestion (`output_config`/`services_config`), and adding missing feature domains (thermostat, DDI, telemetry, MQTT live updates).

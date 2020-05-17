# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog][Keep a Changelog] and this project adheres to [Semantic Versioning][Semantic Versioning].

## [Unreleased]
---
## [1.2.0] - 2020-05-17
### Added
* Support for DingZ Front LED

### Changed
* Replace popsicle library with axios for better POST handling

### Fixes
* Fixes for myStrom WiFi Lightbulb support
## [Released]
## [1.1.3] - 2020-05-17
### Added
* cb13f9b Exponential decay for accessory config check

### Changed
* 071c7e2 Housekeeping
* 8ebe4e4 Add Changelog

## [1.1.2] - 2020-05-16
### Added
* 48bd118 Add support for a setting to turn off auto-discovery

### Changed
* 75fbabb Update metadata in HomeKit info: use undocumented fields
* 8caf6b4 Update metadata in HomeKit info: use undocumented fields

### Fixed 
Fixes for a number of "long-standing" (3 days :-)) bugs
* b414f80 Fix for Dimmer 1 (Input/Output) config. Fixes #2

## [1.1.1] - 2020-05-15
### Added
* First tentative support for the myStrom WiFi Lightbulb

### Changed
* Only discover new devices during the first 10 minutes (Restart Homebridge if you want to rediscover)

### Fixed
* 71a14a5 – Fix plugin ID 
* Some fixing and refactoring of the discovery code

## [v1.1.0] - 2020-05-15
### Added
* First tentative support for the myStrom WiFi Lightbulb

### Changed
* Only discover new devices during the first 10 minutes (Restart Homebridge if you want to rediscover)

### Fixed
* Some fixing and refactoring of the discovery code

## [v1.0.1] - 2020-05-14
### Fixed
Fixes presumably wrong association of DIP switches.

## [v1.0.0] - 2020-05-14

This plugin implements some (but not all) functions of [Dingz](https://dingz.ch) Smart Home Devices. The plugin also supports (some) myStrom Devices as they share much of the same API definitions and concepts with Dingz.

The plugin attempts to

- auto-discover devices, and to
- auto-identify dingz settings and thus accessories by using device type, dip switch settings and input configuration

The following Dingz services are implemented:

- Dimmers (LightBulb) 
- Shades (Blinds)
- Room temperature
- Motion sensor status (polling only, only for Dingz+ models)

Not (yet) implemented:

- Front LED (LightBulb)
- Buttons (StatefulProgrammableSwitch)
- Thermostat (Temperature)
- Motion sensor webhook (push mode instead of polling)


---

<!-- Links -->
[Keep a Changelog]: https://keepachangelog.com/
[Semantic Versioning]: https://semver.org/

<!-- Versions -->
[Unreleased]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.3...HEAD
[Released]: https://github.com/johannrichard/homebridge-dingz/releases
[1.2.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.3..v1.2.0
[1.1.3]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.1..v1.1.3
[1.1.2]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.1..v1.1.2
[1.1.1]: http://github.com/johannrichard/homebridge-dingz/compare/v1.1.0..v1.1.1
[1.1.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.0.1..v1.1.0
[1.0.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.0.1..v1.0.1
[1.0.0]: https://github.com/johannrichard/homebridge-dingz/releases/v1.0.0
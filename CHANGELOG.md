# Changelog
All notable changes to this project will be documented in this file.

## [Unreleased]
---
## [1.4.1] - 2020-05-21
### Added
* Support for WiFi LED Strip

## [1.4.0] - 2020-05-21
### Added
* Names of Lightbulbs will follow the naming set in DingZ
* Non-dimmable outputs will be created as simple Light Switches

### Fixed
* Fix for blank puck S/N number (Upstream edge-case/glitch/bug/feature in [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS/issues/824). This fixes [#5](https://github.com/johannrichard/homebridge-dingz/issues/5). Thanks [Simon Iannelli](https://twitter.com/simonnelli) for the help with getting to the bottom of this issue!)
* Fix for DingZ lamella tilt-angle minima/maxima (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)

## [1.3.1] - 2020-05-19
### Changed
* Add notice about plugin incompatiblity/bug 
### Fixed
* Remove log-noise 

## [1.3.0] - 2020-05-18
### Added
* Support for WiFi Lightbulb

### Fixed
* Dimmer & Shade fixes (Mismatch between API doc and real-life implementation)

## [1.2.1] - 2020-05-17
**Breaking change**: This release breaks existing configs. 

After upgrading to this version, you have to remove the plugin config block from your config, restart Homebridge, add the plugin config again and restart Homebridge once more to apply the fix. Otherwise you will end up with spurious old Lightbulbs in your setup. 

### Added
* Support for Dingz LightSensor 
### Fixed
* Fix for Dimmer index issues (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)
* Small refactorings

## [1.2.0] - 2020-05-17
### Added
* Support for DingZ Front LED

### Changed
* Replace popsicle library with axios for better POST handling

### Fixed
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

## [1.1.0] - 2020-05-15
### Added
* First tentative support for the myStrom WiFi Lightbulb

### Changed
* Only discover new devices during the first 10 minutes (Restart Homebridge if you want to rediscover)

### Fixed
* Some fixing and refactoring of the discovery code

## [1.0.1] - 2020-05-14
### Fixed
Fixes presumably wrong association of DIP switches.

## [1.0.0] - 2020-05-14

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

The format is based on [Keep a Changelog][Keep a Changelog] and this project adheres to [Semantic Versioning][Semantic Versioning].

<!-- Links -->
[Keep a Changelog]: https://keepachangelog.com/
[Semantic Versioning]: https://semver.org/

<!-- Versions -->
[Unreleased]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.3...HEAD
[Released]: https://github.com/johannrichard/homebridge-dingz/releases
[1.4.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.4.0..v1.4.1
[1.4.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.3.1..v1.4.0
[1.3.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.3.0..v1.3.1
[1.3.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.2.1..v1.3.0
[1.2.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.2.0..v1.2.1
[1.2.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.3..v1.2.0
[1.1.3]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.1..v1.1.3
[1.1.2]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.1..v1.1.2
[1.1.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.1.0..v1.1.1
[1.1.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.0.1..v1.1.0
[1.0.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.0.1..v1.0.1
[1.0.0]: https://github.com/johannrichard/homebridge-dingz/releases/v1.0.0

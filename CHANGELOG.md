# Changelog
All notable changes to this project will be documented in this file.

## [Unreleased]
---
## [Released]
## [1.7.0] - 2020-11-12
### Features
* **accessories** implement support for PIR motion sensor (Implements #87, thanks @qx54 for helping with testing)

## [1.6.1] - 2020-09-11
### Bug Fixes
* **platform** implement fix to run plugin in [HOOBS](http://hoobs.org) (Fixes #56, thanks @claude1984 for reporting it)

## [1.6.0] - 2020-06-22
### Features
* **platform:** implement exponential backoff ([e8e0797](https://github.com/johannrichard/homebridge-dingz/commit/e8e07973ce9817e2f3fbbe761e62318903b19726))
* **dingz**: read name from system configuration ([2374a43](https://github.com/johannrichard/homebridge-dingz/commit/2374a43)) (Thanks @rryter for the contribution)

## [1.5.2] - 2020-06-15
### Bug Fixes
* **dingz:** increase max listeners ([e43ee0c](https://github.com/johannrichard/homebridge-dingz/commit/e43ee0c64375550e937504ca2d5d28942c71f2ac))
* **dingz:** set pir callback only if pir present ([a3b3b0b](https://github.com/johannrichard/homebridge-dingz/commit/a3b3b0b4cb6576254466799d6793b1b6bfedb77c)), closes [#16](https://github.com/johannrichard/homebridge-dingz/issues/16)
* **schema:** remove "&" in schema ([c6f36b5](https://github.com/johannrichard/homebridge-dingz/commit/c6f36b5d1ef3f15ebf7fea492c53483a7d7e519f))

### Features
* **button:** implement low battery warning ([816c562](https://github.com/johannrichard/homebridge-dingz/commit/816c5620591a9470224661303b04b6bbc12d95f7))
* **button:** implement mystrom button ([a4e82b8](https://github.com/johannrichard/homebridge-dingz/commit/a4e82b872eddc26f5626a179da7a90ba304cad9c))

## [1.5.1] - 2020-06-01
Version 1.5.0 added support for dingz buttons. This is quite a significant change to the plugin so I expect new bugs and issues. There's quite [comprehensive]((https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons)) [documentation](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) about how this works in the Wiki so please consult it to leanr more about limitations and caveats. 

### Fixed
* **dingz:** Fix for blinds not working after refactoring ([1926110](https://github.com/johannrichard/homebridge-dingz/commit/1926110f4d18a1eba9f899772bd809915768e517)), closes [#11](https://github.com/johannrichard/homebridge-dingz/issues/11)
* **typo:** Fix typo in log output ([c6de553](https://github.com/johannrichard/homebridge-dingz/commit/c6de55343ebb2af46f489ea71806381475b795c1)), closes [#12](https://github.com/johannrichard/homebridge-dingz/issues/12)
* **typo:** Fix for typo ([75f10ac](https://github.com/johannrichard/homebridge-dingz/commit/75f10ac2f07f604814d61e6b2a37c0e54c767342)), closes [#10](https://github.com/johannrichard/homebridge-dingz/issues/10)
* **typo:** Fix for typo ([7e36033](https://github.com/johannrichard/homebridge-dingz/commit/7e360332cd4b111c230669e55649df79d062a4b9)), closes [#9](https://github.com/johannrichard/homebridge-dingz/issues/9)

## [1.5.0] - 2020-05-30
Version 1.5.0 adds support for dingz Buttons. This is quite a significant change to the plugin so I expect new bugs and issues. There's quite [comprehensive]((https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons)) [documentation](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) about how this works in the Wiki so please consult it to leanr more about limitations and caveats. 

### Added
* Add support for the dingz Buttons, including [a *stealthy* "flip-switch" mode](https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons). Please consult the [Wiki](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) for instructions if you want to use this on a different than the default port. 

### Changed
* Added more detail on the [plugin config](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings), the way the [buttons](https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons) and the way the [motion sensor](https://github.com/johannrichard/homebridge-dingz/wiki/Motion-sensor) works in the [Wiki](https://github.com/johannrichard/homebridge-dingz/wiki)
* Discovery process stops without polling a discovered device if it has already been added to HomeKit. This reduces unnecessary strain of the devices
* Additional fixes to make the plugin more robust in case of connection issues
* Reduce logging to a more useful amount in case of network issues

## [1.4.3] - 2020-05-24
### Fixed
* Bugfix release for auto-discovery on new-installs

## [1.4.2] - 2020-05-24
This is mostly a maintenance release with no new functionality. It prepares the ground for some upcoming changes related to buttons. It also brings more stability and less stress for the dingz as it combines the polling for the different services into one single call instead of 4-5 different calls.

### Changed
* Reduce device polling during auto-discovery
* Reduce the amount of logging significantly
* Under-the-hood changes for Button callback (manual)
* Add Event Bus for dingz Accessories
* Use undocumented `/api/v1/state` API endpoint, and
* Reduce polling amount by at least a factor of 4, leading to
* Lower dingz front panel temperature

## [1.4.1] - 2020-05-21
### Added
* Support for WiFi LED Strip

## [1.4.0] - 2020-05-21
### Added
* Names of Lightbulbs will follow the naming set in dingz
* Non-dimmable outputs will be created as simple Light Switches

### Fixed
* Fix for blank puck S/N number (Upstream edge-case/glitch/bug/feature in [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS/issues/824). This fixes [#5](https://github.com/johannrichard/homebridge-dingz/issues/5). Thanks [Simon Iannelli](https://twitter.com/simonnelli) for the help with getting to the bottom of this issue!)
* Fix for dingz lamella tilt-angle minima/maxima (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)

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
* Support for dingz LightSensor 
### Fixed
* Fix for Dimmer index issues (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)
* Small refactorings

## [1.2.0] - 2020-05-17
### Added
* Support for dingz Front LED

### Changed
* Replace popsicle library with axios for better POST handling

### Fixed
* Fixes for myStrom WiFi Lightbulb support

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

This plugin implements some (but not all) functions of [dingz](https://dingz.ch) Smart Home Devices. The plugin also supports (some) myStrom Devices as they share much of the same API definitions and concepts with dingz.

The plugin attempts to

- auto-discover devices, and to
- auto-identify dingz settings and thus accessories by using device type, dip switch settings and input configuration

The following dingz services are implemented:

- Dimmers (LightBulb) 
- Shades (Blinds)
- Room temperature
- Motion sensor status (polling only, only for dingz+ models)

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
[Unreleased]: https://github.com/johannrichard/homebridge-dingz/compare/v1.6.1...HEAD
[Released]: https://github.com/johannrichard/homebridge-dingz/releases
[1.7.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.6.1..v1.7.0
[1.6.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.6.0..v1.6.1
[1.6.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.5.2..v1.6.0
[1.5.2]: https://github.com/johannrichard/homebridge-dingz/compare/v1.5.1..v1.5.2
[1.5.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.5.0..v1.5.1
[1.5.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.4.3..v1.5.0
[1.4.3]: https://github.com/johannrichard/homebridge-dingz/compare/v1.4.2..v1.4.3
[1.4.2]: https://github.com/johannrichard/homebridge-dingz/compare/v1.4.1..v1.4.2
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

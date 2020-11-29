# Homebridge Plugin for dingz Devices: homebridge-dingz

![Build and Lint](https://github.com/johannrichard/homebridge-dingz/workflows/Build%20and%20Lint/badge.svg)
![Node.js Package](https://github.com/johannrichard/homebridge-dingz/workflows/Node.js%20Package/badge.svg)

This plugin implements some (but not all) functions of [dingz](https://dingz.ch) Smart Home Devices. The plugin also supports (some) myStrom Devices as they share much of the same API definitions and concepts with dingz.

Please have a look at the [Wiki](https://github.com/johannrichard/homebridge-dingz/wiki) for more details on the configuration options and the plugin's behavior _vis-à-vis_ the dingz' settings for outputs and more, as well as on the supported devices.

## Auto-discovery
The plugin attempts to

- auto-discover devices, and to
- auto-identify dingz settings and thus accessories by using device type, dip switch settings and input configuration

Older myStrom WiFi Switches don't support auto-discovery and must be added manually. Depending on your setup, you might want or have to add all your devices manually. Configuration settings will be read-out automatically in either case.

## Usage
Easy: Install and configure the plugin via [Config UI X](https://www.npmjs.com/package/homebridge-config-ui-x) in a working [HomeBridge](https://homebridge.io) environment. This is the recommended way.

Harder: See [the Wiki](https://github.com/johannrichard/homebridge-dingz/wiki) for instructions.

## Caveats (See [CHANGELOG.md](CHANGELOG.md) as well)

- The plugin is in an early (beta) stage -- lots and lots of errors when running are probably the norm, and not the exception
- Each dingz device is created as **one** accessory. This means that all services (Lights, Blinds, Temperature and Motion) share the same room in HomeKit. This can not be changed and would require to break up the accessory into separate accessories per function. However, this would be inconsistent with HomeKit design principles and also violate some physical design/wiring constraints of the dingz.
- There is limited sanity checking regarding your dingz configuration, but the main features -- precedence of DIP switch over Input config, and detection of PIR availability -- should work according to the [official API documentation](https://api.dingz.ch)
- Most of the features have been tested againts the [published version](https://api.dingz.ch) of the dingz and a Mock Server that simulates the many different configuration options you get with your dingz device (Dimmers, Dimmers & Blinds, Blinds, PIR/No PIR, Input/No Input etc.). While I have been careful to test with realistic data and also with real devices, there [*will*](https://github.com/johannrichard/homebridge-dingz/issues/5) be hard-to-catch mistakes coming from undocumented behaviour or glitches in my code. Feel free to open an [Issue](https://github.com/johannrichard/homebridge-dingz/issues) if you run into something.
- I observed subtle differences between different Firmware versions for the V2 WiFi Switches (e.g. what's returned in the `type` field of the `/api/v1/info` endpoint). Newer Firmware versions seem to divert from the published API and the differences are undocumented -- which makes it trickier to discover the right type of a V1/V2/EU WiFi Switch
- If you run into bigger problems, try to run Homebridge manually in "debug" mode: `homebridge -D`: You will receive lots of messages which should you help track down the problem (The REST tokens are never printed, but information like your device's IP address might be found in the debug logs. In case you're opening a bug report and add debug info, make sure you remove whatever information you consider sensitive)

## Disclaimer 

**Disclaimer**: No warranties whatsoever, use this plugin entirely at your own risk. dingz may only be installed by qualified professionals. 

**Full disclosure**: The author of this plugin is not affiliated in any way with Iolo AG or MyStrom AG. [Iolo AG](https://iolo.ch), the producer of dingz', was so kind to provide me with one test device. I'm very grateful for this and hope this little plugin can contribute a little bit to help dingz spread its wings. Thanks also to [myStrom AG](mystrom.ch) who provided me with some gear to implement additional myStrom Devices.

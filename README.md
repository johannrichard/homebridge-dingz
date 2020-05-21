# Homebridge Plugin for Dingz Devices: homebridge-dingz

![Build and Lint](https://github.com/johannrichard/homebridge-dingz/workflows/Build%20and%20Lint/badge.svg)
![Node.js Package](https://github.com/johannrichard/homebridge-dingz/workflows/Node.js%20Package/badge.svg)

This plugin implements some (but not all) functions of [Dingz](https://dingz.ch) Smart Home Devices. The plugin also supports (some) myStrom Devices as they share much of the same API definitions and concepts with Dingz.

The plugin attempts to

- auto-discover devices, and to
- auto-identify dingz settings and thus accessories by using device type, dip switch settings and input configuration

The following Dingz services are implemented:

- Dimmers (LightBulb) & Non-Dimmable Lights
- Shades (Blinds)
- Room temperature (Temperature)
- Front LED (LightBulb)
- Light Sensor
- Motion sensor status (polling only, only for Dingz+ models)

Not (yet) implemented:

- Buttons (StatefulProgrammableSwitch)
- Thermostat (Temperature)
- Motion sensor webhook (push mode instead of polling)

## MyStrom Devices

My original [homebridge-mystrom](https://github.com/johannrichard/homebridge-mystrom) plugin was written a while ago. HomeKit, Homebridge and the JavaScript/TypeScript world have all come a long way since then. Since the [Dingz](https://dingz.ch) devices share a similar approach to auto-dsicovery and API with [MyStrom Devices](https://mystrom.ch), it is in fact quite simple to implement basic support for MyStrom Devices. 

Currently, the following MyStrom Devices are implemented in this plugin:

- MyStrom WiFi Switch CH V1 (tested, must be manually added)
- MyStrom WiFi Switch CH V2 (tested, w/ auto-discovery)
- MyStrom WiFi Switch EU (untested, should work with auto-discovery too)
- MyStrom WiFi Lightbulb (tested, w/ auto-discovery)

## Usage

Easy: Install and configure the plugin via [Config UI X](https://www.npmjs.com/package/homebridge-config-ui-x) 

Harder: Install the plugin manually and configure it directly via the Homebridge config file:

```bash
npm install -g homebridge-dingz
```

Add a "Dingz" platform block to your Homebridge config (under platforms)

```json
"platforms": [

  {
      "name": "Dingz SmartHome Devices",
      "platform": "Dingz",
      "globalToken": "74ccbf570f4b4be09d37b7ff4ea03954551f9263"
  }
]
```

_Note_: The `globalToken` is only required if you've set a REST API Token which is shared by all Dingz you own.

If your Dingz Devices reside on a separate subnet than your Homebridge installation and/or use different REST API tokens each, then add the devices manually.

```json
  "platforms": [
    {
        "name": "Dingz SmartHome Devices",
        "platform": "Dingz",
        "globalToken": "74ccbf570f4b4be09d37b7ff4ea03954551f9263",
        "devices": [
            {
              "name": "Dingz SmartHome Device #1",
              "address": "ip or address",
              "type": "Dingz"
            }
        ]
    }
  ]
```

## Rationale

__Q__: myStrom devices and Dingz (eventually) support HomeKit directly, so why should I use that plugin?

__A__: There are a number of scenarios where using HomeBridge and this plugin with your Smart Home devices might be advisable. For example, you might want to put all IoT devices on a separate VLAN, both securing them and your other devices in case of security issues. With HomeKit alone, this quickly becomes a multicast nightmare -- with this plugin, you simply make the smart devices accessible for your HomeBridge device. You could for example isolate all IoT Devices in their VLAN from each other and only allow trusted devices from other subnets to access the Dingz and myStrom REST API.

## Caveats

- The plugin is in a very early (alpha) stage -- lots and lots of errors when running are probably the norm, and not the exception
- Motion state is polling-only. This means that motion triggers are not instantaneous right now and also that your devices are hammered with requests every 1.5s - 2s
- Each Dingz device is created as **one** accessory. This means that all services (Lights, Blinds, Temperature and Motion) share the same room in HomeKit. This can not be changed and would require to break up the accessory into separate accessories per function. However, this would be inconsistent with HomeKit design principles and also violate some physical design/wiring constraints of the Dingz.
- There is limited sanity checking regarding your Dingz configuration, but the main features -- precedence of DIP switch over Input config, and detection of PIR availability -- should work according to the [official API documentation](https://api.dingz.ch).
- Most of the features have been tested againts the [published version](https://api.dingz.ch) of the Dingz and a Mock Server that simulates the many different configuration options you get with your DingZ device (Dimmers, Dimmers & Blinds, Blinds, PIR/No PIR, Input/No Input etc.). While I have been careful to test with realistic data, there might be hard-to-catch mistakes coming from undocumented behaviour or glitches in my code. Feel free to open an [Issue](https://github.com/johannrichard/homebridge-dingz/issues) if you run into something.
- I observed subtle differences between different Firmware versions for the V2 WiFi Switches (e.g. what's returned in the `type` field of the `/api/v1/info` endpoint). Newer Firmware versions seem to divert from the published API and the differences are undocumented -- which makes it trickier to discover the right type of a V1/V2/EU WiFi Switch
- If you run into bigger problems, try to run Homebridge manually in "debug" mode: `homebridge -D`: You will receive lots of messages which should you help track down the problem (The REST tokens are never printed, but information like your device's IP address might be found in the debug logs. In case you're opening a bug report and add debug info, make sure you remove whatever information you consider sensitive)

**Disclaimer**: No warranties whatsoever, use this plugin entirely at your own risk. Dingz may only be installed by qualified professionals. 

**Full disclosure**: The author of this plugin is not affiliated in any way with Iolo AG or MyStrom AG. [Iolo AG](https://iolo.ch), the producer of Dingz', was so kind to provide me with one test device. I'm very grateful for this and hope this little plugin can contribute a little bit to help Dingz spread its wings. Thanks also to [myStrom AG](mystrom.ch) who provied me with some gear to implement additional myStrom Devices.

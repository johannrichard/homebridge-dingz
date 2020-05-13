# Homebridge Plugin for Dingz Devices: homebridge-dingz-da

This plugin implements some (but not all) functions of a [dingz](https://dingz.ch) Smart Home Device. Might eventually also support myStrom Devices as they share much of the same API definitions and concepts with Dingz.

The plugin attempts to

- auto-discover devices, and to
- auto-identify dingz settings and thus accessories by using device type, dip switch settings and input configuration

While the plugin attempts to discover different kinds of devices, currently only Dingz devices are supported, but eventually also myStrom might be implemented, as these share a lot of the code.

The following servies are implemented:

- Room temperature
- Motion sensor status (polling only)
- Dimmers (LightBulb)
- Shades (Blinds)

Not yet implemented:

- Switches (Switch)
- LED ()
- Buttons (StatefulProgrammableSwitch)
- Thermostat (Temperature)

## Usage

Install the plugin:

```bash
npm install -g git+https://git@github.com/johannrichard/homebridge-dingz-da
```

Add a "Dingz" platform block to your Homebridge config (under platforms) (or add this via the Homebridge Config UI X interface which is also supported).

```json
"platforms": [

  {
      "name": "Dingz SmartHome Devices",
      "platform": "Dingz",
      "globalToken": "74ccbf570f4b4be09d37b7ff4ea03954551f9263",
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
              "address": "ip or address"
            }
        ]
    }
  ]
```

## Rationale

_Q_: myStrom devices and Dingz (eventually) support HomeKit directly, so why should I use that plugin?
_A_: There are a number of scenarios where using HomeBridge and this plugin with your Smart Home devices might be advisable. For example, you might want to put all IoT devices on a separate VLAN, both securing them and your other devices in case of security issues. With HomeKit alone, this quickly becomes a multicast nightmare -- with this plugin, you simply make the smart devices accessible for your HomeBridge device. You could for example isolate all IoT Devices in their VLAN from each other and only allow trusted devices from other subnets to access the Dingz and myStrom REST API.

## Caveats

- The plugin is in a very early stage -- lots and lots of errors when running are probably the norm, and not the exception
- Motion state is polling-only. This means that motion triggers are not instantaneous right now
- Each Dingz device is created as **one** accessory. This means that all services (Lights, Blinds, Temperature and Motion) share the same room in HomeKit. This can not be changed and would require to break up the accessory into separate accessories per function. However, this would be inconsistent with HomeKit design principles and also violate some physical design/wiring constraints of the Dingz.
- There is limited sanity checking regarding your Dingz configuration, but the main features -- precedence of DIP switch over Input config, and detection of PIR availability -- should work according to the [official API documentation](https://api.dingz.ch).

**Disclaimer**: No warranties whatsoever, use this entirely at your own risk. Consult a certified electrician if you need assistance in wiring and installing your Dingz. 

**Full discolsure**: [Iolo AG](https://iolo.ch), the maker of the Dingz', was so kind to provide me with one test device. I'm very grateful for this and hope this little plugin can contribute a little bit to help Dingz spread its wings.

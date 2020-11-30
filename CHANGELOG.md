# Changelog

## Release Notes

### BREAKING v2.0

Version `v2.0` will _break_ your setup (but only if you use blinds). If you upgrade to this version and have a dingz with blinds configured, you will have to

- remove all your **dingz** accessories with blinds (but only these) from Homebridge (can easily be done in the [Homebridge Config X UI](https://github.com/oznu/homebridge-config-ui-x)); and
- add them again (automatically or by manually adding them via the config);

Some long-standing bugs with blinds have seen changes that unfortunately will break setups with blinds. If you upgrade to `v2.0.0.` and then want to downgrade to `v1.7.1` (the last stable `v1.x.x` version) your setup will break again. Also, I can not (yet) guarantee that there are no problems with the blinds. The way the dingz `API` works makes it quite cumbersome to reliably work with blinds under all circumstances.

If you only use the dimmers you should not be concerned.

### Acknowledgements

Thanks to @granturism0, @qx54, @simonnelli for their contributions and help in crafting this release.

### Improvements and (hopefully) nice things

Besides these breaking changes, `v2.0.0` will also bring a few new features to your homebridge setup:

- If your devices change IP address, this will be picked up if either auto-discovery is running _or_ if you change/update manually configured devices [Applies both to myStrom and dingz]
- Blind names should be picked-up now (implements #129, thanks @granturism0 for the support and suggestion) and updated accordingly
- Updated accessory names should be reflected in the logs and will propagate to HomeKit too (takes some time, and won't overwrite any changes you've made in HomeKit itself)
- if a device can not be reached, HomeKit will indicate a `no response`
- we show a heartbeat of the devices (_DEAD_ or _ALIVE_) in the log
- if the device comes back up again, it will be re-discovered and added again
- the whole fetching of data and status reports has been improved. Both server and device load should be lower now
- extensive debugging of network requests and errors
- more robust error handling overall, based on Promises
- colored output includes the name of the associated item in the debug log
- last but not least, it implements fixes for #3, #103, #116, #120, #123, #124, #129, #135
- more robust updates (both ways --> from HomeKit to the devices and also back)
- less load on your devices _and_ your server (fewer network requests made)
- (even) stricter code quality checks and an upgrade TypeScript 4.0

Overall over 60 changes have been implemented, and a lot of effort and time has been invested in making the plugin more robust (and logical). It still has some rough edges, though, and things might still break.

### Detailed Changes

#### 2.0.4 (2020-11-30)

##### Bug Fixes

- **dingz:** fix naming & visibility glitch with dimmer assignment ([cc40b4f2](https://github.com/johannrichard/homebridge-dingz/commit/cc40b4f266924de30ffecc950cad237d65dd9600))

#### 2.0.3 (2020-11-30)

##### Build System / Dependencies

- **npm:** set homepage ([5f6cfed5](https://github.com/johannrichard/homebridge-dingz/commit/5f6cfed526c81fd9bce266db668fd916a5f5c7e2))

#### 2.0.2 (2020-11-30)

##### Bug Fixes

- **dingz:**
  - don't add D1 if `not_connected` ([aef7298a](https://github.com/johannrichard/homebridge-dingz/commit/aef7298aa9539ccdbc01c97b82408441bd83cd16))
  - blinds - it's (was?) complicated ([182ba553](https://github.com/johannrichard/homebridge-dingz/commit/182ba55339c0e2cffe4b1dd46b8ba976522b0434))

#### 2.0.0 (2020-11-29)

##### Documentation Changes

- **changelog:** v1.8.0 ([f33d1dea](https://github.com/johannrichard/homebridge-dingz/commit/f33d1dea46896d96007d03e83b9643a460d8805a))

##### New Features

- **accessories:**
  - reachability state ([5f70bb59](https://github.com/johannrichard/homebridge-dingz/commit/5f70bb596f0f38cdbd2cc319b6498eb2ed3612bb))
  - consistent naming ([c3f5cfcd](https://github.com/johannrichard/homebridge-dingz/commit/c3f5cfcd568309e262a744f2450fab29edd94ab4))
  - request logging ([d4be51d9](https://github.com/johannrichard/homebridge-dingz/commit/d4be51d9bf952d52993f8f1a7bb8b4cb790cf738))
  - request error logging - improve logging of request errors - less log clutter - make use of the improved logger in 07216785b209a20628aef2fa2ef796c65b1dd973 ([f936ae8a](https://github.com/johannrichard/homebridge-dingz/commit/f936ae8a826e8a986c252d5cf578e1205ece4a53))
  - improved accessory logging - prefix the device name to all log messages - color it nicely (if you like magenta, otherwise it's just 'color it' :smile:) - helps keeping tabs on issues with accessories ([07216785](https://github.com/johannrichard/homebridge-dingz/commit/07216785b209a20628aef2fa2ef796c65b1dd973))
- **plugin:** stability & reliability improvements ([70e88aa7](https://github.com/johannrichard/homebridge-dingz/commit/70e88aa7c3eca0dc2f57f6ddc6dee7e391b2b269))
- **dingz:** handle accessory ip address changes - update accessory if the IP changes in config or from auto-discovery - implements [#3](https://github.com/johannrichard/homebridge-dingz/pull/3) :smile: ([896ff5b5](https://github.com/johannrichard/homebridge-dingz/commit/896ff5b5e9e7a64a13eed6ef1c53cd52307d6f69))

##### Bug Fixes

- **button:** getDeviceStateUpdate not implemented ([16748447](https://github.com/johannrichard/homebridge-dingz/commit/16748447787dd44c51389088078c794937e97356))
- **dingz:**
  - blinds – it's complicated ([5e9affc6](https://github.com/johannrichard/homebridge-dingz/commit/5e9affc6dbc95e9d9e04068969ded5b4d99e42b0))
  - update blind config on update ([90d9b5be](https://github.com/johannrichard/homebridge-dingz/commit/90d9b5bec55d7c3e8aaae95fc0c9f5a8a3f38686))
  - windowcovering update ([b5f136b5](https://github.com/johannrichard/homebridge-dingz/commit/b5f136b546c1d3757e57aabbcecccd923357fb07))
  - reduce request load ([4e381637](https://github.com/johannrichard/homebridge-dingz/commit/4e38163777756b67f3967098552487c9994850dd))
  - more accurate blind state ([bcde13c7](https://github.com/johannrichard/homebridge-dingz/commit/bcde13c733d32e0431059258044ba40d9bdb6ce4))
  - max tilt value ([e282116a](https://github.com/johannrichard/homebridge-dingz/commit/e282116a362a5dcb24996d3235ee7531ab6e8f1f))
  - field name change ([452fa797](https://github.com/johannrichard/homebridge-dingz/commit/452fa797141c685f1d485a89610ec5ca932be715))
  - better fix for [#124](https://github.com/johannrichard/homebridge-dingz/pull/124) ([c6663407](https://github.com/johannrichard/homebridge-dingz/commit/c6663407e35c5fe538c906c6d7f0688850c83a88))
  - [FIX] resolve tilt angle inconsistencies [#124](https://github.com/johannrichard/homebridge-dingz/pull/124) ([5df67b9b](https://github.com/johannrichard/homebridge-dingz/commit/5df67b9bd0b9471d1a2620c89ba7cc7adfd97521))
  - fix for tilt angle ([b8d03a8f](https://github.com/johannrichard/homebridge-dingz/commit/b8d03a8f4358881194af1cbbf8f493c0027e4ea9))
  - refactor update handling ([e69deb2b](https://github.com/johannrichard/homebridge-dingz/commit/e69deb2bb82da97fd71b1dc8619f8f5e2100ff37))
  - better blinds error handling ([46b85b11](https://github.com/johannrichard/homebridge-dingz/commit/46b85b11d5f730b146816e8a18cd5d6b66ffb627))
  - better request error handling ([b3ae78f4](https://github.com/johannrichard/homebridge-dingz/commit/b3ae78f4c24640b44c7cd2a45a5c08c0278620ee))
  - add error handler ([ae71f85d](https://github.com/johannrichard/homebridge-dingz/commit/ae71f85d3c932b948a2dd63e45d3c2ad3e165b1e))
  - update characteristics ([561d6464](https://github.com/johannrichard/homebridge-dingz/commit/561d64648bc7d17c40d975a44266afec68f9618e))
  - make sure we don't schlepp along the reachability service ([fddbfad2](https://github.com/johannrichard/homebridge-dingz/commit/fddbfad2926bfa28bff580da562db6ae6d3e1c4c))
  - fix variable name ([f1fae162](https://github.com/johannrichard/homebridge-dingz/commit/f1fae162fa1d5ff2d546362ea7c13bd477749355))
  - fix crash for undefined value - also fix the variable name ([1a58cb9f](https://github.com/johannrichard/homebridge-dingz/commit/1a58cb9f6975b72f066106133f5f0e8ac658d637))
- **lightbulb:**
  - don't encode values ([72923330](https://github.com/johannrichard/homebridge-dingz/commit/729233300c7e904cca6ae67c8fd76c18a098031c))
  - set on/off state correctly ([697d13c6](https://github.com/johannrichard/homebridge-dingz/commit/697d13c6a6f460beac7159da9640fda179b7b411))
- **plugin:**
  - improve event handling ([7853b2b8](https://github.com/johannrichard/homebridge-dingz/commit/7853b2b842a216ecd511a58f40d1eaf6516906f9))
  - improve event handling ([26a908d8](https://github.com/johannrichard/homebridge-dingz/commit/26a908d8cef5db06db8e3dea745a2a1e20834b18))
  - more robust event and request handling ([982ff2ae](https://github.com/johannrichard/homebridge-dingz/commit/982ff2aed0bb45caf727eedb7bd3d0b60e0339b5))
- **build:**
  - keep version number ([34c39214](https://github.com/johannrichard/homebridge-dingz/commit/34c39214ae6ef01c882fbcb3f63fefe36befdcc3))
  - add additional dependencies ([97b14613](https://github.com/johannrichard/homebridge-dingz/commit/97b14613cbca3cad39187e2956480b95c4f2f98a))
  - add dependency for chalk ([bf7aa6dd](https://github.com/johannrichard/homebridge-dingz/commit/bf7aa6dd938f59fb8f25a5b1c0ab2b8615c8d998))
- **logging:** force color in DingzLogger ([6ee2c669](https://github.com/johannrichard/homebridge-dingz/commit/6ee2c669191ffb6acbadd06502014eebbef47c6c))
- **platform:** handle axios errors ([5758901c](https://github.com/johannrichard/homebridge-dingz/commit/5758901c44b6ea89e38edccebe9c2452e4ce331f))

##### Other Changes

- **dingz:**
  - more accurate blind state" ([0771ff53](https://github.com/johannrichard/homebridge-dingz/commit/0771ff53de9f9ab1a9bf91682094707a2eb7c98b))
  - merge pull request [#114](https://github.com/johannrichard/homebridge-dingz/pull/114) from granturism0/develop-granturismo ([67d761e7](https://github.com/johannrichard/homebridge-dingz/commit/67d761e7e1ec323170e830b2f89019c4de241e27))
- **deps:** bump cockatiel from 1.1.1 to 2.0.0" ([a3dbd0c1](https://github.com/johannrichard/homebridge-dingz/commit/a3dbd0c1765f1c579f922d9a50be11a43dd1925e))

##### Refactors

- **dingz:**
  - standardise variable naming ([e00b8cff](https://github.com/johannrichard/homebridge-dingz/commit/e00b8cff2c9e87c0173b0a2eafe7fa31b97b4925))
  - remove unnecessary code ([d0ddb5f0](https://github.com/johannrichard/homebridge-dingz/commit/d0ddb5f0ec8842e85e270baa0173883f42675441))
  - rename DingzDaAccessory ([b937eed1](https://github.com/johannrichard/homebridge-dingz/commit/b937eed1b231b3850c8390eadab42ccae41333a9))
  - remove spurious bits of code ([f5b766e9](https://github.com/johannrichard/homebridge-dingz/commit/f5b766e951fcca6ecbdfe37a6e24546ede1d2ba1))
  - use `semver` library for PIR callback ([7364c7f8](https://github.com/johannrichard/homebridge-dingz/commit/7364c7f87dabf57d7d77208bcd29e08dd14e2276))
  - device discovery ([d40ba1e2](https://github.com/johannrichard/homebridge-dingz/commit/d40ba1e208eb93881b0cbb5292443795c3febb89))
  - start consolidation of config gathering ([7b55a0aa](https://github.com/johannrichard/homebridge-dingz/commit/7b55a0aa0dfc5dda1e2d6c84bf7cab59a9d0e394))
  - better debug logging ([901c051b](https://github.com/johannrichard/homebridge-dingz/commit/901c051b59a3fc37c95543bb2573085394f5147c))
  - remove spurious log entry ([758db980](https://github.com/johannrichard/homebridge-dingz/commit/758db980e601faeb4576de5f10114d6db4a55274))
- **platform:**
  - put update interval in `settings.ts` ([6bf9522b](https://github.com/johannrichard/homebridge-dingz/commit/6bf9522ba2b5c692aa96dfb4352f4affa9ea4d15))
  - event-driven update cycle ([7934ed07](https://github.com/johannrichard/homebridge-dingz/commit/7934ed070e9e701cf8e640d3b22760207bbc8e3d))
  - simplify event bus listener signature ([8077f36a](https://github.com/johannrichard/homebridge-dingz/commit/8077f36a3e0ce78ae4fcbbd7c357d67de031d5a4))
- **accessories:**
  - logger shorthand ([76a609b4](https://github.com/johannrichard/homebridge-dingz/commit/76a609b4553dc200873bf85171a8ff57c46f07e9))
  - implement a base class ([4ac83a3a](https://github.com/johannrichard/homebridge-dingz/commit/4ac83a3a217613dd6cb0230e4db242ccc8d06587))
  - update characteristics consistently ([ae52bd2a](https://github.com/johannrichard/homebridge-dingz/commit/ae52bd2aacc6d0ad6537f812bf5b4d19002b2581))
  - use updateCharacteristic ([1a6ecc19](https://github.com/johannrichard/homebridge-dingz/commit/1a6ecc19578709e26cb2d69b347a1b3f7b922f6f))
- **src:** rename util to lib ([7817e883](https://github.com/johannrichard/homebridge-dingz/commit/7817e8831c39aea7e6276e47946f72dd6d339d4c))

##### Reverts

- **commit:** 73298a58f2cfbf3dff2a12e146ab1d137b2aac64 ([c6207c8a](https://github.com/johannrichard/homebridge-dingz/commit/c6207c8a28c2a17003f8329df3a93147c82050a4))

##### Code Style Changes

- **accessories:**
  - simplify heartbeat ([6765fdbf](https://github.com/johannrichard/homebridge-dingz/commit/6765fdbfd913a2ee2ba30897927ad1e3e68a1642))
  - streamline logging name ([472e7034](https://github.com/johannrichard/homebridge-dingz/commit/472e7034bb6ea9b30f44b60e015e1b9f95466201))
- **dingz:** fix typos ([155853d9](https://github.com/johannrichard/homebridge-dingz/commit/155853d9f45fb7dd7bb6839de54cc2ffaf0c81b4))
- **code:** add issue references in fixme/todo ([97264a23](https://github.com/johannrichard/homebridge-dingz/commit/97264a23f90bd3d3d156ccc9423addb8f8f3e665))

#### 1.8.2 (2020-11-21)

##### Build System / Dependencies

- **changelog:** automatically generate changelog ([85f06f22](https://github.com/johannrichard/homebridge-dingz/commit/85f06f22cf4a52a8703435801226f5dc42ce02b1))

##### Other Changes

- **deps:** bump cockatiel from 1.1.1 to 2.0.0" ([a3dbd0c1](https://github.com/johannrichard/homebridge-dingz/commit/a3dbd0c1765f1c579f922d9a50be11a43dd1925e))

#### 1.8.1 (2020-11-21)

##### Build System / Dependencies

- **deps-dev:**
  - add generate-changelog ([40f3c2e4](https://github.com/johannrichard/homebridge-dingz/commit/40f3c2e418abcee009ecb723949e90fd1d85ee7b))
  - bump @types/qs from 6.9.4 to 6.9.5 ([36726175](https://github.com/johannrichard/homebridge-dingz/commit/36726175a421ab4800555d76e2f39977908cbdc9))
  - bump prettier from 2.1.1 to 2.1.2 ([ef3b4605](https://github.com/johannrichard/homebridge-dingz/commit/ef3b4605658feb64a0b8beeb6080eb548a896814))
  - bump prettier from 2.1.1 to 2.1.2 ([148ecba7](https://github.com/johannrichard/homebridge-dingz/commit/148ecba7f00435f1746753d2d62176d83f7190de))
  - bump @types/qs from 6.9.4 to 6.9.5 ([75ae3a9c](https://github.com/johannrichard/homebridge-dingz/commit/75ae3a9cbde9646e883d4f314c9fa14909ace6ad))
- **deps:**
  - bump cockatiel from 1.1.1 to 2.0.0 ([16c13f5e](https://github.com/johannrichard/homebridge-dingz/commit/16c13f5e205ba5f775e6f1860674585f1d7bca04))
  - bump cockatiel from 1.1.1 to 2.0.0 ([1ba9bdf2](https://github.com/johannrichard/homebridge-dingz/commit/1ba9bdf2941c2ac5feb7dc971f89722d08ecf59d))

##### Bug Fixes

- **dingz:**
  - update characteristics ([561d6464](https://github.com/johannrichard/homebridge-dingz/commit/561d64648bc7d17c40d975a44266afec68f9618e))
  - make sure we don't schlepp along the reachability service ([fddbfad2](https://github.com/johannrichard/homebridge-dingz/commit/fddbfad2926bfa28bff580da562db6ae6d3e1c4c))
  - fix variable name ([f1fae162](https://github.com/johannrichard/homebridge-dingz/commit/f1fae162fa1d5ff2d546362ea7c13bd477749355))
  - fix crash for undefined value - also fix the variable name ([1a58cb9f](https://github.com/johannrichard/homebridge-dingz/commit/1a58cb9f6975b72f066106133f5f0e8ac658d637))

##### Other Changes

- **dingz:** merge pull request [#114](https://github.com/johannrichard/homebridge-dingz/pull/114) from granturism0/develop-granturismo ([67d761e7](https://github.com/johannrichard/homebridge-dingz/commit/67d761e7e1ec323170e830b2f89019c4de241e27))

##### Refactors

- **dingz:**
  - better debug logging ([901c051b](https://github.com/johannrichard/homebridge-dingz/commit/901c051b59a3fc37c95543bb2573085394f5147c))
  - remove spurious log entry ([758db980](https://github.com/johannrichard/homebridge-dingz/commit/758db980e601faeb4576de5f10114d6db4a55274))
- **platform:** simplify event bus listener signature ([8077f36a](https://github.com/johannrichard/homebridge-dingz/commit/8077f36a3e0ce78ae4fcbbd7c357d67de031d5a4))

##### Reverts

- **commit:** 73298a58f2cfbf3dff2a12e146ab1d137b2aac64 ([c6207c8a](https://github.com/johannrichard/homebridge-dingz/commit/c6207c8a28c2a17003f8329df3a93147c82050a4))

##### Code Style Changes

- **code:** add issue references in fixme/todo ([97264a23](https://github.com/johannrichard/homebridge-dingz/commit/97264a23f90bd3d3d156ccc9423addb8f8f3e665))

# [1.8.0](https://github.com/johannrichard/homebridge-dingz/compare/v1.7.1...v1.8.0) (2020-11-14)

### Bug Fixes

- **dingz:** don't set callback for newer firmware versions ([eb5e7e5](https://github.com/johannrichard/homebridge-dingz/commit/eb5e7e5e661313e3620881878cb7689b9b852972))
- **dingz:** fixes [#102](https://github.com/johannrichard/homebridge-dingz/issues/102) ([e468728](https://github.com/johannrichard/homebridge-dingz/commit/e468728590aaaeebf0d554b302145f8f414593d9))
- **dingz:** small fixes to the code ([21d04bb](https://github.com/johannrichard/homebridge-dingz/commit/21d04bba063d8eff2259d4718d563426b395fa0c))
- **dingz:** small fixes to the code ([c390c57](https://github.com/johannrichard/homebridge-dingz/commit/c390c5796253f38967480115b36546cbdd43cdeb))

### Features

- **dingz:** closes [#17](https://github.com/johannrichard/homebridge-dingz/issues/17): implement support for reachability ([73298a5](https://github.com/johannrichard/homebridge-dingz/commit/73298a58f2cfbf3dff2a12e146ab1d137b2aac64))
- **dingz:** update accessory from dingz ([038a33a](https://github.com/johannrichard/homebridge-dingz/commit/038a33af27d9bcc8b9d5a8fe05a7745ee3b96e87))

## [1.7.1](https://github.com/johannrichard/homebridge-dingz/compare/v1.7.0...v1.7.1) (2020-11-14)

### Bug Fixes

- **accessories:** better error reporting ([680407d](https://github.com/johannrichard/homebridge-dingz/commit/680407d75beadb6ee12c037bc766066d77c74510))
- **accessories:** better error reporting ([cdda81f](https://github.com/johannrichard/homebridge-dingz/commit/cdda81f06983f71c6c6f8b5c1e2e140cdf5a102d))

### Features

- **accessories:** streamline push naming ([9614ad6](https://github.com/johannrichard/homebridge-dingz/commit/9614ad61e838b9fba0162406b96c54cd2bbd2b9a))
- **accessories:** support wifi pir motion sensor ([f4b2155](https://github.com/johannrichard/homebridge-dingz/commit/f4b2155bac0ea279f66d343151ada78292b5a737)), closes [#87](https://github.com/johannrichard/homebridge-dingz/issues/87)
- **pir:** implement push for pir motion ([c1a3098](https://github.com/johannrichard/homebridge-dingz/commit/c1a3098397316e76ad5a996c860d50eed7d22c67))

## [1.7.0] - 2020-11-12

### Features

- **accessories** implement support for PIR motion sensor (close #87, thanks @qx54 for helping with testing)

## [1.6.1] - 2020-09-11

### Bug Fixes

- **platform** implement fix to run plugin in [HOOBS](http://hoobs.org) (Fixes #56, thanks @claude1984 for reporting it)

## [1.6.0] - 2020-06-22

### Features

- **platform:** implement exponential backoff ([e8e0797](https://github.com/johannrichard/homebridge-dingz/commit/e8e07973ce9817e2f3fbbe761e62318903b19726))
- **dingz**: read name from system configuration ([2374a43](https://github.com/johannrichard/homebridge-dingz/commit/2374a43)) (Thanks @rryter for the contribution)

## [1.5.2] - 2020-06-15

### Bug Fixes

- **dingz:** increase max listeners ([e43ee0c](https://github.com/johannrichard/homebridge-dingz/commit/e43ee0c64375550e937504ca2d5d28942c71f2ac))
- **dingz:** set pir callback only if pir present ([a3b3b0b](https://github.com/johannrichard/homebridge-dingz/commit/a3b3b0b4cb6576254466799d6793b1b6bfedb77c)), closes [#16](https://github.com/johannrichard/homebridge-dingz/issues/16)
- **schema:** remove "&" in schema ([c6f36b5](https://github.com/johannrichard/homebridge-dingz/commit/c6f36b5d1ef3f15ebf7fea492c53483a7d7e519f))

### Features

- **button:** implement low battery warning ([816c562](https://github.com/johannrichard/homebridge-dingz/commit/816c5620591a9470224661303b04b6bbc12d95f7))
- **button:** implement mystrom button ([a4e82b8](https://github.com/johannrichard/homebridge-dingz/commit/a4e82b872eddc26f5626a179da7a90ba304cad9c))

## [1.5.1] - 2020-06-01

Version 1.5.0 added support for dingz buttons. This is quite a significant change to the plugin so I expect new bugs and issues. There's quite [comprehensive](<(https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons)>) [documentation](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) about how this works in the Wiki so please consult it to leanr more about limitations and caveats.

### Fixed

- **dingz:** Fix for blinds not working after refactoring ([1926110](https://github.com/johannrichard/homebridge-dingz/commit/1926110f4d18a1eba9f899772bd809915768e517)), closes [#11](https://github.com/johannrichard/homebridge-dingz/issues/11)
- **typo:** Fix typo in log output ([c6de553](https://github.com/johannrichard/homebridge-dingz/commit/c6de55343ebb2af46f489ea71806381475b795c1)), closes [#12](https://github.com/johannrichard/homebridge-dingz/issues/12)
- **typo:** Fix for typo ([75f10ac](https://github.com/johannrichard/homebridge-dingz/commit/75f10ac2f07f604814d61e6b2a37c0e54c767342)), closes [#10](https://github.com/johannrichard/homebridge-dingz/issues/10)
- **typo:** Fix for typo ([7e36033](https://github.com/johannrichard/homebridge-dingz/commit/7e360332cd4b111c230669e55649df79d062a4b9)), closes [#9](https://github.com/johannrichard/homebridge-dingz/issues/9)

## [1.5.0] - 2020-05-30

Version 1.5.0 adds support for dingz Buttons. This is quite a significant change to the plugin so I expect new bugs and issues. There's quite [comprehensive](<(https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons)>) [documentation](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) about how this works in the Wiki so please consult it to leanr more about limitations and caveats.

### Added

- Add support for the dingz Buttons, including [a _stealthy_ "flip-switch" mode](https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons). Please consult the [Wiki](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings) for instructions if you want to use this on a different than the default port.

### Changed

- Added more detail on the [plugin config](https://github.com/johannrichard/homebridge-dingz/wiki/Plugin-settings), the way the [buttons](https://github.com/johannrichard/homebridge-dingz/wiki/dingz-buttons) and the way the [motion sensor](https://github.com/johannrichard/homebridge-dingz/wiki/Motion-sensor) works in the [Wiki](https://github.com/johannrichard/homebridge-dingz/wiki)
- Discovery process stops without polling a discovered device if it has already been added to HomeKit. This reduces unnecessary strain of the devices
- Additional fixes to make the plugin more robust in case of connection issues
- Reduce logging to a more useful amount in case of network issues

## [1.4.3] - 2020-05-24

### Fixed

- Bugfix release for auto-discovery on new-installs

## [1.4.2] - 2020-05-24

This is mostly a maintenance release with no new functionality. It prepares the ground for some upcoming changes related to buttons. It also brings more stability and less stress for the dingz as it combines the polling for the different services into one single call instead of 4-5 different calls.

### Changed

- Reduce device polling during auto-discovery
- Reduce the amount of logging significantly
- Under-the-hood changes for Button callback (manual)
- Add Event Bus for dingz Accessories
- Use undocumented `/api/v1/state` API endpoint, and
- Reduce polling amount by at least a factor of 4, leading to
- Lower dingz front panel temperature

## [1.4.1] - 2020-05-21

### Added

- Support for WiFi LED Strip

## [1.4.0] - 2020-05-21

### Added

- Names of Lightbulbs will follow the naming set in dingz
- Non-dimmable outputs will be created as simple Light Switches

### Fixed

- Fix for blank puck S/N number (Upstream edge-case/glitch/bug/feature in [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS/issues/824). This fixes [#5](https://github.com/johannrichard/homebridge-dingz/issues/5). Thanks [Simon Iannelli](https://twitter.com/simonnelli) for the help with getting to the bottom of this issue!)
- Fix for dingz lamella tilt-angle minima/maxima (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)

## [1.3.1] - 2020-05-19

### Changed

- Add notice about plugin incompatiblity/bug

### Fixed

- Remove log-noise

## [1.3.0] - 2020-05-18

### Added

- Support for WiFi Lightbulb

### Fixed

- Dimmer & Shade fixes (Mismatch between API doc and real-life implementation)

## [1.2.1] - 2020-05-17

**Breaking change**: This release breaks existing configs.

After upgrading to this version, you have to remove the plugin config block from your config, restart Homebridge, add the plugin config again and restart Homebridge once more to apply the fix. Otherwise you will end up with spurious old Lightbulbs in your setup.

### Added

- Support for dingz LightSensor

### Fixed

- Fix for Dimmer index issues (Thanks [Michael Burch](https://twitter.com/derBurch) for reporting/debugging.)
- Small refactorings

## [1.2.0] - 2020-05-17

### Added

- Support for dingz Front LED

### Changed

- Replace popsicle library with axios for better POST handling

### Fixed

- Fixes for myStrom WiFi Lightbulb support

## [1.1.3] - 2020-05-17

### Added

- cb13f9b Exponential decay for accessory config check

### Changed

- 071c7e2 Housekeeping
- 8ebe4e4 Add Changelog

## [1.1.2] - 2020-05-16

### Added

- 48bd118 Add support for a setting to turn off auto-discovery

### Changed

- 75fbabb Update metadata in HomeKit info: use undocumented fields
- 8caf6b4 Update metadata in HomeKit info: use undocumented fields

### Fixed

Fixes for a number of "long-standing" (3 days :-)) bugs

- b414f80 Fix for Dimmer 1 (Input/Output) config. Fixes #2

## [1.1.1] - 2020-05-15

### Added

- First tentative support for the myStrom WiFi Lightbulb

### Changed

- Only discover new devices during the first 10 minutes (Restart Homebridge if you want to rediscover)

### Fixed

- 71a14a5 – Fix plugin ID
- Some fixing and refactoring of the discovery code

## [1.1.0] - 2020-05-15

### Added

- First tentative support for the myStrom WiFi Lightbulb

### Changed

- Only discover new devices during the first 10 minutes (Restart Homebridge if you want to rediscover)

### Fixed

- Some fixing and refactoring of the discovery code

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

The format is based on [Keep a Changelog][keep a changelog] and this project adheres to [Semantic Versioning][semantic versioning].

<!-- Links -->

[keep a changelog]: https://keepachangelog.com/
[semantic versioning]: https://semver.org/

<!-- Versions -->

[unreleased]: https://github.com/johannrichard/homebridge-dingz/compare/v1.6.1...HEAD
[released]: https://github.com/johannrichard/homebridge-dingz/releases
[1.8.0]: https://github.com/johannrichard/homebridge-dingz/compare/v1.7.1..v1.8.0
[1.7.1]: https://github.com/johannrichard/homebridge-dingz/compare/v1.7.0..v1.7.1
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

# Contributing to `hombridge-dingz`

Contributions are welcome. Here's a few housekeeping rules:

- **opiniated repository**: many things happen by convention. This includes commit messages (conventional-commit) and release management (semantic-release), as well as formatting (prettier, eslint and typescript rules). Not to forget that the build and development process is managed with `yarn`.
- **development cycle**: as more people wish to contribute than just myself, I've created a `homebridge-dingz/next` branch. This is the main development branch, successful change integrations will trickle down from here to the `alpha`, `beta` and then `master` branches, triggering the respective semantic release. Submit your PR's against this branch. 
- **testing**: `homebridge` is notoriously difficult to work with with respect to tests. There's little possibility to add automated tests and so there are none. Nevertheless, please test the functionality of the plug-in as good as possible. Ideally, you work on devices and device integrations that you can reasonably test. This includes, but is not limited, to different `dingz` configurations like blinds, lights, buttons and their automations in HomeKit etc. 

I've worked on this plug-in mostly alone for the past few years so please allow me to get used to working with others as the maintainer. It's a new role for me too. ☺️

[Here](https://medium.com/neudesic-innovation/conventional-commits-a-better-way-78d6785c2e08)'s a good article describing the use of conventional commits and semantic-release. This repository aims to adhere to these rules as much as possible. 

And last but not least: please be kind. 

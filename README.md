# mesos-framework-core

This project is a based on two merged projects: https://github.com/tobilg/mesos-framework.git and https://github.com/tobilg/mesos-framework-boilerplate.git.

In zooz we use the framework-core with custom plugins to create all kinds of dc/os services: vault-framework, consul-framework, druid-framework. These plugins will be released under the project name mesos-framework-<module-name>-module.


### Changes from https://github.com/tobilg/mesos-framework.git:

- Save configuration (from upgrade service) in ZooKeeper
- Task version support
- Decline inverse offers
- Dynamic and modular log level
- Check task health on subscribe (optional, defaults to true)
- Amazon availability zone awareness (optional)
- Handle exceptions in offer acceptence
- Leader loss awareness
- Fix an issue with initial start and task count
- Persistent scaling
- More Tests
- Prevent colocation between scheduler and managed tasks (optional)
- Prevent colocation between tasks of the same type (optional)


### Changes from https://github.com/tobilg/mesos-framework-boilerplate.git:


- Support for multiple task definitions (changes all task related variables)
- Authentication Support
- Persistent scale up/down
- Scale leader preservation
- Kill to scale
- Minimum dynamic port
- Colocation prevention
- Health check timeout
- Name background color
- Dynamic and modular log level
- Audit
- Persistent task definitions
- Framework linking (dependent frameworks like vault and consul)
- Internal colocation (prevent multiple tasks on the same node)
- Pending tasks information
- HTTP 400 errors on API call fails
- Authentication exemption on paths (for use by modules)
- Task grouping in tasks page
- Tasks common environment
- Tasks list search
- Disk allocation support
- Framework upgrade support including upgrade service
- Customizable ZK path
- RestartHelper using custom property for health check
- Service unavailable UI overlay
- Task version support and outdated tasks display
- More task information in list and in overview
- Used resources shown using actual resources and not defined ones
- Amazon availability zone awareness (via Mesos agent properties)

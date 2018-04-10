# mesos-framework-boilerplate

Based on https://github.com/tobilg/mesos-framework-boilerplate.git

A boilerplate for developing Mesos frameworks with JavaScript.

Changes:

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

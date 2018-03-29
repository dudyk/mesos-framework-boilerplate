# mesos-framework

Based on https://github.com/tobilg/mesos-framework.git

API abstraction of scheduler and executor AIPs.

### Changes:

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

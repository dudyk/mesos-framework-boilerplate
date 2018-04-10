var config = {
    MESOS_FRAMEWORK_ID: process.env.MESOS_FRAMEWORK_ID,
    MESOS_DIRECTORY: process.env.MESOS_DIRECTORY,
    MESOS_AGENT_ENDPOINT: process.env.MESOS_AGENT_ENDPOINT,
    HOST: process.env.HOST,
    MESOS_SANDBOX: process.env.MESOS_SANDBOX,
    FRAMEWORK_NAME: process.env.FRAMEWORK_NAME,
    PORT0: process.env.PORT0,
    MESOS_EXECUTOR_ID: process.env.MESOS_EXECUTOR_ID
};

module.exports = config;
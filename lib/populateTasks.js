/*jslint
this: true,
es6: true,
node: true
for
*/
"use strict";
var requireEnv = require("require-environment-variables");

var helpers = require("./helpers");
var Mesos = require("./mesos")().getMesos();
var frameworkConfig;

function createContainerInfo(taskTypeId) {
    // The container information object to be used
    var containerInfo = new Mesos.ContainerInfo(
        Mesos.ContainerInfo.Type.DOCKER, // Type
        null, // Volumes
        null, // Hostname
        new Mesos.ContainerInfo.DockerInfo(
            process.env["TASK" + taskTypeId + "_IMAGE"], // Image
            Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
            null,  // PortMappings
            helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_CONTAINER_PRIVILEGED"], false), // Privileged
            process.env["TASK" + taskTypeId + "_CONTAINER_PARAMS"]
                ? JSON.parse(process.env["TASK" + taskTypeId + "_CONTAINER_PARAMS"])
                : null,  // Parameters
            true, // forcePullImage
            null   // Volume Driver
        )
    );
    return containerInfo;
}

function createTaskInfo(taskTypeId) {
    var task = {
        "priority": 1,
        "allowScaling": helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_ALLOW_SCALING"], true),
        "instances": parseInt(process.env["TASK" + taskTypeId + "_NUM_INSTANCES"]),
        "instancesMinimum": process.env["TASK" + taskTypeId + "_MIN_NUM_INSTANCES"] || 1,
        "executorInfo": null, // Can take a Mesos.ExecutorInfo object
        "containerInfo": createContainerInfo(taskTypeId), // Mesos.ContainerInfo object
        "commandInfo": new Mesos.CommandInfo( // Strangely, this is needed, even when specifying ContainerInfo...
            process.env["TASK" + taskTypeId + "_URI"]
                ? new Mesos.CommandInfo.URI(process.env["TASK" + taskTypeId + "_URI"])
                : null, // URI
            new Mesos.Environment(), // Environment
            false, // Is shell?
            null, // Command
            process.env["TASK" + taskTypeId + "_ARGS"]
                ? JSON.parse(process.env["TASK" + taskTypeId + "_ARGS"])
                : null, // Arguments
            null // User
        ),
        "resources": {
            "cpus": parseFloat(process.env["TASK" + taskTypeId + "_CPUS"]),
            "mem": parseInt(process.env["TASK" + taskTypeId + "_MEM"]),
            "ports": process.env["TASK" + taskTypeId + "_PORT_NUM"]
                ? parseInt(process.env["TASK" + taskTypeId + "_PORT_NUM"])
                : 0,
            "disk": process.env["TASK" + taskTypeId + "_DISK_SIZE"]
                ? parseInt(process.env["TASK" + taskTypeId + "_DISK_SIZE"])
                : 0,
            "minimumPort": process.env["TASK" + taskTypeId + "_MINIMUM_PORT"]
                ? parseInt(process.env["TASK" + taskTypeId + "_MINIMUM_PORT"])
                : 0,
            "staticPorts": (process.env["TASK" + taskTypeId + "_FIXED_PORTS"]
                ? JSON.parse("[" + process.env["TASK" + taskTypeId + "_FIXED_PORTS"] + "]")
                : null)
        },
        "healthCheck": process.env["TASK" + taskTypeId + "_HEALTHCHECK"]
            ? new Mesos.HealthCheck(new Mesos.HealthCheck.HTTP(parseInt(process.env["TASK" + taskTypeId + "_HEALTHCHECK_PORT"]),
                    process.env["TASK" + taskTypeId + "_HEALTHCHECK"], 200))
            : null, // Add your health checks here
        "noColocation": helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_NOCOLOCATION"], false),
        "persistent": helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_PERSISTENT"], false),
        "noInnerColocation": helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_NOINNERCOLOCATION"], false),
        "azAware": helpers.checkBooleanString(process.env["TASK" + taskTypeId + "_AZAWARE"], false),
        "labels": null // Add your labels (an array of { "key": "value" } objects)
    };
    if (process.env["TASK" + taskTypeId + "_VERSION"]) {
        task.taskVersion = process.env["TASK" + taskTypeId + "_VERSION"];
    }
    var taskEnv = {};
    var globalEnv = {};
    if (process.env["TASK" + taskTypeId + "_ENV"]) {
        taskEnv = JSON.parse(process.env["TASK" + taskTypeId + "_ENV"]);
    } else if (frameworkConfig && frameworkConfig["TASK" + taskTypeId + "_ENV"]) {
        taskEnv = frameworkConfig["TASK" + taskTypeId + "_ENV"];
    }

    if (process.env.GLOBAL_TASKS_VARS) {
        globalEnv = JSON.parse(process.env.GLOBAL_TASKS_VARS);
    } else if (frameworkConfig && frameworkConfig.GLOBAL_TASKS_VARS) {
        globalEnv = frameworkConfig.GLOBAL_TASKS_VARS;
    }

    Object.keys(taskEnv).forEach(function (key) {
        task.commandInfo.environment.variables.push(new Mesos.Environment.Variable(key, taskEnv[key]));
    });

    Object.keys(globalEnv).forEach(function (key) {
        task.commandInfo.environment.variables.push(new Mesos.Environment.Variable(key, globalEnv[key]));
    });

    return task;
}

function populateTasks(config) {
    // The framework tasks
    var frameworkTasks = {};

    var index;
    var taskName;
    requireEnv(["TASK_DEF_NUM"]);
    var taskCount = parseInt(process.env.TASK_DEF_NUM);
    frameworkConfig = config;
    if (index < 1) {
        throw {message: "Tasks must be defined"};
    }

    for (index = 0; index < taskCount; index += 1) {
        requireEnv([
            "TASK" + index + "_NAME",
            "TASK" + index + "_NUM_INSTANCES",
            "TASK" + index + "_CPUS",
            "TASK" + index + "_MEM",
            "TASK" + index + "_IMAGE"
        ]);
        taskName = process.env["TASK" + index + "_NAME"];
        frameworkTasks[taskName] = createTaskInfo(index, config);
    }
    return frameworkTasks;
}

module.exports = {
    "populateTasks": populateTasks,
    "createTaskInfo": createTaskInfo,
    "createContainerInfo": createContainerInfo
};

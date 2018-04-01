/*jslint
this: true,
es6: true,
node: true
for
*/
"use strict";

// Project modules
let config = require("./config");
let configHelper = require('./configHelper');

// Internal modules
let fs = require("fs");
let path = require("path");
let parse = require("url").parse;
let _ = require("lodash");
let util = require('util');
let request = require('request');
const ENV_VARIABLE_PREFIX = 'env.';
const INFO_PREFIX = 'info.';

let baseApi;
baseApi = {
    getTaskTypesStats: function (tasks, launchedTasks, pendingTasks) {
        let taskTypes = [];
        Object.getOwnPropertyNames(tasks).forEach(function (taskType) {
            let runningInstances = 0;
            let serials = [];
            let leaderSerials = [];

            launchedTasks.forEach(function (launchedTask) {
                let nameParts = launchedTask.name.match(/-[0-9]+$/);
                let serial;
                if (!nameParts) {
                    nameParts = [""];
                } else {
                    serial = parseInt(nameParts[0].substring(1));
                }

                if ((taskType + nameParts[0]) === launchedTask.name && launchedTask.runtimeInfo && !launchedTask.runtimeInfo.doNotRestart) {
                    runningInstances += 1;
                    if (serial) {
                        serials[serial] = true;
                        if (launchedTask.runtimeInfo.leader) {
                            leaderSerials[serial] = true;
                        }
                    }
                }
            });
            let pendingInstances = 0;
            pendingTasks.forEach(function (pendingTask) {
                let nameParts = pendingTask.name.match(/-[0-9]+$/);
                if (!nameParts) {
                    nameParts = [""];
                }

                if ((taskType + nameParts[0]) === pendingTask.name) {
                    pendingInstances += 1;
                    if (nameParts[0].length) {
                        serials[parseInt(nameParts[0].substring(1))] = true;
                    }
                }
            });
            taskTypes.push({
                type: taskType,
                runningInstances: runningInstances,
                pendingInstances: pendingInstances,
                allInstances: runningInstances + pendingInstances,
                serials: serials,
                leaderSerials: leaderSerials,
                instancesMinimum: (tasks[taskType].instancesMinimum || 1),
                allowScaling: tasks[taskType].allowScaling
            });
        });
        return taskTypes;
    },

    auditLog: function (req, message) {
        if (req.user) {
            let displayName;
            if ((typeof req.user) === "string" || req.user instanceof String) {
                try {
                    displayName = JSON.parse(req.user).displayName;
                } catch (error) {
                    req.scheduler.logger.error("The user display name could not be parsed, error: " + error.toString() + " user " + req.user);
                    displayName = req.user;
                }
            } else {
                displayName = req.user.displayName;
            }
            if (!displayName) {
                req.scheduler.logger.error("Display name is undefined, user: " + req.user);
            }
            req.scheduler.logger.debug("Logged in user: " + req.user);
            req.scheduler.logger.info("AUDIT: The user " + displayName + " " + message);
        }
    },

    confirmationCheck: function (req) {
        let params = parse(req.url, true).query;
        if (params && params.sure && params.sure.match(/yes/i)) {
            return true;
        }
        return false;
    },

    statsTypePopulateBase(req, stats, task, typeName, resources) {
        // Populate the base stats of a task per type
        if (stats.byType.hasOwnProperty(typeName)) {
            stats.byType[typeName].instances += 1;
            stats.byType[typeName].cpus += resources.cpus;
            stats.byType[typeName].mem += resources.mem;
            stats.byType[typeName].disk += resources.disk;
            stats.byType[typeName].ports += resources.ports;
        } else {
            stats.byType[typeName] = {
                cpus: resources.cpus,
                mem: resources.mem,
                disk: resources.disk,
                ports: resources.ports,
                instances: 1
            };
            if (req.frameworkConfiguration.healthCheck) {
                stats.byType[typeName].healthyInstances = 0;
                stats.byType[typeName].unhealthyInstances = 0;
            }
            if (task.taskVersion) {
                stats.byType[typeName].updatedInstances = 0;
            }
        }
    },

    getStats: function (req, res) {

        let stats = {
            byType: {},
            overall: {
                cpus: 0,
                mem: 0,
                disk: 0,
                ports: 0,
                instances: 0
            }
        };
        if (req.frameworkConfiguration.healthCheck) {
            stats.overall.healthyInstances = 0;
            stats.overall.unhealthyInstances = 0;
        }

        req.scheduler.launchedTasks.forEach(function (launchedTask) {
            let typeName = launchedTask.name.split(".")[0].replace(/-[0-9]+$/, "");
            let resources;

            // Since we're using task versions, we need to try to get the information as accurate as possible
            // so we're taking it from the runtimeInfo if it's there.
            resources = _.get(launchedTask, "runtimeInfo.resources", launchedTask.resources);

            baseApi.statsTypePopulateBase(req, stats, launchedTask, typeName, resources);

            stats.overall.cpus += resources.cpus;
            stats.overall.mem += resources.mem;
            stats.overall.disk += resources.disk;
            stats.overall.ports += resources.ports;
            stats.overall.instances += 1;

            // Update the health state of the task 
            if (req.frameworkConfiguration.healthCheck && _.get(launchedTask, "runtimeInfo.healthy")) {
                stats.overall.healthyInstances +=1;
                stats.byType[typeName].healthyInstances +=1;
            } else if (req.frameworkConfiguration.healthCheck && _.get(launchedTask, "runtimeInfo.healthy") === false) {
                stats.overall.unhealthyInstances +=1;
                stats.byType[typeName].unhealthyInstances +=1;
            }

            // Indication if a task is updated
            if (launchedTask.taskVersion) {
                if (!stats.byType[typeName].hasOwnProperty("updatedInstances")) {
                    stats.byType[typeName].updatedInstances = 0;
                }
                if (!stats.overall.hasOwnProperty("updatedInstances")) {
                    stats.overall.updatedInstances = 0;
                }
                if (launchedTask.taskVersion === _.get(launchedTask, "runtimeInfo.taskVersion")) {
                    stats.overall.updatedInstances += 1;
                    stats.byType[typeName].updatedInstances += 1;
                }
            }
        });

        res.json(stats);

    },

    restartFramework: function (req, res) {

        if (baseApi.confirmationCheck(req)) {

            baseApi.auditLog(req, "has restarted the scheduler");
            res.json({
                "status": "ok"
            });
            setTimeout(function () {
                process.exit(0);
            }, 1000);
        } else {
            let params = parse(req.url, true).query;
            res.json({
                "error": "sure parameter must be yes, params:" + JSON.stringify(params)
            });
        }

    },

    taskRestart: function (req, res) {
        if (req.params && req.params.task) {
            baseApi.auditLog(req, "has restarted the task: " + req.params.task);
            req.restartHelper.restartTask(req.params.task, false);
            res.json({
                "status": "ok"
            });
        } else {
            res.json({
                "error": "Invalid params: " + JSON.stringify(req.params)
            });
        }
    },

    taskKill: function (req, res) {
        let killResult;
        if (baseApi.confirmationCheck(req) && req.params && req.params.task) {
            baseApi.auditLog(req, "has killed the task: " + req.params.task);
            killResult = req.restartHelper.killTask(req.params.task);
            if (killResult && killResult.result === "OK" && req.scheduler.taskHelper) {
                let taskTypesStats = baseApi.getTaskTypesStats(req.tasks, req.scheduler.launchedTasks, req.scheduler.pendingTasks);

                let taskTypeName = killResult.name.replace(/-[0-9]+$/, "");
                taskTypesStats.forEach(function (taskType) {
                    if (taskType.type === taskTypeName && taskType.allowScaling) {

                        let taskDef = req.tasks[taskTypeName];

                        taskDef.isSubmitted = false;
                        taskDef.name = taskTypeName;
                        taskDef.instances = parseInt(taskType.allInstances);

                        req.scheduler.taskHelper.saveTaskDef(taskDef);
                    }
                });
            }
            res.json(killResult);
        } else {
            res.json({
                "error": "Invalid params: " + JSON.stringify(req.params)
            });
        }
    },

    leaderSortHelper: function (firstTask, secondTask) {
        let firstLeader = 0;
        let secondLeader = 0;
        if (firstTask.runtimeInfo && firstTask.runtimeInfo.leader) {
            firstLeader = 1;
        }
        if (secondTask.runtimeInfo && secondTask.runtimeInfo.leader) {
            secondLeader = 1;
        }
        return secondLeader < firstLeader;
    },

    rollingRestart: function (req, res) {
        function tasksFilter(task) {
            return task.allowScaling;
        }

        if (baseApi.confirmationCheck(req)) {
            baseApi.auditLog(req, "has issued a rolling restart");
            let tasks = req.scheduler.launchedTasks.filter(tasksFilter);

            tasks.sort(baseApi.leaderSortHelper);
            req.restartHelper.rollingRestart(tasks);
            res.json({
                "status": "ok"
            });
        } else {
            let params = parse(req.url, true).query;
            res.json({
                "error": "sure parameter must be yes, params:" + JSON.stringify(params)
            });
        }

    },

    scaleTasks: function (req, res) {

        let taskTypesStats = baseApi.getTaskTypesStats(req.tasks, req.scheduler.launchedTasks, req.scheduler.pendingTasks);

        taskTypesStats.forEach(function (taskType) {

            if (taskType.type === req.params.type && taskType.allowScaling) {

                let taskDef = req.tasks[req.params.type];
                if (req.params.instances === taskType.allInstances) {
                    // No-op
                } else if (req.params.instances > taskType.allInstances) {
                    // Scale up
                    let deltaUp = req.params.instances - taskType.allInstances;
                    baseApi.auditLog(req, "has scaled up the task type: " + req.params.type + " to " + req.params.instances + " instances");

                    let n = 0;
                    let i = 1;
                    // Set defaults
                    taskDef.isSubmitted = false;
                    taskDef.name = req.params.type;
                    taskDef.instances = parseInt(req.params.instances);
                    if (req.scheduler.taskHelper) {
                        req.scheduler.taskHelper.saveTaskDef(taskDef);
                    }
                    let newTask;
                    while (n < deltaUp) {
                        if (!taskType.serials[i]) {
                            newTask = _.cloneDeep(taskDef); // cloneDeep is IMPORTANT!
                            newTask.name += "-" + i.toString(); // Adding task serial
                            req.scheduler.pendingTasks.push(newTask);
                            n += 1;
                        }
                        i += 1;
                    }
                } else if (req.params.instances < taskType.allInstances && req.params.instances >= taskType.instancesMinimum) {
                    // Scale down
                    let deltaDown = taskType.allInstances - req.params.instances;
                    baseApi.auditLog(req, "has scaled down the task type: " + req.params.type + " to " + req.params.instances + " instances");
                    taskDef.name = req.params.type;
                    taskDef.instances = parseInt(req.params.instances);
                    if (req.scheduler.taskHelper) {
                        req.scheduler.taskHelper.saveTaskDef(taskDef);
                    }

                    let taskNames = [];
                    let serialList = Object.keys(taskType.serials);
                    let index = serialList[serialList.length - 1];

                    while (taskNames.length < deltaDown && index >= 0) {
                        if (serialList[index] && !taskType.leaderSerials[serialList[index]]) {
                            taskNames.push(req.params.type + "-" + serialList[index]);
                        }
                        index -= 1;
                    }
                    index = serialList[serialList.length - 1];
                    while (taskNames.length < deltaDown && index >= 0) {
                        if (serialList[index] && taskNames.indexOf(req.params.type + "-" + serialList[index]) === -1) {
                            taskNames.push(req.params.type + "-" + serialList[index]);

                            req.scheduler.logger.info("Killing a leader task: " + taskNames[taskNames.length - 1]);
                        }
                        index -= 1;
                    }
                    req.scheduler.logger.debug("Tasks to kill: " + taskNames.toString());
                    // First, check pending tasks
                    for (index = req.scheduler.pendingTasks.length - 1; index >= 0; --index) { // Removing in LIFO order
                        let pendingTask = req.scheduler.pendingTasks[index];
                        // Check if type fits, and we still need to scale down
                        if (taskNames.indexOf(pendingTask.name) > -1 && deltaDown > 0) {
                            // Remove current array index
                            req.scheduler.pendingTasks.splice(index, 1);
                            // Reduce scale down count
                            deltaDown--;
                            if (deltaDown === 0) {
                                break;
                            }
                        }
                    }
                    // Check if still instances left to scale down, if so, kill tasks
                    if (deltaDown > 0) {
                        while (deltaDown > 0) {
                            for (index = req.scheduler.launchedTasks.length - 1; index >= 0; --index) { // Killing in LIFO order
                                let launchedTask = req.scheduler.launchedTasks[index];
                                if (taskNames.indexOf(launchedTask.name) > -1 && deltaDown > 0) {
                                    // Kill the task
                                    req.scheduler.kill(launchedTask.taskId, launchedTask.runtimeInfo.agentId);
                                    req.scheduler.logger.info("Scale down - killing task ID " + launchedTask.taskId);

                                    launchedTask.runtimeInfo.doNotRestart = true;

                                    deltaDown--;
                                    if (deltaDown === 0) {
                                        break;
                                    }
                                }
                            }
                        }
                    }

                } else {
                    // Error
                }

            }

        });

        res.send();

    },

    getTaskTypes: function (req, res) {

        if (Object.getOwnPropertyNames(req.tasks).length > 0) {
            res.json(baseApi.getTaskTypesStats(req.tasks, req.scheduler.launchedTasks, req.scheduler.pendingTasks));
        } else {
            res.json([]);
        }

    },

    killAllTasks: function (req, res) {

        if (baseApi.confirmationCheck(req)) {
            baseApi.auditLog(req, "has killed all tasks");
            req.scheduler.launchedTasks.forEach(function (task) {
                req.scheduler.kill(task.taskId, task.runtimeInfo.agentId);
            });
            res.json({
                "status": "ok"
            });
        } else {
            let params = parse(req.url, true).query;
            res.json({
                "error": "sure parameter must be yes, params:" + JSON.stringify(params)
            });
        }

    },

    killAllTasksOfType: function (req, res) {

        let params = parse(req.url, true).query;

        if (params && baseApi.confirmationCheck(req) && req.params.type && req.params.type.length) {
            baseApi.auditLog(req, "has killed all tasks of type: " + req.params.type);
            req.scheduler.launchedTasks.forEach(function (task) {
                let typeName = task.name.replace(/-[0-9]+$/, "");
                if (typeName === req.params.type) {
                    req.scheduler.kill(task.taskId, task.runtimeInfo.agentId);
                }
            });
            res.json({
                "status": "ok"
            });
        } else {
            res.json({
                "error": "sure parameter must be yes and type parameter must not be blank, params:" + JSON.stringify(params) + ", req params: " + JSON.stringify(req.params)
            });
        }

    },

    getLogs: function (req, res) {

        let dirname = req.scheduler.logger.transports["dailyRotateFile"].dirname;
        let filename = req.scheduler.logger.transports["dailyRotateFile"].filename;

        let logFile = path.normalize(dirname + "/" + filename);

        fs.createReadStream(logFile, {}).pipe(res);

    },

    setLogLevel: function (req, res) {
        req.scheduler.updateLogModules();

        if (req.params.level && req.params.component) {
            let name;
            let i;
            for (i = 0; i < req.scheduler.logModules.length; i += 1) {
                name = req.scheduler.logModules[i].toString();
                if (name === "[object Object]") {
                    name = req.scheduler.logModules[i].constructor.name;
                }
                if (name === req.params.component) {
                    req.scheduler.logModules[i].logger.transports.dailyRotateFile.level = req.params.level;
                    req.scheduler.logModules[i].logger.transports.console.level = req.params.level;
                }
            }

            res.json({
                "status": "ok"
            });

        } else {
            res.json({
                "error": "Couldn't find log level parameter"
            });
        }
    },

    getLogModules: function (req, res) {
        req.scheduler.updateLogModules();

        let moduleNames = [];
        let modules = [];
        let name;
        let i;
        let entry;

        for (i = 0; i < req.scheduler.logModules.length; i += 1) {
            name = req.scheduler.logModules[i].toString();
            if (name === "[object Object]") {
                name = req.scheduler.logModules[i].constructor.name;
            }
            if (moduleNames.indexOf(name) === -1) {
                entry = {
                    name: name,
                    value: req.scheduler.logModules[i].logger.transports.console.level
                };
                modules.push(entry);
                moduleNames.push(name);
            }
        }

        res.json(modules);
    },

    healthCheck: function (req, res) {
        let diff = new Date().getTime() - req.scheduler.lastHeartbeat;
        let timeout = process.env.HEALTH_TIMEOUT || config.application.healthTimeout;
        if (diff < timeout * 1000) {
            res.send("OK");
        } else {
            res.writeHead(500);
        }
    },

    moduleList: function (req, res) {
        let index;
        let result = "";
        for (index = 0; index < req.frameworkConfiguration.moduleList.length; index += 1) {
            result += req.frameworkConfiguration.moduleList[index] + "\n";
        }
        res.send(result);
    },

    upgradeVersions: function (req, res) {
        let frameworkType = process.env.FRAMEWORK_TYPE;
        let correntVersion = req.frameworkConfiguration.configVersion;

        configHelper.getUpgradeServiceUrl()
            .then(function (upgradeConfigServiceUrl) {
                let options = {
                    url: util.format('%s/params/%s/versions?currentVersion=%s', upgradeConfigServiceUrl, frameworkType, correntVersion),
                    method: 'GET',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }

                request(options, function (err, response, body) {
                    if (err) {
                        console.error('Failed to get relevant upgrade versions', err);
                        res.status(500).json({error: 'Failed to get relevant upgrade versions'});
                        return;
                    } else if (response.statusCode !== 200) {
                        console.error('Got not good response from the upgrade service: ' + response.statusCode, response.body);
                        res.status(500).json({error: 'Got not good response from upgrade service'});
                        return;

                    } else {
                        let availableVersionsResponse = response.body;
                        availableVersionsResponse.forEach(function (versionResponse) {
                            versionResponse.params.forEach(function (param) {

                                // find default value
                                if (param.path.indexOf(ENV_VARIABLE_PREFIX) === 0) {
                                    param.value = process.env[param.path.substring(ENV_VARIABLE_PREFIX.length, param.path.length)]
                                } else if (param.path.indexOf(INFO_PREFIX) === 0) {
                                    param.value = req.frameworkConfiguration[param.path.substring(INFO_PREFIX.length, param.path.length)]
                                }
                            })
                        });
                        res.json(availableVersionsResponse)
                    }
                })
            })


    },

    submitReviewRequest: function (req, res) {
        let frameworkType = process.env.FRAMEWORK_TYPE;
        let frameworkName = process.env.FRAMEWORK_NAME;

        let requestBody = {};
        req.body.params.forEach(function (param) {
            requestBody[param.name] = param.value;
        })

        configHelper.getUpgradeServiceUrl()
            .then(function (upgradeConfigServiceUrl) {
                let options = {
                    url: util.format('%s/review/%s/%s/%s', upgradeConfigServiceUrl, frameworkType, frameworkName, req.body.version),
                    method: 'POST',
                    body: requestBody,
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }

                console.log(options);
                request(options, function (err, response, body) {
                    if (err) {
                        console.error('Failed to review upgrade request', err);
                        res.status(500).json({error: 'Failed to review upgrade request'});
                        return;
                    } else if (response.statusCode !== 200) {
                        console.error('Got not good response from the upgrade service: ' + response.statusCode, response.body);
                        res.status(500).json({error: 'Got not good response from upgrade service'});
                        return;
                    } else {
                        res.json(response.body)
                    }
                })
            })

    },

    upgradeFramework: function (req, res) {

        let frameworkType = process.env.FRAMEWORK_TYPE;
        let frameworkName = process.env.FRAMEWORK_NAME;
        baseApi.auditLog(req,'Got an request to upgrade the framework to new version');
        configHelper.getUpgradeServiceUrl()
            .then(function (upgradeConfigServiceUrl) {
                let options = {
                    url: util.format('%s/upgrade/%s/%s/%s', upgradeConfigServiceUrl, frameworkType, frameworkName, req.body.marathon.env.CONFIG_VERSION),
                    method: 'POST',
                    body: req.body.marathon,
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }

                request(options, function (err, response, body) {
                    if (err) {
                        console.error('Failed to send upgrade request', err);
                        res.status(500).json({error: 'Failed to send upgrade request'});
                        return;
                    } else if (response.statusCode !== 200) {
                        console.error('Got not good response from the upgrade service while trying to upgrade the framework: ' + response.statusCode, response.body);
                        res.status(500).json({error: 'Got not good response from the upgrade service while trying to upgrade the framework'});
                        return;
                    } else {
                        res.json(response.body)
                    }
                });
            })

    }
};


module.exports = baseApi;

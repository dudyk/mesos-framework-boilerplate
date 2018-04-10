"use strict";

var http = require("http");
var path = require("path");
var _ = require('lodash');
var envs = require('./envs');
var winston = require('winston');
var components = [];


module.exports = {

    checkBooleanString: function (string, defaultValue) {
        var result = false;
        if (defaultValue) {
            result = true;
        }
        if (string) {
            string = string.trim();
            string = string.toLowerCase();
        } else {
            return result;
        }
        if (string.length) {
            if (string === "true") {
                result = true;
            } else if (string === "1") {
                result = true;
            } else if (parseFloat(string) !== 0 && !isNaN(string) && !isNaN(parseFloat(string))) { // Checking any numeric value including infinity, excluding zero
                result = true;
            } else {
                result = false;
            }
        }
        return result;
    },
    setRuntimeInfo: function (task, offer, usedPorts) {

        // Set network runtime info from offer and used ports
        if (!task.runtimeInfo) {
            task.runtimeInfo = {};
        }
        task.runtimeInfo.agentId = offer.agent_id.value || null;
        task.runtimeInfo.state = "TASK_STAGING";
        task.runtimeInfo.network = {
            "hostname": offer.hostname,
            "ip": offer.url.address.ip || null,
            "ports": usedPorts
        };
        task.runtimeInfo.resources = task.resources;

        if (task.taskVersion) {
            task.runtimeInfo.taskVersion = task.taskVersion;
        }

    },

    getLogger: function(path, fileName, logLevel, component) {

        var logger = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)({ level: logLevel || "info", timestamp: true }),
                new (require("winston-daily-rotate-file"))({
                    filename: ((path && fileName) ? path + "/" + fileName : "logs/mesos-framework.log"),
                    level: logLevel || "info",
                    prepend: true,
                    json: false
                })
            ]
        });

        if (component) {
            //console.log(new Error("test").stack);
            var name = component.toString();
            if (name === "[object Object]") {
                name = component.constructor.name;
            }

            if (components.indexOf(component) === -1){
                console.log("INFO: Registering for dynamic log as:" + name);
                components.push(component);
            }
        }

        return logger;

    },

    checkColocation: function (task, offer ,locationsMap) {

        // Check colocation between task and framework
        if (task.noColocation && (offer.url.address.ip === envs.HOST || offer.url.address.hostname === envs.HOST)) {
            return true;
        }

        // Check colocation between tasks of the same type
        console.log(task.mesosName);
        if (!task.noInnerColocation) {
            return false;
        }

        if (locationsMap.length === 0 || !locationsMap[task.mesosName]) {
            return false;
        }

        var colocationMap = locationsMap[task.mesosName].filter((taskLocation) => { return offer.url.address.ip === taskLocation});
        console.log("IP information for " + task.mesosName + ": " +  colocationMap.toString());
        if (colocationMap.length > 0) {
            return true;
        }

        return false;
    },

    checkZoneLocation:  function (task, offerAZ, azMap) {

            if (!task.azAware) {
                return true;
            }

            if (!offerAZ) {
                return false;
            }

            if (azMap.length === 0 || !azMap[task.mesosName]) {
                return true;
            }

            var maxCapacity = 1 / _.uniq(azMap[task.mesosName]).length;

            if (maxCapacity === 1 && offerAZ === azMap[task.mesosName][0]) {
                return false;
            }

            if (azMap[task.mesosName].filter(function(x){return x === offerAZ}).length / azMap[task.mesosName].length <= maxCapacity) {
                return true;
            } else {
                return false;
            }
    },

    getLogModules: function() {
        return components;
    },

    cloneDeep: function(obj) {
        return _.cloneDeep(obj);
    },

    sortTasksByPriority: function (tasks) {

        function prioSort(a,b) {
            if (a.priority < b.priority) {
                return -1;
            }
            if (a.priority > b.priority) {
                return 1;
            }
            if (a.name < b.name) {
                return -1;
            }
            return 1;
        }

        var tasksArray = [];

        Object.getOwnPropertyNames(tasks).forEach(function (task) {

            var instances = tasks[task].instances || 1;

            if (tasks[task].resources && tasks[task].resources.staticPorts) {
                tasks[task].resources.staticPorts.sort();
                if (!tasks[task].resources.ports || tasks[task].resources.staticPorts.length > tasks[task].resources.ports) {
                    throw new Error("Static ports must be included in the general port count for the task.");
                }
            }

            // Add to tasks array
            for (var i = 1; i <= instances; i++) {
                // Set defaults
                tasks[task].isSubmitted = false;
                tasks[task].name = task + "-" + i.toString();
                if (!tasks[task].hasOwnProperty("allowScaling")) {
                    tasks[task].allowScaling = false;
                }
                tasksArray.push(_.cloneDeep(tasks[task])); // Important!
            }

        });

        return tasksArray.sort(prioSort);

    },

    compareTaskIds: function (id1, id2) {
        if (id1 === id2) {
            return 0;
        }
        var splitId1 = id1.split(".");
        var splitId2 = id2.split(".");
        var i;
        var diff = 0;
        var length = splitId1.length;
        var suffix1;
        var suffix2;
        if (length > splitId2.length) {
            length = splitId2.length;
        }
        for (i = 0; i < length; i += 1) {
            if (splitId1[i] !== splitId2[i]) {
                if (splitId1[i].match(/-[0-9]+$/) && splitId2[i].match(/-[0-9]+$/)) {
                    if (splitId1[i].replace(/-[0-9]+$/, "") === splitId2[i].replace(/-[0-9]+$/, "")) {
                        suffix1 = parseInt(splitId1[i].match(/[0-9]+$/)[0]);
                        suffix2 = parseInt(splitId2[i].match(/[0-9]+$/)[0]);
                        diff = suffix1 - suffix2;
                    } else if (splitId1[i].replace(/-[0-9]+$/, "") < splitId2[i].replace(/-[0-9]+$/, "")) {
                        diff = -1;
                    } else {
                        diff = 1;
                    }
                    break;
                }
                if (splitId1[i] < splitId2[i]) {
                    diff = -1;
                } else {
                    diff = 1;
                }
            }
        }
        if (!diff) {
            diff = splitId1.length - splitId2.length;
        }
        return diff;
    },

    doRequest: function (payload, callback) {

        var self = this;

        // Add mesos-stream-id to header
        if (self.mesosStreamId) {
            self.requestTemplate.headers["mesos-stream-id"] = self.mesosStreamId;
        }

        var req = http.request(self.requestTemplate, function (res) {

            // Set encoding
            res.setEncoding('utf8');

            // Buffer for the response body
            var body = "";

            res.on('data', function (chunk) {
                body += chunk;
            });

            // Watch for errors of the response
            res.on('error', function (e) {
                callback({ message: "There was a problem with the response: " + e.message }, null);
            });

            res.on('end', function () {
                if (res.statusCode !== 202) {
                    callback({ message: "Request was not accepted properly. Reponse status code was '" + res.statusCode + "'. Body was '" + body + "'." }, null);
                } else {
                    callback(null, { statusCode: res.statusCode, body: body });
                }
            });

        });

        // Watch for errors of the request
        req.on('error', function (e) {
            callback({ message: "There was a problem with the request: " + e.message }, null);
        });

        // Write data to request body
        req.write(JSON.stringify(payload));

        // End request
        req.end();

    },

    doHealthRequest: function (request, successCallback, failCallback, successCodes, bodyFunction, errorSuffix, self) {
        if (!successCodes || successCodes.length < 1) {
            successCodes = [200, 201];
        }
        if (!errorSuffix) {
            errorSuffix = "";
        }
        var req = http.request(request, function (res) {
            if (successCodes.indexOf(res.statusCode) > -1) {

                var value = false;

                if (bodyFunction) {
                    var responseBodyBuilder = '';

                    res.on("data", function (chunk) {
                        responseBodyBuilder += chunk;
                    });

                    res.on("end", function () {
                        value = bodyFunction(responseBodyBuilder);
                        self.logger.debug("Checking the response body: " + value);

                        if (value) {
                            successCallback();
                        } else {
                            failCallback();
                        }

                    });
                } else {
                    successCallback();
                }

            } else {
                failCallback();
            }
            res.resume();
        });
        req.on("error", function (error) {
            self.logger.error("Error checking health:" + JSON.stringify(error) + errorSuffix);
            failCallback();
        });
        req.end();
    },

    stringifyEnums: function (message) {
        message = _.clone(message); // We should not modify the source message in place, it causes issues with repeating calls
        _.forEach(message.$type.children, function(child) {
            var type = _.get(child, 'element.resolvedType', null);
            if (type && type.className === 'Enum' && type.children) {
                var metaValue = _.find(type.children, {
                    id: message[child.name]
                });
                if (metaValue && metaValue.name)
                // Alternatively you can do something like:
                // message[child.name + '_string'] = metaValue.name;
                // To get access to both the raw value and the string.
                message[child.name] = metaValue.name;
            }
        });
        return message;
    },

    stringifyEnumsRecursive: function (message) {
        var self = this;
        var newMessage = self.stringifyEnums(message);
        _.forEach(message, function(subMessage, key) {
            if (_.isObject(subMessage) && subMessage.$type) {
                newMessage[key] = self.stringifyEnumsRecursive(message[key]);
            } else if (_.isArray(subMessage) && subMessage.length > 0) {
                var arrayItems = [];
                var index;
                for (index = 0; index < subMessage.length; index += 1) {
                    if (_.isObject(subMessage[index]) && subMessage[index].$type) {
                        arrayItems.push(self.stringifyEnumsRecursive(subMessage[index]));
                    } else {
                        arrayItems.push(subMessage[index]);
                    }
                }
                newMessage[key] = arrayItems;
            }
        });
        return newMessage;
    },
    isFunction: function(obj) {
        return !!(obj && obj.constructor && obj.call && obj.apply);
    },
    taskCleanup: function (task) {
        // Reset isSubmitted status
        task.isSubmitted = false;
        // Remove old taskId
        delete task.taskId;
        // Remove old runtimeInfo
        delete task.runtimeInfo;
        // Remove old health check (it changes by allocated ports)
        delete task.mesosHealthCheck;
        // Remove mesosName
        delete task.mesosName;
        // Remove previously set HOST and PORTn environment variables
        if (task.commandInfo.environment.variables && task.commandInfo.environment.variables.length > 0) {
            var usableVariables = [];
            // Iterate over all environment variables
            task.commandInfo.environment.variables.forEach(function (variable) {
                // Check if variable name contains either HOST or PORT -> Set by this framework when starting a task
                if (variable.name.match(/^HOST$/g) === null && variable.name.match(/^PORT[0-9]+$/g) === null) {
                    // Add all non-matching (user-defined) environment variables
                    usableVariables.push(variable);
                }
            });
            // Remove old variables
            delete task.commandInfo.environment.variables;
            // Add the user-defined variables again
            task.commandInfo.environment.variables = usableVariables;
        }
        return task;
    }

};

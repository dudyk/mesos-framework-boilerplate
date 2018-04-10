"use strict";

var helpers = require("./helpers");

/**
 * Represents a TaskHealthHelper object
 * @constructor
 * @param {object} scheduler - The scheduler object.
 * @param {object} options - The option map object.
 */
function TaskHealthHelper(scheduler, options) {
    if (!(this instanceof TaskHealthHelper)) {
        return new TaskHealthHelper(scheduler, options);
    }

    var self = this;

    self.scheduler = scheduler;

    self.options = {};
    self.options.interval = options.interval || 30;
    self.options.graceCount = options.graceCount || 4;
    self.options.portIndex = options.portIndex || 0;
    self.options.propertyPrefix = options.propertyPrefix || "";
    self.options.errorEvent = options.errorEvent || self.options.propertyPrefix + "task_unhealthy";
    self.options.additionalProperties = options.additionalProperties || [];
    self.options.taskNameFilter = options.taskNameFilter || null;
    self.options.statusCodes = options.statusCodes || [200];
    self.options.checkBodyFunction = options.checkBodyFunction || null;
    self.options.logFirstFail = options.logFirstFail || false;
    self.options.checkOnSubscribe = options.hasOwnProperty("checkOnSubscribe")
        ? options.checkOnSubscribe
        : true;

    if (self.options.checkOnSubscribe) {
        scheduler.on("subscribe", function () {
            if (self.interval) {
                self.checkRunningInstances();
            }
        });
    }
    self.logger = options.logger || helpers.getLogger((options.logging && options.logging.path ? options.logging.path : null), (options.logging && options.logging.fileName ? options.logging.fileName : null), (options.logging && options.logging.level ? options.logging.level : null), self);
    if (options.url) {
        self.options.url = options.url;
    } else {
        throw new Error("Must set URL");
    }

    self.healthRequestCreate = function (host, port) {
        return {
            "host": host,
            "port": port,
            "path": options.url,
            "method": "GET",
            headers: {}
        };
    };

    self.checkRunningInstances = function () {

        self.logger.debug("Running periodic healthcheck" + (self.options.propertyPrefix.length ? ", prefix: " + self.options.propertyPrefix : ""));

        self.scheduler.launchedTasks.forEach(function (task) {
            self.checkInstance.call(self, task);
        });
    };
}

TaskHealthHelper.prototype.toString = function () {
    var name = "HealthHelper";
    if (this.options.propertyPrefix) {
        name += " prefix: " + this.options.propertyPrefix;
    }
    if (this.options.taskNameFilter) {
        name += " filter: " + this.options.taskNameFilter.replace(/-\[0-9\]\+?\$/g, "").replace(/\^/g, "");
    }
    return name;
};

TaskHealthHelper.prototype.taskFilter = function (name) {
    var self = this;
    if (self.options.taskNameFilter) {
        return name.match(self.options.taskNameFilter) !== null;
    }
    return true;
};

TaskHealthHelper.prototype.setCheckFailed = function (task) {

    var self = this;

    if (task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] === undefined) {
        task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] = 0;
    }
    task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] += 1;
    if (task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] === self.options.graceCount) {
        self.logger.debug("Task marked unhealthy" + (self.options.propertyPrefix.length
            ? ", prefix: " + self.options.propertyPrefix
            : ""));
        if (self.options.logFirstFail && task.runtimeInfo[self.options.propertyPrefix + "healthy"] === true) {
            self.logger.info("Healthy task became unhealthy" + (self.options.propertyPrefix.length
                ? ", prefix: " + self.options.propertyPrefix
                : "") + "id: " + task.taskId);
        }
        task.runtimeInfo[self.options.propertyPrefix + "healthy"] = false;
        self.setProperties(task, false);
        self.scheduler.emit(self.options.errorEvent, task);
    } else if (task.runtimeInfo[self.options.propertyPrefix + "healthy"] === false) {
        self.scheduler.emit(self.options.errorEvent, task);
    }
};


TaskHealthHelper.prototype.checkInstance = function (task) {

    var self = this;

    function bodyFunctionCall (body) {
        var value = false;
        value = self.options.checkBodyFunction.call(self, task, body);
        self.logger.debug("Checking the response body: " + value);
        return value;
    }

    if (task.runtimeInfo && task.runtimeInfo.state === "TASK_RUNNING" && self.taskFilter(task.name)) {
        if (task.runtimeInfo.network && task.runtimeInfo.network.hostname && task.runtimeInfo.network.ports && task.runtimeInfo.network.ports[self.options.portIndex]) {
            self.logger.debug("Checking health of: " + task.name);
            helpers.doHealthRequest(self.healthRequestCreate(task.runtimeInfo.network.hostname, task.runtimeInfo.network.ports[self.options.portIndex]), function () {
                task.runtimeInfo[self.options.propertyPrefix + "checkFailCount"] = 0;
                task.runtimeInfo[self.options.propertyPrefix + "healthy"] = true;
                self.setProperties(task, true);
            }, function () {
                self.setCheckFailed.call(self, task);
            }, self.options.statusCodes, self.options.checkBodyFunction
                ? bodyFunctionCall
                : null, (self.options.propertyPrefix.length
                ? ", prefix: " + self.options.propertyPrefix
                : ""), self);
        }
    }
};

TaskHealthHelper.prototype.setProperties = function (task, value) {
    var self = this;
    self.options.additionalProperties.forEach(function (property) {
        //self.logger.debug("Setting " + property.name + " to " + value);

        // If healthy or setting unhealthy
        if (value || property.setUnhealthy) {
            var propertyValue = value;
            if (property.inverse) {
                propertyValue = !value;
            }
            task.runtimeInfo[property.name] = propertyValue;
        }
    });
};

TaskHealthHelper.prototype.stopHealthCheck = function () {
    var self = this;

    if (self.interval) {
        clearInterval(self.interval);
        self.interval = null;
    }
}

TaskHealthHelper.prototype.setupHealthCheck = function () {
    var self = this;

    self.stopHealthCheck();
    self.interval = setInterval(self.checkRunningInstances, self.options.interval * 1000);
};

module.exports = TaskHealthHelper;

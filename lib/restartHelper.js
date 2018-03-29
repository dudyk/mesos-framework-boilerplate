"use strict";

let helpers = require("./helpers").getMesosModule().helpers;

/**
 * restartHelper object
 * @constructor
 * @param {object} scheduler - The scheduler object.
 * @param {object} options - An options object (timeout, customHealthProperties)
 */
function RestartHelper(scheduler, options) {

    if (!(this instanceof RestartHelper)) {
        return new RestartHelper(scheduler);
    }

    let self = this;

    options = options || {};

    self.scheduler = scheduler;
    self.logger = options.logger || helpers.getLogger((options.logging && options.logging.path ? options.logging.path : null), (options.logging && options.logging.fileName ? options.logging.fileName : null), (options.logging && options.logging.level ? options.logging.level : null), self);
    self.timeout = options.timeout || 10000;
    self.useHealthCheck = options.useHealthCheck || false;
    if (self.useHealthCheck && options.customHealthProperties) {
        self.customHealthProperties = options.customHealthProperties;
    } else if (self.useHealthCheck) {
        throw {message: "Must set filter and property name to use HealthCheck"};
    }
}

RestartHelper.prototype.setHealthCheck = function (customHealthProperty) {
    let self = this;
    if (!self.useHealthCheck || !self.customHealthProperties) {
        self.useHealthCheck = true;
        self.customHealthProperties = [];
    }

    self.customHealthProperties.push(customHealthProperty);
};

RestartHelper.prototype.isTaskRunning = function (task) {
    let self = this;
    let running = false;
    if (self.scheduler.pendingTasks.indexOf(task) === -1 &&
        task.runtimeInfo && task.runtimeInfo.state === "TASK_RUNNING") {
        if (!self.useHealthCheck) {
            return true;
        }
        self.customHealthProperties.forEach(function (healthProperty) {
            if (!running && task.name.match(healthProperty.filter) &&
                task.runtimeInfo[healthProperty.name]) {

                running = true;
            }
        });
    }
    return running;
};


function findTaskByID(taskId, tasks) {
    // Iterate over tasks
    for (let index = 0; index < tasks.length; index++) {
        let task = tasks[index];
        if (task.taskId === taskId) {
            return task;
        }
    }
    return null;
}

function findTaskByType(typeToSearch, tasks) {
    // Iterate over tasks
    for (let index = 0; index < tasks.length; index++) {
        let task = tasks[index];
        let typeName = task.name.replace(/-[0-9]+$/, "");
        if (typeName === typeToSearch) {
            return task;
        }
    }
    return null;
}

RestartHelper.prototype.killTask = function (taskId) {
    let self = this;

    let taskLaunchedFound = findTaskByID(taskId, self.scheduler.launchedTasks);

    if (!taskLaunchedFound) {
        self.logger.error("Can't restart task that is not running.");
        return {error: "Can't restart task that is not running."};
    }
    if (taskLaunchedFound.allowScaling) {
        taskLaunchedFound.runtimeInfo.doNotRestart = true;
        self.logger.debug("Killing " + taskId + " " + taskLaunchedFound.runtimeInfo.agentId);
        self.scheduler.kill(taskId, taskLaunchedFound.runtimeInfo.agentId);
        return {
            result: "OK",
            name: taskLaunchedFound.name
        };
    }
    return {
        error: "Task not scaleable"
    };
};

RestartHelper.prototype.restartTask = function (taskId, isRolling) {
    let self = this;

    let taskLaunchedFound = findTaskByID(taskId, self.scheduler.launchedTasks);

    if (!taskLaunchedFound) {
        self.logger.debug("Can't restart task that is not running.");
        return;
    }

    let taskDefFound = findTaskByType(taskLaunchedFound.name.replace(/-[0-9]+$/, ""), self.scheduler.tasks);

    if (!taskDefFound) {
        self.logger.debug("Can't restart task that is not found." + JSON.stringify(self.scheduler.tasks));
    } else {
        let agentId = taskLaunchedFound.runtimeInfo.agentId;
        taskLaunchedFound.runtimeInfo.doNotRestart = true;
        if (self.scheduler.taskHelper) {
            self.scheduler.taskHelper.saveTask(taskLaunchedFound);
        }
        let taskToStart = helpers.cloneDeep(taskDefFound);
        taskToStart.name = taskLaunchedFound.name;
        taskToStart = helpers.taskCleanup(taskToStart);
        self.logger.debug("Restart task by putting it in the pendingTasks array " + taskToStart.name);
        self.scheduler.pendingTasks.push(taskToStart);

        self.scheduler.on("task_launched", function (task) {
            if (task !== taskToStart) {
                self.logger.debug("Not our task started id: " + task.taskId + " our task name: " + taskToStart.name);
                return;
            }
            let interval = setInterval(function () {
                let clonedIsRunning = false;
                clonedIsRunning = self.isTaskRunning(taskToStart);

                if (clonedIsRunning) {
                    self.logger.debug("Cloned task is running " + taskToStart.name);
                    // kill the task only after the cloned is running
                    self.logger.debug("Killing " + taskId + " " + agentId);
                    self.scheduler.kill(taskId, agentId);
                    if (isRolling) {
                        self.logger.debug("Rolling restart sent");
                        self.scheduler.emit("rollingrestart");
                    } else {
                        self.scheduler.emit("task_restarted", taskToStart);
                        self.logger.debug("Individual Task killed");
                    }

                    clearInterval(interval);
                }
            }, 1000);

            setTimeout(function () {
                clearInterval(interval);
            }, self.timeout)
        });
    }
};

RestartHelper.prototype.rollingRestart = function (tasksToRestart) {
    let self = this;

    let tasks = tasksToRestart.slice(0);

    function rollingRestartHandler() {
        if (tasks.length > 0) {
            let task = tasks.splice(0, 1);
            self.restartTask(task[0].taskId, true);
        } else {
            self.scheduler.emit("endrollingrestart");
        }
    }
    self.scheduler.removeListener("rollingrestart", rollingRestartHandler);
    self.scheduler.on("rollingrestart", rollingRestartHandler);

    self.scheduler.logger.debug("Start rolling restart - send event");
    self.scheduler.emit("rollingrestart");
};

module.exports = RestartHelper;

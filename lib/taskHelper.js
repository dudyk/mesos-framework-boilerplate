"use strict";

var Mesos = require("./mesos")().getMesos();
var helpers = require("./helpers");

var each = require("async").each;
var eachSeries = require("async").eachSeries;
var zookeeper = require("node-zookeeper-client");

/**
* Represents a TaskHelper object
* @constructor
* @param {object} scheduler - The scheduler object.
*/
function TaskHelper(scheduler, options) {
    if (!(this instanceof TaskHelper)) {
        return new TaskHelper(scheduler, options);
    }
    var self = this;
    self.zkClient = scheduler.zkClient;
    self.scheduler = scheduler;
    self.logger = helpers.getLogger((options.logging && options.logging.path ? options.logging.path : null), (options.logging && options.logging.fileName ? options.logging.fileName : null), (options.logging && options.logging.level ? options.logging.level : null), self);
    self.zkServicePath = self.scheduler.zkServicePath;
}

/**
* Load the task nodes belonging to the framework from ZooKeeper.
*/
TaskHelper.prototype.loadTasks = function() {
    var self = this;
    self.zkClient.getChildren(self.zkServicePath + "/tasks", function (error, children, stat) {
        if (error) {
            self.logger.error("Could not load task information.");
            // We're ready to subscribe
            self.scheduler.emit("ready");
        } else if (children && children.length) {
            var loadedTaskNames = [];
            var loadedTasks = [];
            eachSeries(children.sort(helpers.compareTaskIds), function (child, cb) {
                self.zkClient.getData(self.zkServicePath + "/tasks/" + child, function (error, data, stat) {
                    if (error || !data) {
                        self.logger.error("Could not load task information for " + child);
                        if (!error) {
                            self.deleteTask(child);
                        }
                        cb(null);
                        return;
                    }
                    var pending = self.scheduler.pendingTasks;
                    self.scheduler.pendingTasks = [];
                    var pendingNum = pending.length;
                    var task = JSON.parse(data.toString());
                    self.logger.debug("Loading task: " + JSON.stringify(task));
                    // Load to locationsMap
                    if (task.noInnerColocation) {
                        self.scheduler.addLocationsMap(task);
                    }

                    if (task.azAware) {
                        self.scheduler.addAzMap(task);
                    }

                    var found = false;
                    var i = 0;
                    var pendingTask;
                    function addVars(variable) {
                        // Check if variable name is either HOST or PORT# -> Set by this framework when starting a task - copy it to the loaded task
                        if (variable.name.match(/^HOST$/) !== null || variable.name.match(/^PORT[0-9]+/) !== null) {
                            // Add all matching (non-user-defined) environment variables
                            pendingTask.commandInfo.environment.variables.push(variable);
                        }
                    }
                    function loadTask(remove) {
                        if (task.runtimeInfo && task.runtimeInfo.agentId && (task.runtimeInfo.state === "TASK_RUNNING" || task.runtimeInfo.state === "TASK_STAGING")) {
                            pendingTask.runtimeInfo = task.runtimeInfo;
                            pendingTask.taskId = task.taskId;
                            if (task.mesosName) {
                                pendingTask.mesosName = task.mesosName;
                            }
                            pendingTask.isSubmitted = true;
                            if (task.commandInfo && task.commandInfo.environment && task.commandInfo.environment.variables && task.commandInfo.environment.variables.length > 0) {
                                if (!pendingTask.commandInfo) {
                                    pendingTask.commandInfo = new Mesos.CommandInfo(
                                        null, // URI
                                        new Mesos.Environment([]), // Environment
                                        false, // Is shell?
                                        null, // Command
                                        null, // Arguments
                                        null // User
                                    );
                                }
                                if (!pendingTask.commandInfo.environment) {
                                    pendingTask.commandInfo.environment = new Mesos.Environment([]);
                                }
                                // Iterate over all environment variables
                                task.commandInfo.environment.variables.forEach(addVars);
                            }
                            self.scheduler.launchedTasks.push(pendingTask);
                            if (remove) {
                                pending.splice(i, 1);
                            }
                            self.scheduler.reconcileTasks.push(pendingTask);
                            loadedTasks.push(pendingTask);
                            return true;
                        }
                        self.deleteTask(task.taskId);
                        return false;
                    }
                    for (i = 0; i < pendingNum; i += 1) {
                        pendingTask = pending[i];
                        self.logger.debug("Pending task: \"" + JSON.stringify(pendingTask) + "\"");
                        if (pendingTask.name === task.name) {
                            if (loadTask(true)) {
                                loadedTaskNames.push(task.name);
                            }
                            found = true;
                            break;
                        }
                    }
                    if (!found && loadedTaskNames.indexOf(task.name) === -1) {  // Avoid duplicate tasks loaded
                        for (i = 0; i < pendingNum; i += 1) {
                            pendingTask = pending[i];
                            self.logger.debug("Pending task: \"" + JSON.stringify(pendingTask) + "\"");
                            // Fuzzy loading
                            if (pendingTask.name.replace(/-[0-9]+$/, "") === task.name.replace(/-[0-9]+$/, "")) {
                                pendingTask.name = task.name;
                                if (loadTask(true)) {
                                    loadedTaskNames.push(task.name);
                                }
                                found = true;
                                break;
                            }
                        }
                    } else if (!found) { // Duplicate
                        for (i = 0; i < loadedTasks.length; i += 1) {
                            pendingTask = loadedTasks[i];
                            self.logger.debug("Pending task: \"" + JSON.stringify(pendingTask) + "\"");
                            // Load duplicates
                            if (pendingTask.name === task.name) {
                                pendingTask = helpers.cloneDeep(pendingTask);
                                loadTask(false);
                                found = true;
                                break;
                            }
                        }
                    }

                    if (task.persistent) {
                        self.logger.debug("task" + task.name + " is persistent");
                        self.scheduler.launchedTasks.push(task);
                    }

                    if (!found && !task.persistent) {
                        self.logger.info("Setting task ID " + task.taskId + " to be killed");
                        self.scheduler.killTasks.push(task);
                    }
                    self.scheduler.pendingTasks = pending;
                    cb(null);
                });
            }, function (error) {
                if (error) {
                    self.scheduler.emit(error);
                } else {
                    // We're ready to subscribe
                    self.scheduler.emit("ready");
                }
            });
        } else {
            // We're ready to subscribe - no tasks
            self.scheduler.emit("ready");
        }
    });
};

TaskHelper.prototype.loadTaskDefs = function (tasks) {
    var self = this;
    // Add tasks if there are any
    if (tasks) {
        self.zkClient.getChildren(self.zkServicePath + "/taskDefs", function (error, children, stat) {
            if (error) {
                self.logger.error("Could not load task definition information.");
            } else if (children && children.length) {
                each(children, function (child, cb) {
                    self.logger.debug("Loading task definition: " + child);
                    if (tasks.hasOwnProperty(child)) {
                        self.zkClient.getData(self.zkServicePath + "/taskDefs/" + child, function (error, data, stat) {
                            if (error) {
                                self.logger.error("Failed loading task: " + child + " Error: " + error.toString());
                                cb(error);
                                return;
                            }
                            var taskDef = JSON.parse(data.toString());

                            if (taskDef.hasOwnProperty("instances")) {
                                tasks[child].instances = taskDef.instances;
                            }
                            self.logger.debug("Loaded task definition " + taskDef.name);
                            cb(null);
                        });
                    } else {
                        cb(null);
                    }
                }, function () {
                    self.logger.debug("Task defs: " + JSON.stringify(tasks));
                    self.scheduler.populateTaskArrays(tasks);
                });
                return;
            }
            self.logger.debug("Task were not loaded");
            self.scheduler.populateTaskArrays(tasks);
        });
    }
};

TaskHelper.prototype.saveTaskDef = function (taskDef) {
    var self = this;
    var data = new Buffer(JSON.stringify({"name": taskDef.name, "instances": taskDef.instances}));
    // Seperating path creation from data save due to various client bugs.
    self.zkClient.mkdirp(self.zkServicePath + "/taskDefs/" + taskDef.name, function (error, stat) {
        if (error && error.getCode() !== zookeeper.Exception.NODE_EXISTS) {

            self.logger.error("Got error when creating task definition node in ZK " + taskDef.name + " data: " + error);
            return;
        }
        self.zkClient.setData(self.zkServicePath + "/taskDefs/" + taskDef.name, data, function (error, stat) {
            if (error) {
                self.logger.error("Got error when saving task definition " + taskDef.name + " data: " + error);
                return;
            }
            self.logger.debug("Saved task definition " + taskDef.name);
        });
    });
};

/**
* Save task nodes from ZooKeeper.
* @param {object} task - The task object which should be persisted to ZooKeeper.
*/
TaskHelper.prototype.saveTask = function (task) {
    var self = this;
    var data = new Buffer(JSON.stringify(task));
    // Seperating path creation from data save due to various client bugs.
    self.zkClient.mkdirp(self.zkServicePath+"/tasks/" + task.taskId, function (error, stat){
        if (error) {
            self.logger.error("Got error when creating task node in ZK " + task.name + " ID " + task.taskId + " data: " + error);
            return;
        }
        self.zkClient.setData(self.zkServicePath+"/tasks/" + task.taskId, data, function (error, stat) {
            if (error) {
                self.logger.error("Got error when saving task " + task.name + " ID " + task.taskId + " data: " + error);
                return;
            }
            self.logger.debug("Saved task " + task.name + " ID " + task.taskId);
        });
    });
};

/**
* Delete task nodes from ZooKeeper.
* @param {string} taskId - The id of the task which should be deleted from ZooKeeper.
*/
TaskHelper.prototype.deleteTask = function (taskId) {
    var self = this;
    self.zkClient.remove(self.zkServicePath + "/tasks/" + taskId, function (error) {
        if (error && error.getCode() !== zookeeper.Exception.NO_NODE) {
            self.logger.error("Error deleting task ID " + taskId + " from zookeeper");
        } else {
            self.logger.debug("Deleted task " + taskId + " from zookeeper");
        }
    });
};

module.exports = TaskHelper;

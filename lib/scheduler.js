"use strict";

var http = require("http");
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var uuid = require("uuid");

var helpers = require("./helpers");
var schedulerHandlers = require("./schedulerHandlers");
var mesos = require("./mesos")().getMesos();
var TaskHelper = require("./taskHelper");
var optionsHelper = require("./optionsHelper");
var envs = require('./envs');

var zookeeper = require("node-zookeeper-client");


/**
* Represents a Mesos framework scheduler.
* @constructor
* @param {object} options - The option map object.
*/
function Scheduler(options) {

    if (!(this instanceof Scheduler)) {
        return new Scheduler(options);
    }

    // Inherit from EventEmitter
    EventEmitter.call(this);

    var self = this;

    self.options = {};
    self.options.frameworkName = (options.frameworkName ? options.frameworkName.replace(/\ /g, "-") : "mesos-framework." + uuid.v4());

    // ZooKeeper
    self.options.useZk = options.useZk || false;
    self.options.zkUrl = options.zkUrl || "master.mesos:2181";
    self.options.zkPrefix = options.zkPrefix || "/dcos-service-";
    self.options.configVersion = options.configVersion;
    if (options.configVersion) {
        self.options.optionsHandler = options.optionsHandler;
    }

    // "Globals"
    self.frameworkId = null;
    self.mesosStreamId = null;
    self.lastHeartbeat = null;
    self.zkClient = null;
    // Map for colocation checks
    self.locationsMap = {};
    // Map for availability zones check (aws)
    self.azMap = {};

    // Logging
    self.logger = helpers.getLogger((options.logging && options.logging.path ? options.logging.path : null), (options.logging && options.logging.fileName ? options.logging.fileName : null), (options.logging && options.logging.level ? options.logging.level : null), self);

    self.logModules = helpers.getLogModules();

    // Handling of ZooKeeper-related stuff
    if (self.options.useZk) {
        self.initUsingZk(options);
    } else {
        self.initOptions(options);
        // Add tasks if there are any
        if (options.hasOwnProperty("tasks")) {
            self.populateTaskArrays(options.tasks);
        }

        // Timeout to let init finish
        setTimeout(function () {
            self.emit("ready");
        }, 100);
    }

}

// Inhertit from EventEmitter
util.inherits(Scheduler, EventEmitter);


Scheduler.prototype.initUsingZk = function (options) {
    let self = this;
    self.logger.debug("Using ZooKeeper for persistency. Connection is " + self.options.zkUrl);

    // Set default path for the service
    self.zkServicePath = self.options.zkPrefix + self.options.frameworkName;

    // Create ZK client (getting from options is only to be used for unit tests!)
    self.zkClient = options.zkClient || zookeeper.createClient(self.options.zkUrl);

    // Instantiate TaskHelper (getting from options is only to be used for unit tests!)
    self.taskHelper = options.taskHelper || new TaskHelper(self, {
        "logging": {
            "path": envs.MESOS_SANDBOX + "/logs/",
            "fileName": envs.FRAMEWORK_NAME + ".log",
            "level": options.logging.level
        }
    });

    // For unit tests
    if (options.taskHelper) {
        self.taskHelper.scheduler = self;
    }

    // Set path for the framework id
    var zkPath = self.zkServicePath + "/framework-id";

    self.zkClient.on("error", function (error) {
        self.logger.error(error);
    });

    // Once connected, check if path exists
    self.zkClient.once("connected", function () {

        self.logger.debug("Connected to ZooKeeper on " + self.options.zkUrl);

        // Check if path with framework id exists
        self.zkClient.getData(zkPath, null, function (error, data, stat) {

            if (error) {
                self.handleZkError(error, options, zkPath);

            } else if (data) {
                self.logger.debug("Got framework ID from ZooKeeper:" + data.toString());
                // Set framework id to existing one from ZooKeeper
                self.frameworkId = data.toString();

                self.on("options_loaded", function (options) {
                    self.logger.debug("Options loaded event");
                    if (self.options.optionsHandler && typeof(self.options.optionsHandler) === "function") {
                        self.logger.debug("Options loaded event - using callback");
                        self.options.optionsHandler(options, function () {
                            self.initOptions(options);
                            // Load tasks from ZooKeeper
                            if (options.hasOwnProperty("tasks")) {
                                self.taskHelper.loadTaskDefs(options.tasks);
                            }
                            setImmediate(function () {
                                optionsHelper.saveOptions.call(self, options);
                            });
                        });
                    } else {
                        self.logger.debug("Options loaded event - not using callback");
                        self.initOptions(options);
                        // Load tasks from ZooKeeper
                        if (options.hasOwnProperty("tasks")) {
                            self.taskHelper.loadTaskDefs(options.tasks);
                        }
                        setImmediate(function () {
                            optionsHelper.saveOptions.call(self, options);
                        });
                    }
                });

                optionsHelper.loadOptions.call(self, options);
            }

        });

    });

    // Connect to ZooKeeper
    self.zkClient.connect();
}

Scheduler.prototype.initOptions = function (options) {
    var self = this;

    self.options.user = options.user || "root";
    self.options.restartStates = options.restartStates || ["TASK_FAILED", "TASK_LOST", "TASK_ERROR"]; // Task in TASK_FINISHED will NOT be restarted by default!
    self.options.frameworkFailoverTimeout = options.frameworkFailoverTimeout || 604800; // One week
    self.options.masterConnectionTimeout = options.masterConnectionTimeout * 1000 || 30000; // Half a minute
    self.options.exponentialBackoffFactor = options.exponentialBackoffFactor || 1.5;
    self.options.exponentialBackoffMinimum = options.exponentialBackoffMinimum * 1000 || 1000; // One second
    self.options.exponentialBackoffMaximum = options.exponentialBackoffMaximum * 1000 || 15000; // 15 seconds
    self.options.killUnknownTasks = options.killUnknownTasks || false;
    self.options.serialNumberedTasks = (options.serialNumberedTasks === false) ? false : true;

    self.locationsMap = {};

    self.subscribeBackoffTime = 0;

    // Port allocation
    self.options.staticPorts = options.staticPorts || false;

    if (self.options.staticPorts) {
        self.logger.info("Scheduler configured with fixed ports");
    }

    // Master discovery
    self.options.masterUrl = options.masterUrl || "127.0.0.1";
    self.options.port = parseInt(options.port) || 5050;

    // Tasks
    self.tasks = [];

    self.pendingTasks = [];
    self.launchedTasks = [];
    self.reconcileTasks = [];
    self.killTasks = [];

    // Runtime info
    self.runtimeInfo = {};

    // Template for issuing Mesos Scheduler HTTP API requests
    self.requestTemplate = {};

    self.generateRequestTemplate = function () {
        self.requestTemplate = {
            host: self.options.masterUrl,
            port: self.options.port,
            path: "/api/v1/scheduler",
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            }
        };
    };

    // Fill the requestTemplate
    self.generateRequestTemplate();

    // Customer event handlers will be registered here
    self.customEventHandlers = {};

    // List of allowed event handler function names and their argument length
    var allowedEventHandlers = {
        "SUBSCRIBED": 1,
        "OFFERS": 1,
        "RESCIND": 1,
        "UPDATE": 1,
        "MESSAGE": 1,
        "FAILURE": 1,
        "ERROR": 1,
        "HEARTBEAT": 1
    };

    // Add custom event handlers if present
    if (options.handlers && Object.getOwnPropertyNames(options.handlers).length > 0) {
        Object.getOwnPropertyNames(options.handlers).forEach(function (handlerName) {
            var ucHandlerName = handlerName.toUpperCase();
            // Check if name is allowed, is a function and the length of the function arguments fit to the ones defined in allowedEventHandlers
            if (Object.getOwnPropertyNames(allowedEventHandlers).indexOf(ucHandlerName) > -1 && helpers.isFunction(options.handlers[handlerName]) && options.handlers[handlerName].length === allowedEventHandlers[ucHandlerName]) {
                self.customEventHandlers[ucHandlerName] = options.handlers[handlerName];
            }
        });
    }

    // Fill runtimeInfo from given Tasks
    if (options.tasks && Object.getOwnPropertyNames(options.tasks).length > 0) {
        var tempPriority = 1;
        Object.getOwnPropertyNames(options.tasks).forEach(function (task) {
            // Populate runtimeInfo for each task
            self.runtimeInfo[task] = {
                "desiredInstances": options.tasks[task].instances || 1,
                "requestedInstances": 0,
                "runningInstances": {},
                "priority": options.tasks[task].priority || tempPriority
            };
            // Increase priority
            tempPriority++;
        });
    }

    // Store the long-running request
    self.httpRequest = {};
};

Scheduler.prototype.populateTaskArrays = function (tasks) {

    var self = this;

    if (tasks) {
        self.tasks = helpers.sortTasksByPriority(tasks);

        self.logger.debug(JSON.stringify(self.tasks));

        // Add to pending tasks if not yet submitted
        self.tasks.forEach(function (task) {
            if (!task.isSubmitted) {
                self.pendingTasks.push(task);
            }
        });
        if (self.options.useZk) {
            self.taskHelper.loadTasks();
        }
    }
};

Scheduler.prototype.updateLogModules = function () {
    var self = this;

    self.logModules = helpers.getLogModules();
}

/**
* The handler funciton for the incoming Mesos master events for this framework.
* @param {object} eventData - The data object for an incoming event. Contains the event details (type etc.).
*/
Scheduler.prototype.handleEvent = function (eventData) {

    var self = this;

    try {

        var event = JSON.parse(eventData);

        // Determine event handler, use custom one if it exists
        if (self.customEventHandlers[event.type]) {
            // Call custom handler
            self.customEventHandlers[event.type].call(self, event[event.type.toLocaleLowerCase()]);
        } else {
            // Call default handler
            schedulerHandlers[event.type].call(self, event[event.type.toLocaleLowerCase()]);
        }

        // Emit events per type
        if (event.type === "SUBSCRIBED") {
            // Set frameworkId
            self.frameworkId = event[event.type.toLocaleLowerCase()].framework_id.value;
            // Since some subscribe errors return sucess (failover, for example), set backoff to minimum and not 0.
            self.subscribeBackoffTime = self.options.exponentialBackoffMinimum;
            // Emit with usable object details
            self.emit("subscribed", {
                frameworkId: event[event.type.toLocaleLowerCase()].framework_id.value,
                mesosStreamId: self.mesosStreamId
            });
        } else if (event.type === "HEARTBEAT") {
            // Set lastHeartbeat timestamp
            self.lastHeartbeat = new Date().getTime();
            // Emit with current timestamp
            self.emit(event.type.toLocaleLowerCase(), self.lastHeartbeat);
        } else if (event.type === "MESSAGE") {
            // Emit with usable message object (parsed to ascii)
            self.emit("message", {
                agentId: event[event.type.toLocaleLowerCase()].agent_id,
                executorId: event[event.type.toLocaleLowerCase()].executor_id,
                data: new Buffer(event[event.type.toLocaleLowerCase()].data, "base64").toString("ascii")
            });
        } else if (event.type === "ERROR") {
            // Emit an actual error object to identify errors from mesos master
            self.emit("error", new Error("Error received from Mesos master: " + event[event.type.toLocaleLowerCase()].message));
        } else {
            // Emit original objects for all other types
            self.emit(event.type.toLocaleLowerCase(), event[event.type.toLocaleLowerCase()]);
        }

    } catch (error) {
        self.emit("error", {
            message: "Couldn't parse as JSON: " + eventData,
            stack: (error.stack || "")
        });
    }

}

Scheduler.prototype.handleZkError = function(error, options, zkPath) {
// Check if node doesn't exist yet
    let self = this;
    if (error.getCode() === zookeeper.Exception.NO_NODE) {
        self.initOptions(options);

        self.logger.info("Node " + zkPath + " doesn't exist yet. Will be created on framework launch");

        // Add event handler for the SUBSCRIBE event, to set the framework id to ZooKeeper
        self.once("subscribed", function (obj) {

            self.logger.debug("Got subscribed event");

            self.logger.debug("now creating path " + zkPath);

            // Seperating path creation from data save due to various client bugs.
            self.zkClient.mkdirp(zkPath, function (error, stat) {

                if (error) {
                    self.logger.error("Got error when creating a ZK node for the framework ID: " + error.stack);
                    self.options.useZk = false;
                    self.zkClient.close();
                } else {
                    self.zkClient.setData(zkPath, new Buffer(self.frameworkId), function (error, stat) {
                        if (error) {
                            self.logger.error("Got error when saving the framework ID on ZK: " + error.stack);
                            self.options.useZk = false;
                            self.zkClient.close();
                        } else {
                            self.logger.debug("Successfully set framework ID");
                        }
                    });
                }

            });

        });

        // Populate tasks, no point in loading them if no ID set
        if (options.hasOwnProperty("tasks")) {
            self.populateTaskArrays(options.tasks);
        }
        // "ready" event is emitted after successfully loading the tasks!

    } else {
        // Other error
        self.logger.error(error.stack);
    }
}

Scheduler.prototype.handleRedirect = function (location) {

    var self = this;

    // Redirection to another Master received
    self.logger.info("SUBSCRIBE: Redirect Location: " + location);

    // Derive the leader info
    var leaderInfo = location.replace(/\/\//g, "").split(":");

    // Check for scheme and move window accordingly
    var schemeIndex = leaderInfo.length > 2 ? 0 : -1;

    // Set new leading master info
    self.options.masterUrl = leaderInfo[schemeIndex + 1];

    // If the port part contains slashes -> URLs, then fiix it by just getting the port
    if (leaderInfo[schemeIndex + 2].indexOf("\/") > -1) {
        var temp = leaderInfo[schemeIndex + 2].split("/");
        self.options.port = temp[0];
    } else {
        self.options.port = leaderInfo[schemeIndex + 2];
    }

    self.logger.info("SUBSCRIBE: Leader info: " + self.options.masterUrl + ":" + self.options.port);

    // Fill the requestTemplate
    self.generateRequestTemplate();

}
/**
* Subscribes the framework scheduler to the leading Mesos master.
*/
Scheduler.prototype.subscribe = function () {

    var self = this;

    self.emit("pending_subscribe", self.subscribeBackoffTime);
    setTimeout(function () {

        // We need to remove the stream id from the headers before re-subscribing!
        self.mesosStreamId = undefined;
        delete self.requestTemplate.headers["mesos-stream-id"];
        delete self.requestTemplate.headers["Mesos-Stream-Id"];

        var handledReconnect = false;

        self.httpRequest = http.request(self.requestTemplate, function (res) {

            self.logger.info("SUBSCRIBE: Response status: " + res.statusCode);

            if (res.statusCode === 307 && res.headers["location"]) {

                // Handle redirect information
                self.handleRedirect(res.headers["location"]);

                // Try to re-register
                self.subscribe();

            } else if (res.statusCode === 200) {
                if (!res.headers["mesos-stream-id"]) {
                    self.emit("error", {
                        message: "Mesos-Stream-Id header field was not found!"
                    });
                } else {

                    // Set mesosStreamId
                    self.mesosStreamId = res.headers["mesos-stream-id"];

                    // Set encoding to UTF8
                    res.setEncoding('utf8');

                    // Emit sent_subscribe event
                    self.emit("sent_subscribe", {
                        mesosStreamId: self.mesosStreamId
                    });

                    // Local cache for chunked JSON messages
                    var cache = "";
                    var expectedLength = 0;

                    // Watch for data/chunks
                    res.on('data', function (chunk) {

                        if (chunk instanceof Buffer) {
                            chunk = chunk.toString();
                        }

                        if (chunk.indexOf("\n") > -1) {
                            var temp = chunk.split("\n");
                            if (temp.length === 2) {
                                expectedLength = parseInt(temp[0]);
                                if (temp[1].length < expectedLength) {
                                    // Add to cache
                                    cache += temp[1];
                                } else {
                                    // Empty cache
                                    cache = "";
                                    expectedLength = 0;
                                    // Handle event
                                    self.handleEvent(temp[1]);
                                }
                            } else {
                                self.emit("error", {
                                    message: "Other linebreak count found than expected! Actual count: " + temp.length
                                });
                            }
                        } else {
                            if (cache.length > 0 && (cache.length + chunk.length) >= expectedLength) {
                                // Concatenate cached partial data with this chunk and handle only when done
                                var eventData = cache + chunk;
                                // Handle event
                                self.handleEvent(eventData);
                                // Empty cache
                                cache = "";
                                expectedLength = 0;
                            } else if (cache.length > 0 && (cache.length + chunk.length) < expectedLength) {
                                // Concatenate cached data with current chunk, for cases in which the stream buffer is smaller than the data.
                                cache += chunk;
                            }
                        }
                    });

                    res.on('end', function () {
                        self.emit("error", {
                            message: "Long-running connection was closed!"
                        });
                        self.logger.info("Long-running connection was closed!");
                        if (!handledReconnect) {
                            handledReconnect = true;
                            self.backOff();
                            // Re-subscribe
                            self.subscribe();
                        }
                    });

                    res.on('finish', function () {
                        self.logger.info("FINISH!");
                    });

                    res.on('close', function () {
                        self.logger.info("CLOSE!");
                    });

                }

            } else if (res.statusCode !== 307) {

                self.backOff();
                self.subscribe();

                res.on("data", function (chunk) {
                    if (chunk.length > 0) {
                        self.emit("error", {
                            message: "Error registering with mesos:" + chunk.toString() + ", code: " + res.statusCode.toString()
                        });
                    } else {
                        self.emit("error", {
                            message: "Error registering with mesos, code: " + res.statusCode.toString()
                        });
                    }
                });
            }
        });

        self.httpRequest.on('error', function (e) {
            self.emit("error", {
                message: "There was a problem with the request: " + (e.message ? e.message : JSON.stringify(e))
            });
            self.logger.debug("Will try to re-register the framework scheduler!");
            if (!handledReconnect) {
                handledReconnect = true;
                self.backOff();
                // Re-subscribe
                self.subscribe();
            }
        });

        // Register a timeout for triggering of re-registrations of the scheduler
        self.httpRequest.on('socket', function (socket) {
            var httpRequest = self.httpRequest;
            socket.setTimeout(self.options.masterConnectionTimeout);
            socket.on('timeout', function () {
                self.logger.error("Received a timeout on the long-running Master connection! Will try to re-register the framework scheduler!");
                handledReconnect = true;
                socket.destroy();
                // Make sure the timeout is not re-emitted.
                socket.setTimeout(0);
                if (httpRequest !== self.httpRequest) {
                    self.logger.info("Already reconnected, not attempting again.");
                    return;
                }

                // Backing off before resubscribe
                self.backOff();

                // If we're using Mesos DNS, we can directy re-register, because Mesos DNS will discover the current leader automatically
                if (self.options.masterUrl === "leader.mesos") {
                    // We need to remove the stream id from the headers before re-subscribing!
                    self.mesosStreamId = undefined;
                    delete self.requestTemplate.headers["mesos-stream-id"];
                    delete self.requestTemplate.headers["Mesos-Stream-Id"];
                    self.logger.info("Using Mesos DNS, will re-register to 'leader.mesos'!");
                    // Subscribe
                    self.subscribe();
                } else {
                    self.logger.info("Not using Mesos DNS, try to get new leader through redirection!");
                    // If not, it's more difficult. When a IP address is passed for the Master, and the Master is unavailable,
                    // we cannot use the Master detection via location headers, as outlined at http://mesos.apache.org/documentation/latest/scheduler-http-api/ (chapter "Master detection"),
                    // because the request will not be successful. So, first we'll try the redirect method (in case of a leader change), if that is not possible, we have to shut down our framework
                    // unless there is a better way in the future.
                    var redirectRequest = http.request(self.requestTemplate, function (res) {
                        // Check if we received a redirect
                        if (res.statusCode === 307 && res.headers["location"]) {
                            self.logger.info("Received redirection information. Will attempt to re-register the framework scheduler!");
                            // Handle redirect information
                            self.handleRedirect(res.headers["location"]);
                            // Subscribe
                            self.subscribe();
                        }
                    });
                    // Set timeout for redirect request. When it's triggered, we know that the last leading master is down and that we cannot get the current leader information from it.
                    // So, we have to shutdown the framework scheduler, because we're out of options.
                    redirectRequest.on('socket', function (socket) {
                        socket.setTimeout(self.options.masterConnectionTimeout);
                        socket.on('timeout', function () {
                            self.logger.error("Couldn't receive a response for the redirect request from the last leading master!");
                            self.logger.error("There's no way to recover, the framework scheduler will halt now!");
                            process.exit(1);
                        });
                    });
                }

            });
        });

        // Set the Subscribe object
        var Subscribe = new mesos.scheduler.Call.Subscribe(
            new mesos.FrameworkInfo(
                self.options.user, // user
                self.options.frameworkName, // name
                self.frameworkId ? new mesos.FrameworkID(self.frameworkId) : null, // id -> Use existing frameworkId for reconnections!
                self.options.frameworkFailoverTimeout, // failover_timeout -> Set to one week for scheduler failover
                self.options.useZk, // checkpoint
                null, // role
                (envs.HOST ? envs.HOST : null), // hostname
                null, // principal
                (envs.HOST && envs.PORT0 ? "http://" + envs.HOST + ":" + envs.PORT0 : null), // webui_url
                null, // capabilities
                null // labels
            )
        );

        self.logger.info("SUBSCRIBE: " + JSON.stringify(Subscribe));

        // Set the Call object
        var Call = helpers.stringifyEnumsRecursive(
            new mesos.scheduler.Call(
                self.frameworkId ? new mesos.FrameworkID(self.frameworkId) : null,
                "SUBSCRIBE",
                Subscribe
            )
        );

        console.log(self.subscribeBackoffTime);
        // Write data to request body
        self.httpRequest.write(JSON.stringify(Call));
        self.httpRequest.end();

    }, self.subscribeBackoffTime);

};

/**
* Accept incoming offers to actually start the framework scheduler.
* @param {array} offers - The array of {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L47|OfferID}s which should be accepted.
* @param {array} taskInfos - The array of {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1165|Operation} objects.
* @param {array} filters - The array of {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1418|Filter} objects.
*/
Scheduler.prototype.accept = function (offers, operations, filters) {

    var self = this;

    // Set the Accept object
    var Accept = new mesos.scheduler.Call.Accept(offers, operations, filters);

    self.logger.info("ACCEPT: " + JSON.stringify(Accept));

    // Set the Call object
    var Call = helpers.stringifyEnumsRecursive(new mesos.scheduler.Call(new mesos.FrameworkID(self.frameworkId), "ACCEPT", null, Accept));

    helpers.doRequest.call(self, Call, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_accept");
        }
    });

};

/**
* Decline incoming offers because they are not needed by the framework scheduler currently.
* @param {array} offers - The array of {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L47|OfferID}s which should be declined.
* @param {array} filters - The array of {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1418|Filter} objects.
*/
Scheduler.prototype.decline = function (offers, filters) {

    var self = this;

    // Set the Decline object
    var Decline = new mesos.scheduler.Call.Decline(offers, filters);

    // Set the Call object
    var Call = helpers.stringifyEnumsRecursive(new mesos.scheduler.Call(new mesos.FrameworkID(self.frameworkId), "DECLINE", null, null, Decline));

    helpers.doRequest.call(self, Call, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_decline");
        }
    });
};

/**
* Tear down the framework scheduler. When Mesos receives this request it will shut down all executors (and consequently kill tasks).
* It then removes the framework and closes all open connections from this scheduler to the Master.
*/
Scheduler.prototype.teardown = function () {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "TEARDOWN"
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_teardown");
        }
    });

};

/**
* Remove any/all filters that it has previously set via ACCEPT or DECLINE calls.
*/
Scheduler.prototype.revive = function () {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "REVIVE"
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_revive");
        }
    });

};

/**
*  Kill a specific task. If the scheduler has a custom executor, the kill is forwarded to the executor; it is up to the executor to kill the task and send a TASK_KILLED (or TASK_FAILED) update.
*  Mesos releases the resources for a task once it receives a terminal update for the task. If the task is unknown to the master, a TASK_LOST will be generated.
* @param {string} taskId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L69|TaskID} to kill.
* @param {string} agentId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L57|AgentID} the task is running on.
*/
Scheduler.prototype.kill = function (taskId, agentId) {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "KILL",
        "kill": {
            "task_id": {
                "value": taskId
            },
            "agent_id": {
                "value": agentId
            }
        }
    };

    self.logger.debug("Killing task ID: " + taskId);

    if (self.options.useZk)
    self.taskHelper.deleteTask(taskId);

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_kill");
        }
    });

};

/**
* shutdown a specific custom executor (NOTE: This is a new call that was not present in the old API). When an executor gets a shutdown event, it is expected to kill all its tasks (and send TASK_KILLED updates) and terminate.
* If an executor doesn’t terminate within a certain timeout (configurable via “–executor_shutdown_grace_period” agent flag), the agent will forcefully destroy the container (executor and its tasks) and transitions its active tasks to TASK_LOST.
* @param {string} agentId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L57|AgentID} the task is running on.
* @param {string} executorId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L79|ExecutorID} whcih runs the task.
*/
Scheduler.prototype.shutdown = function (agentId, executorId) {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "SHUTDOWN",
        "kill": {
            "executor_id": {
                "value": executorId
            },
            "agent_id": {
                "value": agentId
            }
        }
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_shutdown");
        }
    });

};

/**
* Acknowledge a status update.
* @param {object} update The status update to acknowledge.
*/
Scheduler.prototype.acknowledge = function (update) {

    //self.logger.info("ACKNOWLEDGE: " + JSON.stringify(update));

    var self = this;

    if (!update.status.uuid) {
        self.logger.debug("An update without UUID received, acknowledge skipped. Update: " + JSON.stringify(update));
        return;
    }

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "ACKNOWLEDGE",
        "acknowledge": {
            "agent_id": update.status.agent_id,
            "task_id": update.status.task_id,
            "uuid": update.status.uuid
        }
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_acknowledge");
        }
    });

};

/**
* query the status of non-terminal tasks. This causes the master to send back UPDATE events for each task in the list. Tasks that are no longer known to Mesos will result in TASK_LOST updates.
* If the list of tasks is empty, master will send UPDATE events for all currently known tasks of the framework.
* @param {?(string|string[])} taskId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L69|TaskID} to kill.
* @param {?(string|string[])} agentId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L57|AgentID} the task is running on.
*/
Scheduler.prototype.reconcile = function (taskId, agentId) {

    var self = this;

    var payload = null;
    var tasks = 0;
    if (taskId && agentId && typeof (taskId) === "string" && typeof (agentId) === "string") {
        payload = {
            "framework_id": {
                "value": self.frameworkId
            },
            "type": "RECONCILE",
            "reconcile": {
                "tasks": [{
                    "task_id": {
                        "value": taskId
                    },
                    "agent_id": {
                        "value": agentId
                    }
                }]
            }
        };
        tasks = 1;
        self.logger.debug("Reconciling task ID: " + taskId);
    } else if (taskId && agentId && Array.isArray(taskId) && Array.isArray(agentId)) {
        payload = {
            "framework_id": {
                "value": self.frameworkId
            },
            "type": "RECONCILE",
            "reconcile": {
                "tasks": []
            }
        };
        var index;
        for (index = 0; index < taskId.length; index += 1) {
            if (taskId[index] && agentId[index]) {
                payload.reconcile.tasks.push({
                    "task_id": {
                        "value": taskId[index]
                    },
                    "agent_id": {
                        "value": agentId[index]
                    }
                });
                tasks += 1;
                self.logger.debug("Reconciling task ID: " + taskId[index]);
            }
        }
    } else {
        payload = {
            "framework_id": {
                "value": self.frameworkId
            },
            "type": "RECONCILE",
            "reconcile": {
                "tasks": []
            }
        };
        self.logger.debug("Reconciling all tasks ");
    }

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_reconcile", tasks);
        }
    });

};

/**
* Send arbitrary data to the executor. Note that Mesos neither interprets this data nor makes any guarantees about the delivery of this message to the executor.
* @param {string} agentId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L57|AgentID} the task is running on.
* @param {string} executorId The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L79|ExecutorID} whcih runs the task.
* @param {string} data The string which's raw bytes will be encoded in Base64.
*/
Scheduler.prototype.message = function (agentId, executorId, data) {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "MESSAGE",
        "message": {
            "agent_id": {
                "value": agentId
            },
            "executor_id": {
                "value": executorId
            },
            "data": new Buffer(data).toString('base64')
        }
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_message");
        }
    });

};

/**
* Request resources from the master/allocator. The built-in hierarchical allocator simply ignores this request but other allocators (modules) can interpret this in a customizable fashion.
* @param {array} requests The {@link https://github.com/apache/mesos/blob/c6e9ce16850f69fda719d4e32be3f2a2e1d80387/include/mesos/v1/mesos.proto#L1129|Request} objects which should be sent to the server.
*/
Scheduler.prototype.request = function (requests) {

    var self = this;

    var payload = {
        "framework_id": {
            "value": self.frameworkId
        },
        "type": "REQUEST",
        "requests": requests
    };

    helpers.doRequest.call(self, payload, function (error, response) {
        if (error) {
            self.emit("error", error.message);
        } else {
            self.emit("sent_request");
        }
    });

};

/**
* Clean the locationsMap that is used to prevent inner colocation
* @param {object} task
*/
Scheduler.prototype.cleanLocationsMap = function (task) {
    var self = this;
    if (task.noInnerColocation && self.locationsMap[task.mesosName]) {
        self.logger.debug("Cleaning IP " + task.runtimeInfo.network.ip + " from locationsMap");
        self.locationsMap[task.mesosName] = self.locationsMap[task.mesosName].filter((ip) => {
            return task.runtimeInfo.network.ip !== ip
        });
    }
};

/**
* Clean the Availability zones map that is used to spread tasks between availability zones is the feature is turned on
* @param {object} task
*/
Scheduler.prototype.cleanAzMap = function (task) {
    var self = this;
    if (task.azAware && self.azMap[task.mesosName]) {
        self.logger.debug("Cleaning AZ " + task.az  + " from availability zones map");
        var index = self.azMap[task.mesosName].indexOf(task.az);

        if (index > -1) {
            self.azMap[task.mesosName].splice(index, 1);
        } else {
            self.logger.error("Couldn't find matching AZ in map");
        }
    }
};

/**
* Adds to the locations map that is used to spread tasks between different dc/os nodes
* @param {object} task
*/
Scheduler.prototype.addLocationsMap = function (task) {
    var self = this;

    self.logger.debug(JSON.stringify(self.locationsMap));
    if (!self.locationsMap[task.mesosName]) {
        self.locationsMap[task.mesosName] = [];
    }
    self.locationsMap[task.mesosName].push(task.runtimeInfo.network.ip);
};

/**
* Adds to the Availability zones map that is used to spread tasks between availability zones is the feature is turned on
* @param {object} task
*/
Scheduler.prototype.addAzMap = function (task) {
    var self = this;

    self.logger.debug(JSON.stringify(self.azMap));

    if (!self.azMap[task.mesosName]) {
        self.azMap[task.mesosName] = [];
    }

    self.azMap[task.mesosName].push(task.az);
};

/**
* Get the running tasks of this framework scheduler.
* @returns {Array} The running task array.
*/
Scheduler.prototype.getRunningTasks = function () {

    var self = this;
    var runningTasks = [];

    Object.getOwnPropertyNames(self.runtimeInfo).forEach(function (taskType) {
        Object.getOwnPropertyNames(self.runtimeInfo[taskType].runningInstances).forEach(function (task) {
            runningTasks.push(task);
        });
    });

    return runningTasks;

};

/**
* Synchronize the tasks of this scheduler.
*/
Scheduler.prototype.sync = function () {

    var self = this;
    self.logger.info("Starting periodic sync process");
    var agentIds = [];
    var taskIds = [];
    for (var i = 0; i < self.reconcileTasks.length; i++) {
        if (self.reconcileTasks[i].runtimeInfo.agentId) {
            taskIds.push(self.reconcileTasks[i].taskId);
            agentIds.push(self.reconcileTasks[i].runtimeInfo.agentId);
        } else {
            if (self.options.useZk)
            self.taskHelper.deleteTask(self.reconcileTasks[i].taskId);
        }
    }
    self.reconcileTasks = [];
    self.launchedTasks.forEach(function (task) {
        if (task.runtimeInfo.agentId) {
            taskIds.push(task.taskId);
            agentIds.push(task.runtimeInfo.agentId);
        }
    });
    for (var i = 0; i < self.killTasks.length; i++) {
        self.kill(self.killTasks[i].taskId, self.killTasks[i].runtimeInfo.agentId);
    }
    self.killTasks = [];
    if (self.options.useZk) {
        self.reconcile();
    }
    if (taskIds.length) {
        setImmediate(function () {
            self.reconcile(taskIds, agentIds);
        });
    }
};

Scheduler.prototype.backOff = function () {
    var self = this;
    self.subscribeBackoffTime *= self.options.exponentialBackoffFactor;
    self.subscribeBackoffTime = Math.round(self.subscribeBackoffTime);
    if (self.subscribeBackoffTime === 0) {
        self.subscribeBackoffTime = self.options.exponentialBackoffMinimum;
    }
    if (self.subscribeBackoffTime > self.options.exponentialBackoffMaximum) {
        self.subscribeBackoffTime = self.options.exponentialBackoffMaximum;
    }
    self.logger.debug("Backoff time: " + self.subscribeBackoffTime);
}

module.exports = Scheduler;

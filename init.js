/*jslint
this: true,
es6: true,
node: true
for
*/
"use strict";
// Internal modules
const fs = require("fs");
const path = require('path');

// NPM modules
var express = require("express");

// Project modules
var appConfig = require("./lib/config");
var RestartHelper = require("./lib/restartHelper");
var linkHelper = require("./lib/linkHelper");
var baseApi = require("./lib/baseApi");
var initAuth = require("./lib/auth");
var ejs = require("./routes/ejs");
var populateTasks = require("./lib/populateTasks").populateTasks;
var ConfigHelper = require("./lib/configHelper").ConfigHelper;

// Modules loaded array
var moduleSetups = [];

// Check if we got the necessary info from the environment, otherwise fail directly!
require("require-environment-variables")([
    // Scheduler settings
    "HOST",
    "PORT0",
    "MESOS_SANDBOX",
    "FRAMEWORK_NAME"
]);

// Create the Express object
var app = express();
app.set('view engine', 'ejs');

// Set application properties
app.set("port", process.env.PORT0 || appConfig.application.port);
app.set("host", process.env.HOST || appConfig.application.host);
app.set("env", process.env.NODE_ENV || appConfig.application.environment);
app.set("logLevel", process.env.LOG_LEVEL || appConfig.application.logLevel);

// Initialize optional user authorization
initAuth(app);

// Define static files path
app.use(express.static("public"));
app.use("/bower_components", express.static("bower_components"));

var helpers = require("./lib/helpers");

var Scheduler = require("./lib/scheduler");

// The framework's overall configuration
var frameworkConfiguration = {
    "masterUrl": process.env.MASTER_IP || "leader.mesos",
    "port": 5050,
    "frameworkName": process.env.FRAMEWORK_NAME,
    "appName": process.env.MARATHON_APP_ID,
    "marathonResources": {
        "cpu": process.env.MARATHON_APP_RESOURCE_CPUS,
        "mem": process.env.MARATHON_APP_RESOURCE_MEM
    },
    "logging": {
        "path": process.env.MESOS_SANDBOX + "/logs/",
        "fileName": process.env.FRAMEWORK_NAME + ".log",
        "level": app.get("logLevel")
    },
    "killUnknownTasks": true,
    "exponentialBackoffMinimum": Math.round(Math.random() * 1000 + 500),
    "useZk": true,
    "staticPorts": true,
    "serialNumberedTasks": false,
    "restartStates": ["TASK_FAILED", "TASK_LOST", "TASK_ERROR", "TASK_FINISHED", "TASK_KILLED"], // A sealed vault is killed and does not finish normally
    "authExemptPaths": [], // Paths that are authentication aware that do not need to be checked for authentication.
    "moduleList": []
};

fs.mkdirSync(path.join(process.env.MESOS_SANDBOX, "logs"));

function requireModules(scheduler) {
    // Importing pluggable modules
    var moduleFiles = fs.readdirSync(process.env.MESOS_SANDBOX);
    if (moduleFiles) {
        var index;
        var currentModule;
        for (index = 0; index < moduleFiles.length; index += 1) {
            currentModule = moduleFiles[index];
            if (currentModule.match(/-module$/) && fs.existsSync(path.join(process.env.MESOS_SANDBOX, currentModule, "index.js"))) {
                scheduler.logger.info("Loading module " + currentModule);
                moduleSetups.push(require(process.env.MESOS_SANDBOX + currentModule));
            }
        }
    }
}

var configHelper;
configHelper = new ConfigHelper(app, frameworkConfiguration, function (error, config) {
    var propertyType;
    var tasksDefined = false;
    var linksDefined = false;
    var envVars = {};
    this.logger.debug("Config from server:" + JSON.stringify(config));
    Object.getOwnPropertyNames(config).forEach(function (property) {
        propertyType = typeof config[property];
        if (property.toUpperCase() === property && (propertyType === "number" || propertyType === "string")) {
            process.env[property] = config[property];
            envVars[property] = config[property];
        } else if (property.toUpperCase() === property && propertyType === "object") {
            envVars[property] = JSON.stringify(config[property]);
        }
    });

    if (process.env.ZK_PATH) {
        frameworkConfiguration.zkPrefix = process.env.ZK_PATH;
    }

    if (config.configVersion) {
        if (config.TASK_DEF_NUM) {
            frameworkConfiguration.tasks = populateTasks(config);
            frameworkConfiguration.zkConfigOverwrite = true;
            tasksDefined = true;
        }
        if (config.FRAMEWORK_LINKS) {
            frameworkConfiguration.frameworkLinks = linkHelper.populateLinkConfig(config);
            linksDefined = true;
        }
        frameworkConfiguration.configVersion = config.configVersion;
    } else {
        if (process.env.TASK_DEF_NUM) {
            frameworkConfiguration.tasks = populateTasks();
            tasksDefined = true;
        }
        if (process.env.FRAMEWORK_LINKS) {
            frameworkConfiguration.frameworkLinks = linkHelper.populateLinkConfig();
            linksDefined = true;
        }
    }
    frameworkConfiguration.healthCheckTimeout = process.env.HEALTH_TIMEOUT || appConfig.application.healthTimeout;
    if (process.env.AUTH_COOKIE_ENCRYPTION_KEY) {
        frameworkConfiguration.userAuthSupport = true;
    } else if (helpers.checkBooleanString(process.env.AUTH_DISABLED, false)) {
        frameworkConfiguration.userAuthSupport = false;
    } else {
        console.log("ERROR: Authentication not configured and not disabled");
        setTimeout(function () {
            process.exit(1);
        }, 120000);
    }
    if (Object.getOwnPropertyNames(envVars).length > 0) {
        frameworkConfiguration.env = envVars;
    }
    var scheduler;
    var envSet = false;

    function optionsHandler(options, callback) {
        scheduler.logger.debug("Starting optionsHandler with: " + JSON.stringify(options));
        if (options && options.env) {
            Object.getOwnPropertyNames(options.env).forEach(function (property) {
                propertyType = typeof options.env[property];
                if ((!config.hasOwnProperty(property)) // Don't override existing configuration
                    && property.toUpperCase() === property && (propertyType === "number" || propertyType === "string")) {
                    scheduler.logger.debug("Setting env." + property + ": " + options.env[property]);
                    process.env[property] = options.env[property];
                } else {
                    scheduler.logger.debug("NOT setting env." + property + ": " + options.env[property] + " type: " + propertyType);
                }
            });
        }
        envSet = true;
        if (!tasksDefined) {
            try {
                options.tasks = populateTasks();
                tasksDefined = true;
            } catch (err) {
                scheduler.logger.error("Error defining tasks: " + err.toString());
            }
        }
        if (!linksDefined) {
            options.frameworkLinks = linkHelper.populateLinkConfig();
        }
        if (tasksDefined) {
            requireModules(scheduler);
            callback();
        } else {
            scheduler.logger.info("Tasks were not defined, exiting.");
            setTimeout(() => {
                process.exit(1);
            }, 120000);
        }
        scheduler.logger.debug("Ended optionsHandler");
    }

    frameworkConfiguration.optionsHandler = optionsHandler;

    if (config.LOG_LEVEL) {
        app.set("logLevel", config.LOG_LEVEL);
        frameworkConfiguration.logging.level = config.LOG_LEVEL;
    }

    scheduler = new Scheduler(frameworkConfiguration);
    var restartHelper;

    // Start framework scheduler
    scheduler.on("ready", function () {
        // To set loggers that initialized already
        if (config.LOG_LEVEL) {
            app.set("logLevel", config.LOG_LEVEL);
            scheduler.logModules.forEach(function (module) {
                module.logger.transports.dailyRotateFile.level = config.LOG_LEVEL;
                module.logger.transports.console.level = config.LOG_LEVEL;
            });
        }
        scheduler.logger.info("Ready");
        if (!envSet) {
            requireModules(scheduler);
        }
        if (!tasksDefined) {
            scheduler.logger.info("Tasks were not defined, exiting.");
            setTimeout(function () {
                process.exit(1);
            }, 120000);
        } else {
            scheduler.subscribe();
        }
    });

    // Capture "error" events
    scheduler.on("error", function (error) {
        scheduler.logger.error("ERROR: " + JSON.stringify(error));
        scheduler.logger.error(error.stack);
    });

    // Wait for the framework scheduler to be subscribed to the leading Mesos Master
    scheduler.once("subscribed", function () {

        linkHelper.linkCheckSetup(scheduler, frameworkConfiguration);
        scheduler.sync();
        scheduler.logger.debug("Subscribe sync issued");

        if (process.env.SYNC_INTERVAL) {
            setInterval(function () {
                scheduler.sync();
            }, process.env.SYNC_INTERVAL * 1000);
        }

        scheduler.logger.debug("Sync timer set up");
        restartHelper = new RestartHelper(scheduler, {
            "timeout": 300000,
            "logging": {
                "path": process.env.MESOS_SANDBOX + "/logs/",
                "fileName": process.env.FRAMEWORK_NAME + ".log",
                "level": app.get("logLevel")
            }
        });

        scheduler.logger.debug("Restart helper set up");
        // Instantiate API (pass the scheduler and framework configuration)
        var api = require("./routes/api")(scheduler, frameworkConfiguration, restartHelper);
        scheduler.logger.debug("API set up");

        // Middleware for health check API - must stay before the modules setup
        app.use(function (req, res, next) {
            req.scheduler = scheduler;
            req.frameworkConfiguration = frameworkConfiguration;
            next();
        });
        scheduler.logger.debug("Middleware set up");

        // Setup extended modules
        if (moduleSetups) {
            var index;
            try {
                for (index = 0; index < moduleSetups.length; index += 1) {
                    moduleSetups[index](scheduler, frameworkConfiguration, api, app, restartHelper);
                }
            } catch (err) {
                scheduler.logger.error("Modules could not be loaded: " + err.toString() + " exiting.");
                setTimeout(function () {
                    process.exit(1);
                }, 120000);
                return;
            }
        }
        scheduler.logger.debug("Modules set up");
        require("./routes/configApi")(api);

        var bodyParser = require('body-parser');

        app.use(bodyParser.json());
        scheduler.logger.debug("Config API set up");
        // Create routes
        app.use("/api/" + appConfig.application.apiVersion, api);

        scheduler.logger.debug("API set up");

        // /health endpoint for Marathon health checks
        app.get("/health", baseApi.healthCheck);

        scheduler.logger.debug("Health check set up");
        ejs.setup(app);

        scheduler.logger.debug("EJS set up");
        app.get("/moduleList", baseApi.moduleList);
    });

    // Setting up the express server
    var server;
    server = app.listen(app.get("port"), app.get("host"), function () {
        scheduler.logger.info("Express server listening on port " + server.address().port + " on " + server.address().address);
    });

    process.on("uncaughtException", function (error) {
        scheduler.logger.error("Caught exception: ");
        scheduler.logger.error(error.stack);
    });
});

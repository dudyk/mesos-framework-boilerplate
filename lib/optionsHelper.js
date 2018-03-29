"use strict";

var helpers = require("./helpers");

var each = require("async").each;
var eachSeries = require("async").eachSeries;
var zookeeper = require("node-zookeeper-client");

var moduleFunctions = {};

moduleFunctions.loadOptions = function (options) {
    var self = this;
    if (!options.configVersion || options.zkConfigOverwrite) {
        self.logger.info("Not loading options from ZooKeeper");
        self.emit("options_loaded", options);
        return;
    }
    var zkPath = self.zkServicePath + "/config/" + options.configVersion;
    self.logger.debug("Getting options from ZK");
    self.zkClient.getData(zkPath, null, function (error, data, stat) {
        self.logger.debug("Returned from getData");
        if (error || !data) {
            if ((error && error.getCode() === zookeeper.Exception.NO_NODE) ||
                    (!error && !data)) {
                self.logger.info("No options found in ZK.");
            } else {
                self.logger.error("Config could not be loaded, error: " + error.toString());
            }
            self.emit("options_loaded", options);
            return;
        }
        try {
            var parsedOptions = JSON.parse(data);
            Object.getOwnPropertyNames(parsedOptions).forEach(function (name) {
                if (options.hasOwnProperty(name) === false) {
                    options[name] = parsedOptions[name];
                }
            });
        } catch (err) {
            self.logger.error("Saved options could not be parsed, error: " + err.toString());
        }
        self.emit("options_loaded", options);
        return;
    });
};

moduleFunctions.saveOptions = function (options) {
    var self = this;
    if (!options.configVersion) {
        return;
    }
    var zkPath = self.zkServicePath + "/config/" + options.configVersion;
    // Seperating path creation from data save due to various client bugs.
    self.zkClient.mkdirp(zkPath, function (error, stat) {
        if (error && error.getCode() !== zookeeper.Exception.NODE_EXISTS) {
            self.logger.error("Got error when creating a ZK node for the framework options: " + error.stack);
        } else {
            var cleaned_options = helpers.cloneDeep(options);
            cleaned_options.taskHelper = null;
            self.zkClient.setData(zkPath, new Buffer(JSON.stringify(cleaned_options)), function (error, stat) {
                if (error) {
                    self.logger.error("Got error when saving the framework options on ZK: " + error.stack);
                } else {
                    self.logger.debug("Successfully saved framework options");
                }
            });
        }

    });
};

module.exports = moduleFunctions;
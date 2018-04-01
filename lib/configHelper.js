/*jslint
this: true,
es6: true,
node: true
for
*/
"use strict";
// Internal modules
const fs = require("fs");

var mesosDNS = require("mesos-dns-node-resolver");

var helpers = require("./helpers");
var mesosHelpers = helpers.getMesosModule().helpers;

function ConfigHelper(app, config, callback) {
    if (!this) {
        return new ConfigHelper(app);
    }
    var self = this;
    self.logger = mesosHelpers.getLogger(process.env.MESOS_SANDBOX + "/logs/",
            process.env.FRAMEWORK_NAME + ".log",
            app.get("logLevel"),
            self);
    self.config = config;
    self.upgradeServiceConfig = self.populateConfigService();
    if (self.upgradeServiceConfig) {
        self.getConfig(callback);
    } else {
        callback.call(self, null, config);
    }
}

ConfigHelper.prototype.populateConfigService = function () {
    // The the upgrade config
    var upgradeServiceConfig = null;
    var self = this;

    if (process.env.UPGRADE_CONFIG_SERVICE && process.env.CONFIG_VERSION) {
        upgradeServiceConfig = {};
        upgradeServiceConfig.configHostname = process.env.UPGRADE_CONFIG_SERVICE;
        upgradeServiceConfig.configVersion = process.env.CONFIG_VERSION;
        self.logger.info("Using upgrade service");
    } else {
        self.logger.info("Upgrade service not in use");
    }
    return upgradeServiceConfig;
};

ConfigHelper.prototype.getConfigRequest = function () {
    var self = this;

    return mesosDNS.promiseResolve(self.upgradeServiceConfig.configHostname, null, null).then(function (response) {
        return Promise.resolve({
            "host": response[0].host,
            "port": response[0].ports[0],
            "path": "/api/v1/config/" + process.env.FRAMEWORK_TYPE + "/" + process.env.FRAMEWORK_NAME + "/" + self.upgradeServiceConfig.configVersion,
            "method": "GET",
            headers: {}
        });
    }).catch(function (err) {
        return Promise.reject(err);
    });
};


var getUpgradeServiceUrl = function () {
    return mesosDNS.promiseResolve(process.env.UPGRADE_CONFIG_SERVICE).then(function (response) {
        return Promise.resolve('http://' + response[0].host + ':' + response[0].ports[0] + '/api/v1/');
    }).catch(function (err) {
        return Promise.reject(err);
    });
};

ConfigHelper.prototype.getConfig = function (cb) {
    var self = this;
    self.getConfigRequest().then(function (request) {
        self.logger.debug("Get config request:" + JSON.stringify(request));
        mesosHelpers.doHealthRequest(request, function () {
            self.logger.info("Configuration loaded from server");
        }, function () {
            self.logger.error("Could not obtain configuration from server, will try to used the saved config");
            cb.call(self, new Error("HTTP error"), {configVersion: self.upgradeServiceConfig.configVersion});
        }, null, function (body) {
            var result = false;
            try {
                var config = JSON.parse(body);
                config.configVersion = self.upgradeServiceConfig.configVersion;
                cb.call(self, null, config);
                result = true;
            } catch (parseError) {
                self.logger.error("Error parsing config response:" + parseError.toString());
            }
            return result;
        }, null, self);
    }).catch(function (err) {
        self.logger.error("Could not obtain configuration from server, server not found, will try to used the saved config. Hostname: " + self.upgradeServiceConfig.configHostname);
        cb.call(self, new Error("Resolve error " + err.toString()), {configVersion: self.upgradeServiceConfig.configVersion});
    });
};

module.exports = {
    "ConfigHelper": ConfigHelper,
    "getUpgradeServiceUrl": getUpgradeServiceUrl
};
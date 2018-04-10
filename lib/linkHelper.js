/*jslint
this: true,
es6: true,
node: true
for
*/
"use strict";
// Internal modules
var mesosDNS = require("mesos-dns-node-resolver");

var helpers = require("./helpers");

function populateLinkConfig(config) {
    // The framework links
    var frameworkLinks = [];

    if (config && config.FRAMEWORK_LINKS) {
        config.FRAMEWORK_LINKS.forEach(function (link) {
            if (link && link.checkURL && link.linkHostname) {
                frameworkLinks.push(link);
            } else {
                console.log("ERROR: Link config invalid, not used: " + JSON.stringify(link));
            }
        });
    } else if (process.env.FRAMEWORK_LINKS) {
        try {
            JSON.parse(process.env.FRAMEWORK_LINKS).forEach(function (link) {
                if (link && link.checkURL && link.linkHostname) {
                    frameworkLinks.push(link);
                } else {
                    console.log("ERROR: Link config invalid, not used: " + JSON.stringify(link));
                }
            });
        } catch (error) {
            console.log("ERROR: parsing framework links failed: " + error.toString());
        }
    }
    return frameworkLinks;
}

function getLinkRequest(link, callback) {
    mesosDNS.resolve(link.linkHostname, null, null, function (err, response) {
        if (!err && response && response.length) {
            callback(null, {
                "host": response[0].host,
                "port": response[0].ports[0],
                "path": link.checkURL,
                "method": "GET",
                headers: {}
            });
        } else {
            callback(err);
        }
    });
}

function linkCheckSetup(scheduler, schedulerConfiguration) {
    if (schedulerConfiguration.frameworkLinks && schedulerConfiguration.frameworkLinks.length) {
        schedulerConfiguration.frameworkLinks.forEach(function (link) {
            if (link && link.checkURL) {
                setInterval(function () {
                    getLinkRequest(link, function (err, request) {
                        if (!err && request) {
                            helpers.doHealthRequest(request, function () {
                                link.healthy = true;
                                link.failTries = 0;
                            }, function () {
                                if (link.healthy !== false) {
                                    link.failTries = 1;
                                } else {
                                    link.failTries += 1;
                                }
                                link.healthy = false;
                                scheduler.logger.error("Linked framework is unhealthy. Hostname: " + link.linkHostname);
                            }, null, null, null, scheduler);
                        } else {
                            scheduler.logger.error("Linked framework was not found. Hostname: " + link.linkHostname);
                        }
                    });
                }, 30000);
            }
        }, this);
    }
}

module.exports = {
    "populateLinkConfig": populateLinkConfig,
    "linkCheckSetup": linkCheckSetup
};
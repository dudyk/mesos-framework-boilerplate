"use strict";

const fs = require("fs");
var mesos;
// Instantiate the mesos-framework module related objects
if (fs.existsSync("../mesos-framework")) {
    mesos = require("../mesos-framework");
} else {
    mesos = require("mesos-framework");
}

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
    getMesosModule: function () {
        return mesos;
    }
};
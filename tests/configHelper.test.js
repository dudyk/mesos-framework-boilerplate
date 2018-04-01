"use strict";
// NPM modules
var _ = require("lodash");
var rewire = require("rewire");

var configHelperModule = rewire("../lib/configHelper");
var ConfigHelper = configHelperModule.ConfigHelper;
var helpers = require("../lib/helpers");

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");

describe("ConfigHelper tests", function () {
    var oldEnv;
    var sandbox;
    var rewires = [];
    beforeEach(function () {
        oldEnv = _.cloneDeep(process.env);
        sandbox = sinon.sandbox.create();
    });
    afterEach(function () {
        process.env = oldEnv;
        sandbox.restore();
        rewires.forEach(function (restore) {
            restore();
        });
        rewires = [];
    });
    it("Constructor", function (done) {
        process.env.MESOS_SANDBOX = process.cwd();
        process.env.FRAMEWORK_NAME = "test";
        var params = {"loglevel": "debug"};
        var app = {get: function (param) {
            return params[param];
        }};
        var configHelper = new ConfigHelper(app, {}, function () {
            done();
        });
    });
    it("No server", function (done) {
        process.env.MESOS_SANDBOX = process.cwd();
        process.env.FRAMEWORK_NAME = "test";
        process.env.CONFIG_VERSION = "1.0";
        process.env.UPGRADE_CONFIG_SERVICE = "config.service";
        configHelperModule.__set__("mesosDNS", {promiseResolve: function () {
            return new Promise(function (resolve, reject) {
                reject(new Error("test error"));
            });
        }});
        var params = {"loglevel": "debug"};
        var app = {get: function (param) {
            return params[param];
        }};
        var configHelper = new ConfigHelper(app, {}, function () {
            done();
        });
    });
    it("HTTP error", function (done) {
        process.env.MESOS_SANDBOX = process.cwd();
        process.env.FRAMEWORK_NAME = "test";
        process.env.CONFIG_VERSION = "1.0";
        process.env.UPGRADE_CONFIG_SERVICE = "config.service";
        configHelperModule.__set__("mesosDNS", {promiseResolve: function () {
            return new Promise(function (resolve, reject) {
                resolve([{"host": "test.host", "ports": [432432,32423]}]);
            });
        }});
        helpers.doHealthRequest = sandbox.stub(helpers, "doHealthRequest").callsFake(function (request, okCallbak, errorCallback, codes, bodyFunction, errorSuffix, scheduler) {
            errorCallback();
        });
        var params = {"loglevel": "debug"};
        var app = {get: function (param) {
            return params[param];
        }};
        var configHelper = new ConfigHelper(app, {}, function () {
            done();
        });
    });

    it("parse error", function (done) {
        process.env.MESOS_SANDBOX = process.cwd();
        process.env.FRAMEWORK_NAME = "test";
        process.env.CONFIG_VERSION = "1.0";
        process.env.UPGRADE_CONFIG_SERVICE = "config.service";
        configHelperModule.__set__("mesosDNS", {promiseResolve: function () {
            return new Promise(function (resolve, reject) {
                resolve([{"host": "test.host", "ports": [432432,32423]}]);
            });
        }});
        helpers.doHealthRequest = sandbox.stub(helpers, "doHealthRequest").callsFake(function (request, okCallbak, errorCallback, codes, bodyFunction, errorSuffix, scheduler) {
            bodyFunction("{");
            errorCallback();
        });
        var params = {"loglevel": "debug"};
        var app = {get: function (param) {
            return params[param];
        }};
        var configHelper = new ConfigHelper(app, {}, function () {
            done();
        });
    });
    it("no error", function (done) {
        process.env.MESOS_SANDBOX = process.cwd();
        process.env.FRAMEWORK_NAME = "test";
        process.env.CONFIG_VERSION = "1.0";
        process.env.UPGRADE_CONFIG_SERVICE = "config.service";
        configHelperModule.__set__("mesosDNS", {promiseResolve: function () {
            return new Promise(function (resolve, reject) {
                resolve([{"host": "test.host", "ports": [432432,32423]}]);
            });
        }});
        helpers.doHealthRequest = sandbox.stub(helpers, "doHealthRequest").callsFake(function (request, okCallbak, errorCallback, codes, bodyFunction, errorSuffix, scheduler) {
            bodyFunction("{}");
            okCallbak();
        });
        var params = {"loglevel": "debug"};
        var app = {get: function (param) {
            return params[param];
        }};
        var configHelper = new ConfigHelper(app, {}, function () {
            done();
        });
    });
});
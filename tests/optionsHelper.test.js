"use strict";

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");
//var rewire = require("rewire");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var optionsHelper = require("../lib/optionsHelper");

describe("optionsHelper tests",function () {
    var logger;
    var schedulerMock;
    //var revertRewire;
    beforeEach(function () {
        logger = {};
        logger.info = function (message) {
            console.log(message);
        };
        logger.debug = logger.info;
        logger.error = logger.info;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            this.logger = logger;
            return this;
        }

        util.inherits(SchedulerStub, EventEmitter);
        schedulerMock = new SchedulerStub();
        //revertRewire = [];
    });
    afterEach(function () {
        /*revertRewire.forEach(function (revert) {
            revert();
        });*/
    });
    it("load with no version set", function () {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
        }};
        schedulerMock.zkClient = zkclientMock;
        optionsHelper.loadOptions.call(schedulerMock, {});
    });

    it("load with no options saved", function (done) {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
            cb(null, "");
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        schedulerMock.on("options_loaded", function (options) {
            expect(options).to.be.an("object");
            done();
        });
        optionsHelper.loadOptions.call(schedulerMock, {configVersion: "1.1"});
    });
    it("load with no actual options saved", function (done) {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
            cb(null, "{}");
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        schedulerMock.on("options_loaded", function (options) {
            expect(options).to.be.an("object");
            done();
        });
        optionsHelper.loadOptions.call(schedulerMock, {configVersion: "1.1"});
    });
    it("load with options saved", function (done) {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
            cb(null, "{\"tasks\": {\"name\":\"1241\"}, \"configVersion\": \"1.2\"}");
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        schedulerMock.on("options_loaded", function (options) {
            expect(options).to.be.an("object");
            expect(options.configVersion).to.equal("1.1");
            done();
        });
        optionsHelper.loadOptions.call(schedulerMock, {configVersion: "1.1"});
    });
    it("load with parse error", function (done) {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
            cb(null, "{\"tasks\": {\"name\":\"1241\"}");
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        schedulerMock.on("options_loaded", function (options) {
            expect(options).to.be.an("object");
            done();
        });
        optionsHelper.loadOptions.call(schedulerMock, {configVersion: "1.1"});
    });
    it("load with error", function (done) {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
            cb(new zookeeper.Exception(zookeeper.Exception.SYSTEM_ERROR, "fsdfsdfd", "gfdgdfgd", done));
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        schedulerMock.on("options_loaded", function (options) {
            expect(options).to.be.an("object");
            done();
        });
        optionsHelper.loadOptions.call(schedulerMock, {configVersion: "1.1"});
    });
    it("save with no version set", function () {
        var zkclientMock = {getData: function (path, watcher, cb) {
            expect(watcher).to.be.null;
        }};
        schedulerMock.zkClient = zkclientMock;
        optionsHelper.saveOptions.call(schedulerMock, {});
    });
    it("save with error in mkdirp", function (done) {
        var zkclientMock = {mkdirp: function (path, cb) {
            cb(new zookeeper.Exception(zookeeper.Exception.SYSTEM_ERROR, "fsdfsdfd", "gfdgdfgd", done));
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        optionsHelper.saveOptions.call(schedulerMock, {configVersion: "1.1"});
        done();
    });
    it("save with exists error in mkdirp", function (done) {
        var zkclientMock = {mkdirp: function (path, cb) {
            cb(new zookeeper.Exception(zookeeper.Exception.NODE_EXISTS, "fsdfsdfd", "gfdgdfgd", done));
        }, setData: function (path, buffer, cb) {
            expect(buffer).to.be.a("Uint8Array");
            cb(null, {});
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        optionsHelper.saveOptions.call(schedulerMock, {configVersion: "1.1"});
        done();
    });

    it("save with no error in mkdirp", function (done) {
        var zkclientMock = {mkdirp: function (path, cb) {
            cb(null);
        }, setData: function (path, buffer, cb) {
            expect(buffer).to.be.a("Uint8Array");
            cb(null, {});
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        optionsHelper.saveOptions.call(schedulerMock, {configVersion: "1.1"});
        done();
    });
    it("save with error in setData", function (done) {
        var zkclientMock = {mkdirp: function (path, cb) {
            cb(new zookeeper.Exception(zookeeper.Exception.NODE_EXISTS, "fsdfsdfd", "gfdgdfgd", done));
        }, setData: function (path, buffer, cb) {
            expect(buffer).to.be.a("Uint8Array");
            cb(new zookeeper.Exception(zookeeper.Exception.SYSTEM_ERROR, "fsdfsdfd", "gfdgdfgd", done), {});
        }};
        schedulerMock.zkClient = zkclientMock;
        schedulerMock.zkServicePath = "/dcos-service-test";
        optionsHelper.saveOptions.call(schedulerMock, {configVersion: "1.1"});
        done();
    });
});
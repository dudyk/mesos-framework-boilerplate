// Project require
var Scheduler = require("../").Scheduler;
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var http = require("http");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var winston = require("winston");
var mesos = (require("../lib/mesos"))().getMesos();
var schedulerHandlers = require("../lib/schedulerHandlers");

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");
var MockReq = require("mock-req");
var MockRes = require("mock-res");
var envs = require('../lib/envs');
describe("Subscribe flow - integration", function() {
    this.timeout(3000);

    var nock = require('nock');
    var baseUrl;
    beforeEach(function() {
        baseUrl = "http://127.0.0.1:5050";
        nock.cleanAll();
    });

    afterEach(function() {
        delete process.env.PORT0;
        delete process.env.HOST;
        delete envs.PORT0;
        delete envs.HOST;
        //nock.cleanAll();
    });

    it("error http status (fail)", function(done) {
        var errors = 0;
        nock(baseUrl).post("/api/v1/scheduler").reply(400,"gfdjklsg");
        var scheduler = new Scheduler({tasks: {
            task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
        scheduler.on("error", function(error) {
            console.log(JSON.stringify(error));
            errors++;
        });
        scheduler.on("ready", function () {
            scheduler.subscribe();
        });

        setTimeout(function(){
            expect(errors).to.equal(1);
            done();
        },200);
    });

    it("http redirect status no location (fail)", function(done) {
        var errors = 0;
        nock(baseUrl).post("/api/v1/scheduler").reply(307,"OK");
        var scheduler = new Scheduler({tasks: {
            task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
        scheduler.on("error", function(error) {
            console.log(JSON.stringify(error));
            errors++;
        });
        scheduler.on("ready", function () {
            scheduler.subscribe();
        });

        setTimeout(function(){
            expect(errors).to.equal(0);
            done();
        },500);
    });

    it("http redirect status with location (fail)", function(done) {
        var errors = 0;

        nock(baseUrl).post("/api/v1/scheduler").reply(307,"OK", {"location":"http://1.2.3.4:5030/fgs/fgdsg"});
        nock("http://1.2.3.4:5030").post("/api/v1/scheduler").reply(500,"blabla");
        nock("http://1.2.3.4:5030").post("/api/v1/scheduler").reply(200,"OK");

        var scheduler = new Scheduler({tasks: {
            task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});

        scheduler.on("error", function(error) {
            console.log(JSON.stringify(error));
            errors++;
        });

        scheduler.on("ready", function () {
            scheduler.subscribe();
        });

        setTimeout(()=>{
            expect(scheduler.options.masterUrl).to.equal("1.2.3.4");
            expect(scheduler.options.port).to.equal("5030");
            expect(errors).to.equal(2);
            done();
        }, 1200);
    });

    it("http redirect status with location without scheme and path (fail)", function(done) {
        var errors = 0;
        nock(baseUrl).post("/api/v1/scheduler").reply(307,"OK", {"location":"1.2.3.4:5030"});
        nock(/1\.2\.3\.4/).post("/api/v1/scheduler").replyWithError(500);

        var scheduler = new Scheduler({tasks: {
            task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
        scheduler.on("error", function(error) {
            console.log(JSON.stringify(error));
            errors++;
        });
        scheduler.on("ready", function () {
            scheduler.subscribe();
        });
        setTimeout(function (){
            expect(errors).to.equal(1);
            expect(scheduler.options.masterUrl).to.equal("1.2.3.4");
            expect(scheduler.options.port).to.equal("5030");
            done();
        }, 200);
    });

    it("OK http status - no stream id (fail)", function(done) {
        nock(baseUrl).post("/api/v1/scheduler").reply(200,"OK");
        var scheduler = new Scheduler({tasks: {
            task1:{isSubmitted:true}},useZk: false, logging: {level: "debug"}});
        scheduler.on("error", function(error) {
            console.log(JSON.stringify(error));
            done();
        });
        scheduler.on("ready", function () {
            scheduler.subscribe();
        });
    });

});
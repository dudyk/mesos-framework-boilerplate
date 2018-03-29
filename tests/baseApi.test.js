/* jslint: node, es6
*/
"use strict";

// Internal modules
var fs = require("fs");
var sinon = require("sinon");
var clock = sinon.useFakeTimers();
var helpers = require("../lib/helpers");
var TaskHealthHelper = helpers.getMesosModule().TaskHealthHelper;
var mesosHelpers = helpers.getMesosModule().helpers;
var RestartHelper = require("../lib/restartHelper");


var rewire = require('rewire');
var baseApi = rewire("../lib/baseApi");
var should = require('should');
// Testing require
var expect = require('chai').expect;
var MockReq = require("mock-req");
var MockRes = require("mock-res");
var configHelper = require('../lib/configHelper');


describe("Base API tests", function () {
    it("killAllTasks - no param", function () {
        var res = new MockRes();
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.killAllTasks(new MockReq(), res);
    });

    it("killAllTasks - param not yes", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=ye";
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.killAllTasks(req, res);
    });

    it("killAllTasks - yes - no tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yes";
        req.scheduler = {launchedTasks: []};
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.killAllTasks(req, res);
    });

    it("killAllTasks - yes - with tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yEs";
        req.scheduler = {
            launchedTasks: [{
                "taskId": "23241",
                "runtimeInfo": {"agentId": "3243223sgd"}
            }, {"taskId": "232g32gfd41", "runtimeInfo": {"agentId": "32432fs23sgd"}}]
        };
        req.scheduler.kill = function (taskId, agentId) {
            expect(taskId).to.be.a("string");
            expect(agentId).to.be.a("string");
        };
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.killAllTasks(req, res);
    });

    it("killAllTasksOfType - no param", function () {
        var res = new MockRes();
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.killAllTasksOfType(new MockReq(), res);
    });

    it("killAllTasksOfType - param not yes", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=ye";
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.killAllTasksOfType(req, res);
    });

    it("killAllTasksOfType - yes - no tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yes";
        req.params = {"type": "task"};
        req.scheduler = {launchedTasks: []};
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.killAllTasksOfType(req, res);
    });

    it("killAllTasksOfType - yes - with tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.params = {"type": "task"};
        req.url = "/?sure=yEs";
        req.scheduler = {
            launchedTasks: [
                {"name": "task-1234", "taskId": "23241", "runtimeInfo": {"agentId": "3243223sgd"}},
                {"name": "taski-1234", "taskId": "232g32gfd41", "runtimeInfo": {"agentId": "32432fs23sgd"}}]
        };
        req.scheduler.kill = function (taskId, agentId) {
            expect(taskId).to.be.a("string");
            expect(taskId).to.equal(req.scheduler.launchedTasks[0].taskId);
            expect(agentId).to.be.a("string");
        };
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.killAllTasksOfType(req, res);
    });

    it("healthCheck - undefined (error)", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        baseApi.healthCheck(req, res);
        expect(res.statusCode).to.equal(500);
    });

    it("healthCheck - OK", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.scheduler.lastHeartbeat = new Date().getTime();
        res.send = function (data) {
            expect(data).to.be.a("string");
            expect(data).to.equal("OK");
        };
        baseApi.healthCheck(req, res);
        expect(res.statusCode).to.equal(200);
    });

    it("healthCheck - OK - custom", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        process.env.HEALTH_TIMEOUT = 350;
        req.scheduler.lastHeartbeat = new Date().getTime() - (300 * 1000);
        res.send = function (data) {
            expect(data).to.be.a("string");
            expect(data).to.equal("OK");
        };
        baseApi.healthCheck(req, res);
        expect(res.statusCode).to.equal(200);
        delete process.env.HEALTH_TIMEOUT;
    });

    it("healthCheck - fail - custom", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        process.env.HEALTH_TIMEOUT = 290;
        req.scheduler.lastHeartbeat = new Date().getTime() - (300 * 1000);
        res.send = function (data) {
            expect(data).to.be.a("string");
            expect(data).to.equal("OK");
        };
        baseApi.healthCheck(req, res);
        expect(res.statusCode).to.equal(500);
        delete process.env.HEALTH_TIMEOUT;
    });
    it("restartFramework - working", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yEs";
        let sandbox = sinon.sandbox.create();
        sandbox.stub(process, "exit");
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.restartFramework(req, res);
        clock.tick(1000);
        clock.tick(1000);
        expect(process.exit.callCount).to.equal(1);
        clock.restore();
        sandbox.restore();

    });

    it("restartFramework - undefined", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?suare=yes";
        let sandbox = sinon.sandbox.create();
        sandbox.stub(process, "exit");
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.restartFramework(req, res);
        clock.tick(1000);
        expect(process.exit.callCount).to.equal(0);
        clock.restore();
        sandbox.restore();


    });

    it("restartFramework - invalid confirmation", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=ye";

        let sandbox = sinon.sandbox.create();
        sandbox.stub(process, "exit");
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.restartFramework(req, res);
        clock.tick(1000);
        expect(process.exit.callCount).to.equal(0);
        clock.restore();
        sandbox.restore();
    });

    it("getStats - no tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.scheduler.launchedTasks = [];
        req.frameworkConfiguration = {healthCheck: false};
        res.json = function (object) {
            expect(object.overall.cpus).to.equal(0);
            expect(object.overall.mem).to.equal(0);
            expect(object.overall.disk).to.equal(0);
            expect(object.overall.ports).to.equal(0);
            expect(object.overall.instances).to.equal(0);
        };
        baseApi.getStats(req, res);
    });

    it("getStats - tasks without healthcheck", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.frameworkConfiguration = {healthCheck: false};
        req.scheduler.launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}
        }, {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}}];
        res.json = function (object) {
            expect(object.overall.cpus).to.equal(1);
            expect(object.overall.mem).to.equal(256);
            expect(object.overall.disk).to.equal(100);
            expect(object.overall.ports).to.equal(4);
            expect(object.overall.instances).to.equal(2);
            expect(object.overall.unhealthyInstances).to.be.an("undefined");
        };
        baseApi.getStats(req, res);
    });

    it("getStats - tasks with healthcheck", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.frameworkConfiguration = {healthCheck: true};
        req.scheduler.launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}
        }, {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}}];
        res.json = function (object) {
            expect(object.overall.cpus).to.equal(1);
            expect(object.overall.mem).to.equal(256);
            expect(object.overall.disk).to.equal(100);
            expect(object.overall.ports).to.equal(4);
            expect(object.overall.instances).to.equal(2);
        };
        baseApi.getStats(req, res);
    });

    it("getStats - tasks with health and version", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.frameworkConfiguration = {healthCheck: true};
        req.scheduler.launchedTasks = [
            {name: "task-1321", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2}},
            {name: "task-215", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2}},
            {name: "task-234", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    runtimeInfo: {taskVersion: "1.0", healthy: false}},
            {name: "task-41", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    runtimeInfo: {taskVersion: "0.9", healthy: true}}
        ];
        res.json = function (object) {
            expect(object.overall.cpus).to.equal(2);
            expect(object.overall.mem).to.equal(512);
            expect(object.overall.disk).to.equal(200);
            expect(object.overall.ports).to.equal(8);
            expect(object.overall.instances).to.equal(4);
            expect(object.overall.updatedInstances).to.equal(1);
            expect(object.overall.unhealthyInstances).to.equal(1);
            expect(object.overall.healthyInstances).to.equal(1);
        };
        baseApi.getStats(req, res);
    });

    it("getStats - tasks with health and version with different order", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.scheduler = {};
        req.frameworkConfiguration = {healthCheck: true};
        req.scheduler.launchedTasks = [
            {name: "task-234", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    runtimeInfo: {taskVersion: "1.0", healthy: false}},
            {name: "task-1321", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2}},
            {name: "task-215", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2}},
            {name: "task-41", taskVersion: "1.0", resources:
                    {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    runtimeInfo: {taskVersion: "0.9", healthy: true}}
        ];
        res.json = function (object) {
            expect(object.overall.cpus).to.equal(2);
            expect(object.overall.mem).to.equal(512);
            expect(object.overall.disk).to.equal(200);
            expect(object.overall.ports).to.equal(8);
            expect(object.overall.instances).to.equal(4);
            expect(object.overall.updatedInstances).to.equal(1);
            expect(object.overall.unhealthyInstances).to.equal(1);
            expect(object.overall.healthyInstances).to.equal(1);
        };
        baseApi.getStats(req, res);
    });

    it("getTaskTypesStats - tasks", function () {
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {name: "task2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var pendingTasks = [{name: "task-123"}, {name: "task2-432"}, {name: "task"}, {name: "task2"}, {name: "task-4332"}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};

        var types = baseApi.getTaskTypesStats(tasks, launchedTasks, pendingTasks);
        expect(Object.keys(types[0].serials)).to.deep.equal(["123", "215", "1321", "4332"]);
        expect(Object.keys(types[1].serials)).to.deep.equal(["432", "4325"]);
        types.forEach(function (taskType) {
            console.log(taskType.type + " serials: " + Object.keys(taskType.serials));
            taskType.serials = [];
        });
        console.log(JSON.stringify(types));
        expect(types[0].runningInstances).to.equal(2);
        expect(types[0].pendingInstances).to.equal(3);
        expect(types[0].allInstances).to.equal(5);
        expect(types[0].type).to.equal("task");
        expect(types[0].allowScaling).to.be.true;
        expect(types[1].runningInstances).to.equal(2);
        expect(types[1].pendingInstances).to.equal(2);
        expect(types[1].allInstances).to.equal(4);
        expect(types[1].type).to.equal("task2");
        expect(types[1].allowScaling).to.be.undefined;
    });

    it("getTaskTypesStats - no tasks", function () {
        var launchedTasks = [];
        var tasks = {};

        var types = baseApi.getTaskTypesStats(tasks, launchedTasks, []);
        console.log(JSON.stringify(types));
        expect(types).to.be.an("array");
        expect(types).lengthOf(0);
    });

    it("taskRestart - no params", function () {
        var res = new MockRes();
        var req = new MockReq();
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.taskRestart(req, res);
    });

    it("taskRestart - blank params", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.params = {};
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.taskRestart(req, res);
    });

    it("taskRestart - restarting", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.params = {"task": "task232"};
        req.restartHelper = {
            restartTask: function (taskId, isRolling) {
                expect(isRolling).to.be.false;
                expect(taskId).to.equal("task232");
            }
        };
        res.json = function (object) {
            expect(object.status).to.be.a("string");
        };
        baseApi.taskRestart(req, res);
    });

    it("rollingRestart - working", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yEs";
        req.scheduler = {launchedTasks: []};
        req.restartHelper = {
            rollingRestart: function (array) {
                expect(array).to.be.an("array");
            }
        };
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.rollingRestart(req, res);
    });

    it("rollingRestart - working with tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=yEs";
        req.scheduler = {launchedTasks: [{allowScaling: true}, {allowScaling: false}]};
        req.restartHelper = {rollingRestart: function (array) {
            expect(array).to.be.an("array");
            expect(array).to.have.lengthOf(1);
        }};
        res.json = function (object) {
            expect(object.status).to.be.a("string");
            expect(object.status).to.equal("ok");
        };
        baseApi.rollingRestart(req, res);
    });

    it("rollingRestart - undefined", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?suare=yes";
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.rollingRestart(req, res);
    });

    it("rollingRestart - invalid confirmation", function () {
        var res = new MockRes();
        var req = new MockReq();
        req.url = "/?sure=ye";
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.rollingRestart(req, res);
    });

    it("scale tasks - up", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 3};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(1);
    });

    it("scale tasks - up ZK", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 3};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        req.scheduler.taskHelper = {};
        req.scheduler.taskHelper.saveTaskDef = function (def) {
            expect(def.instances).to.equal(3);
            expect(def.name).to.equal("task");
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(1);
    });

    it("scale tasks - noop", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 2};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks: [], logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };

        req.scheduler.logger.debug = function (message) {
            console.log("DEBUG: " + message);
        };

        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
    });

    it("scale tasks - up - scaling not allowed", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 3};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
    });

    it("scale tasks - down", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 2};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks: [], logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(2);
    });

    it("scale tasks - down ZK", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 2};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks: [], logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        req.scheduler.taskHelper = {};
        req.scheduler.taskHelper.saveTaskDef = function (def) {
            expect(def.instances).to.equal(2);
            expect(def.name).to.equal("task");
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(2);
    });

    it("scale tasks - under minimum", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true, instancesMinimum: 2}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 1};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks: [], logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(0);
    });

    it("scale tasks - zero", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 0};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks: [], logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(0);
    });

    it("scale tasks - 1 down only pending", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 4};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks:
                [{
                    name: "task-5",
                    taskId: "3412412fsags2ffsa",
                    resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    "runtimeInfo": {}
                }],
            logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(0);
    });

    it("scale tasks - 3 down pending - leader support", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "task-3.3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {leader: true}
        },
            {
                name: "task-1",
                taskId: "task-1.3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task-2",
                taskId: "task-2.3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {leader: true}
            },
            {
                name: "task-4",
                taskId: "task-4.3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {leader: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {doNotRestart: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 2};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks:
                [{
                    name: "task-5",
                    taskId: "task-5.3412412fsags2ffsa",
                    resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    "runtimeInfo": {}
                }],
            logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(0);
        expect(killed).to.equal(2);
    });

    it("scale tasks - 3 down pending", function () {
        var res = new MockRes();
        var req = new MockReq();
        var killed = 0;
        var launchedTasks = [{
            name: "task-3",
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-1", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        var tasks = {"task": {allowScaling: true}, "task2": {}};
        req.tasks = tasks;
        req.params = {type: "task", "instances": 3};
        req.scheduler = {
            launchedTasks: launchedTasks, pendingTasks:
                [{
                    name: "task-4",
                    taskId: "3412412fsags2ffsa",
                    resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                    "runtimeInfo": {}
                },
                    {
                        name: "tasks-4",
                        taskId: "3412412fsags2ffsa",
                        resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                        "runtimeInfo": {}
                    }],
            logger: {
                debug: function (message) {
                    console.log("DEBUG: " + message);
                }
            }
        };
        req.scheduler.kill = function name(taskId, agentId) {
            expect(taskId).to.be.a("string");
            killed += 1;
        };
        req.scheduler.logger.info = function (message) {
            console.log("INFO: " + message);
        };
        res.send = function () {
            expect(true).to.be.true;
        };
        baseApi.scaleTasks(req, res);
        expect(req.scheduler.pendingTasks).to.have.lengthOf(1);
        expect(killed).to.equal(1);
    });

    it("getTaskTypes - tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        req.tasks = {"task": {allowScaling: true}, "task2": {}};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        res.json = function (object) {
            expect(object).to.be.an("array");
        };
        var types = baseApi.getTaskTypes(req, res);
    });

    it("getTaskTypes - no tasks", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-1321",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {name: "task-215", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-2435",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        req.tasks = {};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        res.json = function (object) {
            expect(object).to.be.an("array");
        };
        var types = baseApi.getTaskTypes(req, res);
    });

    it("getLogs", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var sandbox = sinon.sandbox.create();
        sandbox.stub(fs, "createReadStream").callsFake(function (fileName, object) {
            expect(object).to.be.an("object");
            expect(fileName).to.be.a("string");
            expect(fileName).to.equal("/1234/432/test123");
            return {
                pipe: function (output) {
                    expect(output).to.equal(res);
                    fs.createReadStream.restore();
                    done();
                }
            };
        });
        req.scheduler = {"logger": {"transports": {"dailyRotateFile": {filename: "test123", "dirname": "/1234/432"}}}};
        baseApi.getLogs(req, res);
        sandbox.restore();
    });

    it("moduleList", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        res.send = function (result) {
            expect(result).to.equal(req.frameworkConfiguration.moduleList.join("\n") + "\n");
            done();
        };
        req.frameworkConfiguration = {
            "moduleList": ["mod1", "mod2"]
        };
        baseApi.moduleList(req, res);
    });

    it("leaderSortHelper", function () {
        var tasks = [];
        tasks.push({name: "task-1321", "runtimeInfo": {leader: true}});
        tasks.push({name: "task-3231", "runtimeInfo": {}});
        tasks.push({name: "task-3234"});
        tasks.push({name: "task-54375", "runtimeInfo": {leader: false}});
        tasks.push({name: "task-52375", "runtimeInfo": {leader: true}});
        tasks.sort(baseApi.leaderSortHelper);
        expect(tasks[3].name).to.equal("task-1321");
    });

    it("kill task - OK", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-3",
            allowScaling: true,
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {
                name: "task-1",
                allowScaling: true,
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        req.url = "/?sure=yEs";
        req.params = {task: "3412412fsaffsa"};
        req.tasks = {"task": {allowScaling: true}, "task2": {}};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        req.restartHelper = {
            killTask: function (taskId) {
                expect(taskId).to.be.a("string");
                return {result: "OK", name: launchedTasks[0].name};
            }
        };
        res.json = function (object) {
            expect(object.result).to.be.a("string");
            expect(object.result).to.equal("OK");
        };
        baseApi.taskKill(req, res);
    });

    it("kill task - no task", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [];
        req.url = "/?sure=yEs";
        req.params = {};
        req.tasks = {};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: []};
        res.json = function (object) {
            expect(object.error).to.be.a("string");
        };
        baseApi.taskKill(req, res);
    });

    it("kill task - OK ZK", function () {
        var res = new MockRes();
        var req = new MockReq();
        var launchedTasks = [{
            name: "task-3",
            allowScaling: true,
            taskId: "3412412fsaffsa",
            resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
            "runtimeInfo": {}
        },
            {
                name: "task-1",
                allowScaling: true,
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {name: "task-2", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}},
            {
                name: "task-4",
                taskId: "3412412fsags2ffsa",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {}
            },
            {
                name: "task2-5",
                resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2},
                "runtimeInfo": {restarting: true}
            },
            {name: "task2-4325", resources: {"cpus": 0.5, mem: 128, disk: 50, ports: 2}, "runtimeInfo": {}}];
        req.url = "/?sure=yEs";
        req.params = {task: "3412412fsaffsa"};
        req.tasks = {"task": {allowScaling: true}, "task2": {}};
        req.scheduler = {launchedTasks: launchedTasks, pendingTasks: [], taskHelper: {}};
        req.restartHelper = {
            killTask: function (taskId) {
                expect(taskId).to.be.a("string");
                launchedTasks[0].runtimeInfo.doNotRestart = true;
                return {result: "OK", name: launchedTasks[0].name};
            }
        };
        req.scheduler.taskHelper.saveTaskDef = function (def) {
            expect(def.instances).to.equal(3);
            expect(def.name).to.equal("task");
        };
        res.json = function (object) {
            expect(object.result).to.be.a("string");
            expect(object.result).to.equal("OK");
        };
        baseApi.taskKill(req, res);
    });
    it("getLogModules", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("array");
            expect(json).to.have.lengthOf.within(2,4);
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new RestartHelper(req.scheduler));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", propertyPrefix: "prefix", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", taskNameFilter: "^task-[0-9]$", checkOnSubscribe: false}));
        baseApi.getLogModules(req, res);
    });
    it("setLogLevel", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        req.params = {level: "debug", component: "RestartHelper"};
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("object");
            expect(json.status).to.equal("ok");
            expect(modules[2].logger.transports.dailyRotateFile.level).to.equal("debug");
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new RestartHelper(req.scheduler));
        baseApi.setLogLevel(req, res);
    });
    it("setLogLevel error", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        req.params = {level: "debug", components: "HealthHelper filter: task"};
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("object");
            expect(json.error).to.be.a("string");
            expect(modules[1].logger.transports.dailyRotateFile.level).to.equal("info");
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new RestartHelper(req.scheduler));
        baseApi.setLogLevel(req, res);
    });
    it("getLogModules", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("array");
            expect(json).to.have.lengthOf(4);
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new RestartHelper(req.scheduler));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", propertyPrefix: "prefix", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", taskNameFilter: "^task-[0-9]$", checkOnSubscribe: false}));
        baseApi.getLogModules(req, res);
    });
    it("setLogLevel", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        req.params = {level: "debug", component: "HealthHelper filter: task"};
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("object");
            expect(json.status).to.equal("ok");
            expect(modules[4].logger.transports.dailyRotateFile.level).to.equal("debug");
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new RestartHelper(req.scheduler));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", propertyPrefix: "prefix", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", taskNameFilter: "^task-[0-9]$", checkOnSubscribe: false}));
        baseApi.setLogLevel(req, res);
    });
    it("setLogLevel error", function (done) {
        var res = new MockRes();
        var req = new MockReq();
        var modules = [];
        req.params = {level: "debug", components: "HealthHelper filter: task"};
        res.json = function (json) {
            console.log(json);
            expect(json).to.be.an("object");
            expect(json.error).to.be.a("string");
            expect(modules[4].logger.transports.dailyRotateFile.level).to.equal("info");
            done();
        };
        req.scheduler = {logModules: [], updateLogModules: function () {
            req.scheduler.logModules = modules;
        }};
        modules.push(new RestartHelper(req.scheduler));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", propertyPrefix: "prefix", checkOnSubscribe: false}));
        modules.push(new TaskHealthHelper(req.scheduler, {url: "v1/health", taskNameFilter: "^task-[0-9]$", checkOnSubscribe: false}));
        baseApi.setLogLevel(req, res);
    });



});

describe('upgradeVersions function', function () {
    describe('When call upgrade version  and got 200 from upgrade service side', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 200,
                body: [{
                    params: [
                        {path: 'env.a1'},
                        {path: 'env.a2'},
                        {path: 'info.b1'},
                        {path: 'info.b2'},
                        {path: 'c'}
                    ]
                }]
            });

            process.env.a1 = 'default1';


            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };


            baseApi.upgradeVersions(req, res)
        });
        it('Should call upgradeService URL', function (done) {

            res.json = function (object) {

                //expect(object.result).to.be.a("string");
                expect(object.result).to.equal("OK");

            };

            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
            stubJsonFunction.withArgs(
                [{
                    "params": [
                        {path: 'env.a1', value: 'default1'},
                        {path: 'env.a2', value: undefined},
                        {path: 'info.b1', value: 'default2'},
                        {path: 'info.b2', value: undefined},
                        {path: 'c'}]
                }]
            ).calledOnce.should.equal(true);
            done();


        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/params/FrameworkType/versions?currentVersion=1.00',
                    method: 'GET',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });
        it('it should return 200 with upgrade service with default value(if exist)', function () {
            res.statusCode.should.equal(200);
        });


        after(function () {
            reverts.forEach(revert => revert())
            sandbox.restore();
        });
    });
    describe('When call upgrade version  and got 500 from upgrade service side', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 500,
                body: 'something bad happened'
            });

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            baseApi.upgradeVersions(req, res)
        });
        it('Should call upgradeService URL', function (done) {

            res.json = function (object) {

                //expect(object.result).to.be.a("string");
                expect(object.result).to.equal("OK");

            };

            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
            done();


        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/params/FrameworkType/versions?currentVersion=1.00',
                    method: 'GET',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });
        it('it should return 500 with correct message', function () {
            res.statusCode.should.equal(500);
        });
        after(function () {
            reverts.forEach(revert => revert())
            sandbox.restore();
        })

    })
    describe('When call upgrade version  and got an error', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields('error');

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            baseApi.upgradeVersions(req, res)
        });
        it('Should call upgradeService URL', function (done) {

            res.json = function (object) {

                //expect(object.result).to.be.a("string");
                expect(object.result).to.equal("OK");

            };

            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
            done();


        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/params/FrameworkType/versions?currentVersion=1.00',
                    method: 'GET',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });
        it('it should return 500 with correct message', function () {
            res.statusCode.should.equal(500);
        });
        after(function () {
            reverts.forEach(revert => revert())
            sandbox.restore();
        })

    });
});

describe('submitReviewRequest function', function () {
    describe('when call submitReviewRequest and got good response', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 200,
                body: [{
                    params: [
                        {path: 'env.a1'},
                        {path: 'env.a2'},
                        {path: 'info.b1'},
                        {path: 'info.b2'},
                        {path: 'c'}
                    ]
                }]
            });

            process.env.a1 = 'default1';


            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                version: '1.00',
                params: [
                    {
                        name: 'variableName1',
                        value: 'variableValue1'
                    },
                    {
                        name: 'variableName2',
                        value: 'variableValue2'
                    },
                ]
            };

            baseApi.submitReviewRequest(req, res)
        });
        it('Should call upgradeService URL', function (done) {

            res.json = function (object) {

                expect(object.result).to.equal("OK");

            };

            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
            stubJsonFunction.withArgs(
                [{
                    params: [
                        {path: 'env.a1'},
                        {path: 'env.a2'},
                        {path: 'info.b1'},
                        {path: 'info.b2'},
                        {path: 'c'}
                    ]
                }]
            ).calledOnce.should.equal(true);
            done();


        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/review/FrameworkType/FRAMEWORK_NAME/1.00',
                    method: 'POST',
                    body: {
                        'variableName1': 'variableValue1',
                        'variableName2': 'variableValue2'
                    },
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });
        it('Should return 200 with upgrade service with default value(if exist)', function () {
            res.statusCode.should.equal(200);
        });


        after(function () {
            reverts.forEach(revert => revert());
            sandbox.restore();
        })
    });
    describe('When call submitReviewRequest  and got 500 from upgrade service side', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 500,
                body: {'status': 'an error happened'}
            });

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                version: '1.00',
                params: [
                    {
                        name: 'variableName1',
                        value: 'variableValue1'
                    },
                    {
                        name: 'variableName2',
                        value: 'variableValue2'
                    },
                ]
            };

            baseApi.submitReviewRequest(req, res)
        });
        it('Should call upgradeService URL', function () {
            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/review/FrameworkType/FRAMEWORK_NAME/1.00',
                    method: 'POST',
                    body: {
                        'variableName1': 'variableValue1',
                        'variableName2': 'variableValue2'
                    },
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });

        it('it should return 500', function () {
            stubJsonFunction.withArgs({error: 'Got not good response from upgrade service'}).calledOnce.should.equal(true);
            res.statusCode.should.equal(500);
        });


        after(function () {
            reverts.forEach(revert => revert());
            sandbox.restore();
        })
    })
    describe('When call submitReviewRequest  and got an error', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields('error');

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                version: '1.00',
                params: [
                    {
                        name: 'variableName1',
                        value: 'variableValue1'
                    },
                    {
                        name: 'variableName2',
                        value: 'variableValue2'
                    },
                ]
            };

            baseApi.submitReviewRequest(req, res)
        });
        it('Should call upgradeService URL', function () {
            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/review/FrameworkType/FRAMEWORK_NAME/1.00',
                    method: 'POST',
                    body: {
                        'variableName1': 'variableValue1',
                        'variableName2': 'variableValue2'
                    },
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });

        it('it should return 500', function () {
            stubJsonFunction.withArgs({error: 'Failed to review upgrade request'}).calledOnce.should.equal(true);
            res.statusCode.should.equal(500);
        });


        after(function () {
            reverts.forEach(revert => revert());
            sandbox.restore();
        })
    });
});

describe('upgradeFramework function', function () {
    describe('When call upgradeFramework  and got 200 from upgrade service side', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 200,
                body: {'status': 'succeed to deploy'}
            });

            process.env.a1 = 'default1';


            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                'test': 'test',
                marathon: {
                    env: {
                        CONFIG_VERSION: '1234'
                    }
                }
            };


            baseApi.upgradeFramework(req, res)
        });
        it('Should call upgradeService URL', function (done) {

            res.json = function (object) {
                expect(object.result).to.equal("OK");
            };

            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
            stubJsonFunction.withArgs({'status': 'succeed to deploy'}).calledOnce.should.equal(true);
            done();


        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/upgrade/FrameworkType/FRAMEWORK_NAME/1234',
                    body: {
                        env: {
                            CONFIG_VERSION: '1234'
                        }
                    },
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });
        it('it should return 200 with upgrade service with default value(if exist)', function () {
            res.statusCode.should.equal(200);
        });


        after(function () {
            reverts.forEach(revert => revert())
            sandbox.restore();
        })
    });
    describe('When call upgradeFramework  and got 500 from upgrade service side', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields(undefined, {
                statusCode: 500,
                body: {'status': 'an error happend'}
            });

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                'test': 'test',
                marathon: {
                    env: {
                        CONFIG_VERSION: '1234'
                    }
                }
            };


            baseApi.upgradeFramework(req, res)
        });
        it('Should call upgradeService URL', function () {
            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/upgrade/FrameworkType/FRAMEWORK_NAME/1234',
                    body: {
                        env: {
                            CONFIG_VERSION: '1234'
                        }
                    },
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });

        it('it should return 500', function () {
            stubJsonFunction.withArgs({error: 'Got not good response from the upgrade service while trying to upgrade the framework'}).calledOnce.should.equal(true);
            res.statusCode.should.equal(500);
        });


        after(function () {
            reverts.forEach(revert => revert());
            sandbox.restore();
        })
    })
    describe('When call upgradeFramework  and got an error', function () {
        let res;
        let req;
        let stubGetUpgradeServiceUrl;
        let sandbox;
        let stubRequest;
        let stubJsonFunction;
        let reverts = []
        before(function () {
            res = new MockRes();
            req = new MockReq();
            sandbox = sinon.sandbox.create();
            stubGetUpgradeServiceUrl = sandbox.stub(configHelper, 'getUpgradeServiceUrl').resolves('upgradeServiceUrl');
            stubRequest = sandbox.stub().yields('error', undefined, undefined);

            process.env.a1 = 'default1';

            res.status = function (statusCode) {
                res.statusCode = statusCode;
                return res;
            }

            stubJsonFunction = sandbox.stub();
            res.json = stubJsonFunction;
            reverts.push(baseApi.__set__('request', stubRequest));
            process.env.FRAMEWORK_TYPE = 'FrameworkType';
            process.env.FRAMEWORK_NAME = 'FRAMEWORK_NAME'
            req.frameworkConfiguration = {
                configVersion: '1.00',
                b1: 'default2'
            };

            req.body = {
                'test': 'test',
                marathon: {
                    env: {
                        CONFIG_VERSION: '1234'
                    }
                }
            };


            baseApi.upgradeFramework(req, res)
        });
        it('Should call upgradeService URL', function () {
            stubGetUpgradeServiceUrl.calledOnce.should.equal(true);
        });
        it('Should call request with correct param', function () {
            stubRequest.withArgs(
                {
                    url: 'upgradeServiceUrl/upgrade/FrameworkType/FRAMEWORK_NAME/1234',
                    body: {
                        env: {
                            CONFIG_VERSION: '1234'
                        }
                    },
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    json: true
                }
            ).calledOnce.should.equal(true);
        });

        it('it should return 500', function () {
            stubJsonFunction.withArgs({error: 'Failed to send upgrade request'}).calledOnce.should.equal(true);
            res.statusCode.should.equal(500);
        });


        after(function () {
            reverts.forEach(revert => revert());
            sandbox.restore();
        })

    });
});

describe("Audit log tests", function () {
    var log = function (message) {
        console.log(message);
    };
    var scheduler = {logger: {error: log, debug: log, info: log}};
    var req;
    beforeEach(function () {
        req = {scheduler: scheduler};
    });
    it("Test user as object", function () {
        req.user = {displayName: "Test User"};
        baseApi.auditLog(req, "test");
    });

    it("Test user as string", function () {
        req.user = JSON.stringify({displayName: "Test User"});
        baseApi.auditLog(req, "test");
    });

    it("Test user with no display name", function () {
        req.user = JSON.stringify({email: "Test User"});
        baseApi.auditLog(req, "test");
    });
    it("Test user as malformed string", function () {
        req.user = "{displayName: \"Test User}";
        baseApi.auditLog(req, "test");
    });
    it("Test user as undefined", function () {
        baseApi.auditLog(req, "test");
    });
});

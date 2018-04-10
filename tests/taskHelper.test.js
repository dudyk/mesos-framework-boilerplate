"use strict";

// Project require
var Scheduler = require("../").Scheduler;
var helpers = require("../lib/helpers");
var TaskHelper = require("../lib/taskHelper");
var winston = require("winston");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var path = require("path");
var Mesos = require("../lib/mesos")().getMesos();

// Lib require for stubs
var zookeeper = require("node-zookeeper-client");

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");

describe("Task helper constructor", function () {
    it("Create TaskHelper based on scheduler instance", function () {
        var scheduler = Scheduler({});
        expect(scheduler).to.be.instanceOf(Scheduler);
        var taskHelper = TaskHelper(scheduler, {});
        expect(taskHelper.scheduler).to.be.instanceOf(Scheduler);
        expect(taskHelper.scheduler).to.deep.equal(scheduler);
    });

});
describe("Load tasks from Zk:", function () {

    var zkClient = zookeeper.createClient("127.0.0.1");
    var eventFired = false;
    var sandbox;
    var taskHelper;
    var logger;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    };

    util.inherits(SchedulerStub, EventEmitter);

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect").callsFake(function () {
            this.emit("connected");
        });
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null, 1);
        });

        eventFired = false;

        logger = helpers.getLogger(null, null, "debug");

        taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        }, {});

    });

    afterEach(function () {
        sandbox.restore();
    });

    it("ZK is down while getting children", function (done) {
        var schedulerStub = new SchedulerStub();

        schedulerStub.on("ready", function () {
            eventFired = true;
        });


        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
    });
    it("ZK is down while getting data", function (done) {

        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two"], 1);
        });


        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.NO_NODE), null, 1);
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
    });
    it("Succeed to load tasks but not found in pending (should kill)", function (done) {

        zkClient.getChildren.restore();

        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two"], 1);
        });

        // The container information object to be used
        var ContainerInfo = new Mesos.ContainerInfo(
            Mesos.ContainerInfo.Type.DOCKER, // Type
            null, // Volumes
            null, // Hostname
            new Mesos.ContainerInfo.DockerInfo(
                "mesoshq/flink:0.1.1", // Image
                Mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
                null, // PortMappings
                false, // Privileged
                null, // Parameters
                true, // forcePullImage
                null // Volume Driver
            )
        );

        var task1 = "{\"name\": \"task1\",\"taskId\": 1}";
        var task2 = "{\"name\": \"task2\",\"taskId\": 2}";

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, task1, 1);
            } else {
                cb(null, task2, 1);
            }
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [];
        schedulerStub.killTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(2);
    });
    it("Succeed to load tasks and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1 = {
            name: "/task1",
            taskId: "1",
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task3 = {
            name: "/task3",
            taskId: "3",
            runtimeInfo: {
                agentId: "12446",
                state: "TASK_FINISHED"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });

    it("Succeed to load tasks and found in pending - duplicate (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two", "three", "two", "four"], 1);
        });

        var task1 = {
            name: "/task1",
            taskId: "1",
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task4 = {
            name: "/task2-12",
            taskId: "2",
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task3 = {
            name: "/task3",
            taskId: "3",
            runtimeInfo: {
                agentId: "12446",
                state: "TASK_FINISHED"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else if (path.includes("four")) {
                cb(null, JSON.stringify(task4), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2, task2, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that 0 tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(4);
        expect(schedulerStub.reconcileTasks.length).to.equal(4);
    });
    it("Succeed to load tasks with environment and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1 = {
            name: "/task1",
            taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("HOST", "214214.1244.412421"),
                    new Mesos.Environment.Variable("PORT0", "3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            mesosName: "task1",
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("HOST", "214214.1244.412421"),
                    new Mesos.Environment.Variable("PORT0", "3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task3 = {
            name: "/task3",
            taskId: "3",
            runtimeInfo: {
                agentId: "12446",
                state: "TASK_FINISHED"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that 0 tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });
    it("Succeed to load tasks with partial environment and found in pending (should restore)", function (done) {
        var deleted = false;
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });

        var task1p = {
            name: "/task1",
            taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                null, // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2p = {
            name: "/task2",
            taskId: "2",
            "commandInfo": null,
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task1 = {
            name: "/task1",
            taskId: "1",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("HOST", "214214.1244.412421"),
                    new Mesos.Environment.Variable("PORT0", "3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR"),
                    new Mesos.Environment.Variable("HOST", "214214.1244.412421"),
                    new Mesos.Environment.Variable("PORT0", "3232")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };
        var task3 = {
            name: "/task3",
            taskId: "3",
            runtimeInfo: {
                agentId: "12446",
                state: "TASK_FINISHED"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else if (path.includes("two")) {
                cb(null, JSON.stringify(task2), 1);
            } else {
                cb(null, JSON.stringify(task3), 1);
            }
        });

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1p, task2p, task3];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;

        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);
        expect(deleted).to.be.true;

        // check that 0 tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(2);
        expect(schedulerStub.reconcileTasks.length).to.equal(2);
    });
    it("Succeed to load task list but fail to load task", function (done) {
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two"], 1);
        });

        var deleted = false;
        var task1 = {
            name: "/task1",
            taskId: "1",
            runtimeInfo: {
                agentId: "12345",
                state: "TASK_RUNNING"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            runtimeInfo: {
                agentId: "12346",
                state: "TASK_RUNNING"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, null, 1);
            }
        });
        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
            deleted = true;
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;
        taskHelper.loadTasks();

        setTimeout(function () {
            expect(deleted).to.be.true;
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(1);
        expect(schedulerStub.reconcileTasks.length).to.equal(1);
    });
    it("Succeed to load tasks and no tasks", function (done) {
        zkClient.getChildren.restore();
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, [], 1);
        });

        var task1 = {
            name: "/task1",
            taskId: "1",
            runtimeInfo: {
                agentId: "12345"
            }
        };
        var task2 = {
            name: "/task2",
            taskId: "2",
            runtimeInfo: {
                agentId: "12346"
            }
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, JSON.stringify(task2), 1);
            }
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;
        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(0);
        expect(schedulerStub.reconcileTasks.length).to.equal(0);
    });
    it("Succeed to load tasks and found in pending but no runtimeInfo (should delete from zk)", function (done) {

        zkClient.getChildren.restore();

        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["/one", "/two"], 1);
        });

        var task1 = {
            name: "/task1",
            taskId: "1"
        };
        var task2 = {
            name: "/task2",
            taskId: "2"
        };

        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.includes("one")) {
                cb(null, JSON.stringify(task1), 1);
            } else {
                cb(null, JSON.stringify(task2), 1);
            }
        });

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
        });

        var schedulerStub = new SchedulerStub();

        schedulerStub.pendingTasks = [task1, task2];
        schedulerStub.killTasks = [];
        schedulerStub.launchedTasks = [];
        schedulerStub.reconcileTasks = [];

        schedulerStub.on("ready", function () {
            eventFired = true;
        });

        taskHelper.scheduler = schedulerStub;
        taskHelper.loadTasks();

        setTimeout(function () {
            done();
        }, 100); //timeout with an error in one second

        expect(eventFired).to.equal(true);

        // check that tasks were killed
        expect(schedulerStub.killTasks.length).to.equal(0);
        expect(schedulerStub.launchedTasks.length).to.equal(0);
        expect(schedulerStub.reconcileTasks.length).to.equal(0);
    });
});

describe("Delete task:", function () {
    var sandbox;
    var zkClient = zookeeper.createClient("127.0.0.1");
    var taskHelper;
    var logger;

    before(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect").callsFake(function () {
            this.emit("connected");
        });
    });
    after(function (done) {
        sandbox.restore();
        done();
    });

    beforeEach(function () {

        logger = helpers.getLogger(null, null, "debug");

        //console.log(logger);

        taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        }, {
            "logger": logger
        });

    });

    it("Succeeds", function () {

        var logspy = sinon.spy(taskHelper.logger, "debug");

        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(null, null);
        });

        taskHelper.deleteTask("dummytask");
        sinon.assert.calledOnce(logspy);
    });

    it("ZK is down while trying to remove task", function () {

        var logspy = sinon.spy(taskHelper.logger, "error");

        zkClient.remove.restore();
        sandbox.stub(zkClient, "remove").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        taskHelper.deleteTask("dummytask");
        sinon.assert.calledOnce(logspy);
    });

});

describe("Save task:", function () {
    var sandbox;
    var zkClient = zookeeper.createClient("127.0.0.1");
    var taskHelper;
    var logger;

    before(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect").callsFake(function () {
            this.emit("connected");
        });
    });
    after(function (done) {
        sandbox.restore();
        done();
    });

    beforeEach(function () {

        logger = helpers.getLogger(null, null, "debug");

        taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        }, {logger: logger});

    });

    it("ZK create dir fails", function () {

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        var logspy = sinon.spy(taskHelper.logger, "error");

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(logspy);
    });

    it("ZK save data fails", function () {
        var logspy = sinon.spy(taskHelper.logger, "error");

        zkClient.mkdirp.restore();

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData").callsFake(function (path, data, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(logspy);
    });

    it("Succeeds", function () {

        var debugSpy = sinon.spy(taskHelper.logger, "debug");
        var errSpy = sinon.spy(taskHelper.logger, "error");

        zkClient.mkdirp.restore();
        zkClient.setData.restore();

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData").callsFake(function (path, data, cb) {
            cb(null, null);
        });

        taskHelper.saveTask("dummytask")
        sinon.assert.calledOnce(debugSpy);
        sinon.assert.notCalled(errSpy);
    });

});


describe("Save task def:", function () {
    var sandbox;
    var debugSpy;
    var errSpy;
    var logger = helpers.getLogger(null, null, "debug");
    var zkClient = zookeeper.createClient("127.0.0.1");
    var taskHelper;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect").callsFake(function () {
            this.emit("connected");
        });

        taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        }, {logger: logger});

        debugSpy = sandbox.spy(taskHelper.logger, "debug");
        errSpy = sandbox.spy(taskHelper.logger, "error");

    });

    afterEach(function (done) {
        sandbox.restore();
        done();
    });

    it("ZK create dir fails", function () {

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        taskHelper.saveTaskDef({
            "name": "dummytask",
            "instances": 3
        });
        sinon.assert.calledOnce(errSpy);
    });

    it("ZK save data fails", function () {

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData").callsFake(function (path, data, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null);
        });

        taskHelper.saveTaskDef({
            "name": "dummytask",
            "instances": 3
        });
        sinon.assert.calledOnce(errSpy);
    });

    it("Succeeds", function () {

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(null, null);
        });

        sandbox.stub(zkClient, "setData").callsFake(function (path, data, cb) {
            cb(null, null);
        });

        taskHelper.saveTaskDef({
            "name": "dummytask",
            "instances": 3
        });
        sinon.assert.calledOnce(debugSpy);
        sinon.assert.notCalled(errSpy);
    });

    it("Succeeds node exists", function () {

        sandbox.stub(zkClient, "mkdirp").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.NODE_EXISTS), null);
        });

        sandbox.stub(zkClient, "setData").callsFake(function (path, data, cb) {
            cb(null, null);
        });

        taskHelper.saveTaskDef({
            "name": "dummytask",
            "instances": 3
        });
        sinon.assert.calledOnce(debugSpy);
        sinon.assert.notCalled(errSpy);
    });

});


describe("load task def", function () {
    var sandbox;
    var debugSpy;
    var errSpy;
    var logger = helpers.getLogger(null, null, "error");
    var zkClient = zookeeper.createClient("127.0.0.1");
    var schedulerStub;
    var taskHelper;

    function SchedulerStub() {
        // Inherit from EventEmitter
        EventEmitter.call(this);
        return this;
    };

    util.inherits(SchedulerStub, EventEmitter);
    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        sandbox.stub(zkClient, "connect").callsFake(function () {
            this.emit("connected");
        });
        debugSpy = sandbox.spy(logger, "debug");
        errSpy = sandbox.spy(logger, "error");
        schedulerStub = new SchedulerStub();
        taskHelper = new TaskHelper({
            "zkClient": zkClient,
            "logger": logger,
            "pendingTasks": [],
            "launchedTasks": []
        }, {});
        taskHelper.scheduler = schedulerStub;
    });
    afterEach(function (done) {
        sandbox.restore();
        done();
    });

    it("no tasks", function () {
        taskHelper.loadTaskDefs();
    })

    it("ZK is down while getting children", function (done) {
        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.CONNECTION_LOSS), null, 1);
        });

        schedulerStub.populateTaskArrays = function (tasks) {
            done();
        }

        taskHelper.loadTaskDefs({});

    });
    it("ZK is down while getting data", function (done) {

        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two"], 1);
        });


        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            cb(zookeeper.Exception.create(zookeeper.Exception.NO_NODE), null, 1);
        });

        schedulerStub.populateTaskArrays = function (tasks) {
            done();
        }

        taskHelper.loadTaskDefs({
            "one": {
                "instances": 3
            }
        });
    });

    it("Success no children", function (done) {

        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, [], 1);
        });

        schedulerStub.populateTaskArrays = function (tasks) {
            expect(tasks["one"].instances).to.equal(3);
            done();
        }

        taskHelper.loadTaskDefs({
            "one": {
                "instances": 3
            },
            "three": {
                "instances": 3
            }
        });
    });
    it("Success", function (done) {

        sandbox.stub(zkClient, "getChildren").callsFake(function (path, cb) {
            cb(null, ["one", "two", "three"], 1);
        });


        sandbox.stub(zkClient, "getData").callsFake(function (path, cb) {
            if (path.match("one")) {
                cb(null, "{\"instances\": 4}", 1);
            } else if (path.match("three")) {
                cb(null, "{}", 1);
            }
        });

        schedulerStub.populateTaskArrays = function (tasks) {
            expect(tasks["one"].instances).to.equal(4);
            done();
        }

        taskHelper.loadTaskDefs({
            "one": {
                "instances": 3
            },
            "three": {
                "instances": 3
            }
        });
    });
});

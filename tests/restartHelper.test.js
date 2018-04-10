"use strict";

const fs = require("fs");
var _ = require("lodash");
var EventEmitter = require('events').EventEmitter;
var util = require("util");

var should = require('should');

var helpers = require("../lib/helpers");
var Scheduler = require("../lib/scheduler");
var Mesos = require("../lib/mesos")().getMesos();

var RestartHelper = require("../lib/restartHelper");

// Testing require
var expect = require('chai').expect;
var sinon = require("sinon");

describe("Restart task", function () {

    var sandbox;
    var scheduler;
    var clock;

    var ContainerInfo = new Mesos.ContainerInfo(
        Mesos.ContainerInfo.Type.DOCKER, // Type
        null, // Volumes
        null, // Hostname
        new Mesos.ContainerInfo.DockerInfo(
            "tobilg/mini-webserver", // Image
            Mesos.ContainerInfo.DockerInfo.Network.BRIDGE, // Network
            {
                "host_port": 8081,
                "container_port": 0,
                // Protocol to expose as (ie: tcp, udp).
                "protocol": "tcp"
            },
            false, // Privileged
            null,  // Parameters
            false, // forcePullImage
            null   // Volume Driver
        )
    );

    var runtimeInfo = {agentId: "agentId-before-restart"};

    var task1;

    var task2 = {
        "name": "vault-2",
        "taskId": "12220-3440-12532-my-task2",
        "containerInfo": _.cloneDeep(ContainerInfo),
        "runtimeInfo": _.cloneDeep(runtimeInfo),
        "commandInfo": new Mesos.CommandInfo(
            null, // URI
            new Mesos.Environment([
                new Mesos.Environment.Variable("FOO", "BAR2")
            ]), // Environment
            false, // Is shell?
            null, // Command
            null, // Arguments
            null // User
        ),
        "resources": {
            "cpus": 0.2,
            "mem": 128,
            "ports": 2,
            "disk": 10
        }
    };

    var task3 = {
        "name": "vault-3",
        "taskId": "12220-3440-12532-my-task3",
        "containerInfo": _.cloneDeep(ContainerInfo),
        "runtimeInfo": _.cloneDeep(runtimeInfo),
        "commandInfo": new Mesos.CommandInfo(
            null, // URI
            new Mesos.Environment([
                new Mesos.Environment.Variable("FOO", "BAR3")
            ]), // Environment
            false, // Is shell?
            null, // Command
            null, // Arguments
            null // User
        ),
        "resources": {
            "cpus": 0.2,
            "mem": 128,
            "ports": 2,
            "disk": 10
        }
    };

    var task4 = {
        "name": "vault2-3",
        "taskId": "12220-3440-12532-my-task3",
        "containerInfo": _.cloneDeep(ContainerInfo),
        "runtimeInfo": _.cloneDeep(runtimeInfo),
        "commandInfo": new Mesos.CommandInfo(
            null, // URI
            new Mesos.Environment([
                new Mesos.Environment.Variable("FOO", "BAR3")
            ]), // Environment
            false, // Is shell?
            null, // Command
            null, // Arguments
            null // User
        ),
        "resources": {
            "cpus": 0.2,
            "mem": 128,
            "ports": 2,
            "disk": 10
        }
    };

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        scheduler = sinon.createStubInstance(Scheduler);
        clock = sinon.useFakeTimers();
        task1 = {
            "name": "vault-1",
            "taskId": "12220-3440-12532-my-task",
            "containerInfo": _.cloneDeep(ContainerInfo),
            "runtimeInfo": _.cloneDeep(runtimeInfo),
            "commandInfo": new Mesos.CommandInfo(
                null, // URI
                new Mesos.Environment([
                    new Mesos.Environment.Variable("FOO", "BAR1")
                ]), // Environment
                false, // Is shell?
                null, // Command
                null, // Arguments
                null // User
            ),
            "resources": {
                "cpus": 0.2,
                "mem": 128,
                "ports": 2,
                "disk": 10
            }
        };
        task2.runtimeInfo = _.cloneDeep(runtimeInfo);
    });
    afterEach(function () {
        sandbox.restore();
        clock.restore();
    });

    it("setHealthCheck", function () {
        function logFunction(message) {         console.log(message);     }
        var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var logspy = sinon.spy(logger, "debug");

        scheduler.logger = logger;
        scheduler.launchedTasks = [];
        scheduler.tasks = [task1];
        var restartHelper = RestartHelper(scheduler, {logger: logger});
        expect(restartHelper.useHealthCheck).to.be.false;
        restartHelper.setHealthCheck({filter: "task", name: "healthy"});
        expect(restartHelper.useHealthCheck).to.be.true;
        expect(restartHelper.customHealthProperties).to.have.lengthOf(1);
    });

    it("Task was not found in launched", function () {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var logspy = sinon.spy(logger, "debug");

        scheduler.logger = logger;
        scheduler.launchedTasks = [];
        scheduler.tasks = [task1];
        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        restartHelper.restartTask("taskid-1111", false);

        sinon.assert.calledOnce(logspy);
        sinon.assert.calledWith(logspy, "Can't restart task that is not running.");

    });

    it("Task was not found in defined", function () {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var logspy = sinon.spy(logger, "debug");

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1];
        scheduler.tasks = [task4];
        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        sinon.assert.calledOnce(logspy);
        sinon.assert.calledWith(logspy, "Can't restart task that is not found." + JSON.stringify(scheduler.tasks));

    });

    it("Offer for cloned not arrived yet", function (end) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;

        scheduler.logger = logger;
        scheduler.tasks = [task1];
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        setTimeout(function () {
            expect(killSent).to.equal(false);
            end();
        }, 500);

        clock.tick(500)
    });

    it("Cloned was launched", function (done) {

        this.timeout(5000);

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.taskHelper = {};
        scheduler.taskHelper.saveTask = function (task) {
            expect(task).to.be.an("object");
        }
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        var interval = setInterval(function () {
            if (scheduler.pendingTasks.length > 0) {
                var task = scheduler.pendingTasks[0];
                scheduler.pendingTasks[0].runtimeInfo = {
                    agentId: "agent-1234",
                    executorId: "exec-1234",
                    state: "TASK_RUNNING"
                };
                scheduler.launchedTasks.push(scheduler.pendingTasks.splice(0, 1));
                scheduler.emit("task_launched", task);
            }
        }, 1000);

        setTimeout(function () {
            clearInterval(interval);
            expect(killSent).to.equal(true);
            done();
        }, 3000);

        clock.tick(1000);
        clock.tick(1000);
        clock.tick(1000);
    });

    it("Cloned was launched - healthy", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        var interval = setInterval(function () {
            if (scheduler.pendingTasks.length > 0) {
                var task = scheduler.pendingTasks[0];
                scheduler.pendingTasks[0].runtimeInfo = {
                    agentId: "agent-1234",
                    executorId: "exec-1234",
                    state: "TASK_RUNNING",
                    healthy: true
                };
                scheduler.launchedTasks.push(scheduler.pendingTasks.splice(0, 1));
                scheduler.emit("task_launched", task);
            }
        }, 1000);

        setTimeout(function () {
            clearInterval(interval);
            expect(killSent).to.equal(true);
            done();
        }, 3000);

        clock.tick(1000);
        clock.tick(1000);
        clock.tick(1000);
    });


    it("Cloned was launched - healthy - no suffix in name", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-?[0-9]*$", "name": "healthy"}], logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        var interval = setInterval(function () {
            if (scheduler.pendingTasks.length > 0) {
                var task = scheduler.pendingTasks[0];
                scheduler.pendingTasks[0].runtimeInfo = {
                    agentId: "agent-1234",
                    executorId: "exec-1234",
                    state: "TASK_RUNNING",
                    healthy: true
                };
                scheduler.launchedTasks.push(scheduler.pendingTasks.splice(0, 1));
                scheduler.emit("task_launched", task);
            }
        }, 1000);

        setTimeout(function () {
            clearInterval(interval);
            expect(killSent).to.equal(true);
            done();
        }, 3000);

        clock.tick(1000);
        clock.tick(1000);
        clock.tick(1000);
    });

    it("Cloned was launched - not healthy", function (done) {

        this.timeout(5000);

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.restartTask(task1.taskId, false);

        var interval = setInterval(function () {
            if (scheduler.pendingTasks.length > 0) {
                var task = scheduler.pendingTasks[0];
                scheduler.pendingTasks[0].runtimeInfo = {
                    agentId: "agent-1234",
                    executorId: "exec-1234",
                    state: "TASK_RUNNING"
                };
                scheduler.launchedTasks.push(scheduler.pendingTasks.splice(0, 1));
                scheduler.emit("task_launched", task);
            }
        }, 1000);

        setTimeout(function () {
            clearInterval(interval);
            expect(killSent).to.equal(false);
            done();
        }, 3000);

        clock.tick(1000);
        clock.tick(1000);
        clock.tick(1000);
    });

    it("Rolling restart", function (done) {

        this.timeout(16000);

        var rollingRestartEnded = false;

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};

        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1, task2, task3];
        var tasks = scheduler.launchedTasks.slice(0);
        scheduler.pendingTasks = [];
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};

        scheduler.kill = function (taskId, agentId) {
            scheduler.logger.debug("Task kill request was sent " + taskId)
            var task = findTask(taskId, scheduler.launchedTasks);
            scheduler.launchedTasks.splice(scheduler.launchedTasks.indexOf(task), 1);
        };

        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        scheduler.on("endrollingrestart", function () {
            rollingRestartEnded = true;
        });

        restartHelper.rollingRestart(tasks);

        // Offer was recieved
        var interval = setInterval(function () {
            var task;
            if (scheduler.pendingTasks.length > 0) {
                task = scheduler.pendingTasks[0];
                scheduler.pendingTasks[0].runtimeInfo = {
                    agentId: "agentId-after-restart",
                    executorId: "exec-1234",
                    state: "TASK_RUNNING"
                };
                scheduler.launchedTasks.push(scheduler.pendingTasks.splice(0, 1)[0]);
                scheduler.emit("task_launched", task);
            }
        }, 1000);


        scheduler.on("endrollingrestart", function () {
            clearInterval(interval);
            expect(rollingRestartEnded).to.equal(true);

            for (var i=0; i<scheduler.launchedTasks.length; i++){
                expect(scheduler.launchedTasks[i].runtimeInfo.agentId).to.equal("agentId-after-restart");
            }

            scheduler.logger.debug("launched:" + JSON.stringify(scheduler.launchedTasks));
            scheduler.logger.debug("pending:" + JSON.stringify(scheduler.pendingTasks));
            done();
        });

        for (var i=0; i<16 ; i++){
            clock.tick(1000);
        }
    });

    it("Rolling restart - verify that take the first node", function (done) {
        let tasks = [{taskId:'first'},{taskId:'second'},{taskId:'third'}];
        let sandbox = sinon.sandbox.create();
        let stubRestartTask = sandbox.stub();
        let StubDebug = sandbox.stub();
        let logger = {debug:StubDebug};

        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();
        scheduler.logger = logger;

        this.restartTask  = stubRestartTask;
        let restartHelper = new RestartHelper(scheduler, {logger: logger,restartTask:stubRestartTask});
        restartHelper.restartTask  = stubRestartTask;
        restartHelper.rollingRestart(tasks);
        stubRestartTask.withArgs('first').calledOnce.should.equal(true);
        done();
    });

    it("Kill task - not scaleable", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        scheduler.launchedTasks = [task1, task2];
        scheduler.pendingTasks = [];
        task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.killTask(task1.taskId, false);

        setTimeout(function () {
            expect(killSent).to.equal(false);
            done();
        }, 1000);

        clock.tick(1000);
    });

    it("Kill task - scaleable alone", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        task1.allowScaling = true;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.killTask(task1.taskId, false);

        setTimeout(function () {
            expect(killSent).to.equal(true);
            done();
        }, 1000);

        clock.tick(1000);
    });
    it("Kill task - scaleable pending", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        task1.allowScaling = true;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [task2];
        task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.killTask(task1.taskId, false);

        setTimeout(function () {
            expect(killSent).to.equal(true);
            done();
        }, 1000);

        clock.tick(1000);
    });

    it("Kill task - scaleable launched", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        task1.allowScaling = true;
        scheduler.launchedTasks = [task1, task2];
        scheduler.pendingTasks = [];
        //task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        console.log(restartHelper.killTask(task1.taskId, false));

        setTimeout(function () {
            expect(killSent).to.equal(true);
            done();
        }, 1000);

        clock.tick(1000);
    });

    it("Kill task - scaleable launched restarting", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        task1.allowScaling = true;
        scheduler.launchedTasks = [task1, task2];
        scheduler.pendingTasks = [];
        task2.runtimeInfo.doNotRestart = true;
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {logger: logger});

        console.log(restartHelper.killTask(task1.taskId, false));

        setTimeout(function () {
            expect(killSent).to.equal(true);
            done();
        }, 1000);

        clock.tick(1000);
    });

    it("Kill task - scaleable not running", function (done) {

        function logFunction(message) {         console.log(message);     }     var logger = {info: logFunction, error: logFunction, debug: logFunction};
        var killSent = false;
        function SchedulerStub() {
            // Inherit from EventEmitter
            EventEmitter.call(this);
            return this;
        };

        util.inherits(SchedulerStub, EventEmitter);

        var scheduler = new SchedulerStub();

        scheduler.logger = logger;
        task1.allowScaling = true;
        scheduler.launchedTasks = [task1];
        scheduler.pendingTasks = [];
        task1.name = "vault";
        scheduler.tasks = [task1];
        scheduler.options = {"useZk": "false"};
        scheduler.kill = function (taskId, agentId) {
            killSent = true;
        };

        var restartHelper = new RestartHelper(scheduler, {"useHealthCheck": true, "customHealthProperties": [{"filter": "^vault-[0-9]+$", "name": "healthy"}], logger: logger});

        restartHelper.killTask(task2.taskId, false);

        setTimeout(function () {
            expect(killSent).to.equal(false);
            done();
        }, 1000);

        clock.tick(1000);
    });



});


function findTask(taskId, tasks) {
    // Iterate over tasks
    for (var index = 0; index < tasks.length; index++) {
        var task = tasks[index];
        if (task.taskId === taskId) {
            return task;
        }
    }
    return null;
}

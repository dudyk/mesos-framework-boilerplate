var helpers = require("../lib/helpers");
var mesos = require("../lib/mesos")().getMesos();

var winston = require("winston");
var http = require("http");

var expect = require("chai").expect;
var sinon = require("sinon");
var MockReq = require("mock-req");
var MockRes = require("mock-res");

describe("helpers", function() {
    describe("checkBooleanString", function () {
        var cases = [
            // No defaultValue true false words
            {string: "true", result: true},
            {string: "  true  ", result: true},
            {string: "  TrUe  ", result: true},
            {string: "  false  ", result: false},
            {string: "false", result: false},
            {string: "  FaLse  ", result: false},
            {string: "", result: false},

            // defaultValue true false words
            {string: "true", result: true, defaultValue: true},
            {string: "  true  ", result: true, defaultValue: true},
            {string: "  TrUe  ", result: true, defaultValue: true},
            {string: "  false  ", result: false, defaultValue: true},
            {string: "false", result: false, defaultValue: true},
            {string: "  FaLse  ", result: false, defaultValue: true},
            {string: "", result: true, defaultValue: true},
            {string: " ", result: true, defaultValue: true},

            // Number 1
            {string: "1", result: true},
            {string: "1", result: true, defaultValue: true},
            {string: "1", result: true, defaultValue: false},
            {string: "1.0", result: true},
            {string: "1.0", result: true, defaultValue: true},
            {string: "1.0", result: true, defaultValue: false},
            {string: "-1", result: true},
            {string: "-1", result: true, defaultValue: true},
            {string: "-1", result: true, defaultValue: false},
            {string: "-1.0", result: true},
            {string: "-1.0", result: true, defaultValue: true},
            {string: "-1.0", result: true, defaultValue: false},

            // Number 0
            {string: "0", result: false},
            {string: "0", result: false, defaultValue: true},
            {string: "0", result: false, defaultValue: false},
            {string: "0.0", result: false},
            {string: "0.0", result: false, defaultValue: true},
            {string: "0.0", result: false, defaultValue: false},
            {string: "-0", result: false},
            {string: "-0", result: false, defaultValue: true},
            {string: "-0", result: false, defaultValue: false},
            {string: "-0.0", result: false},
            {string: "-0.0", result: false, defaultValue: true},
            {string: "-0.0", result: false, defaultValue: false},

            // Number 354(.234)
            {string: "354", result: true},
            {string: "354", result: true, defaultValue: true},
            {string: "354", result: true, defaultValue: false},
            {string: "354.234", result: true},
            {string: "354.234", result: true, defaultValue: true},
            {string: "354.234", result: true, defaultValue: false},
            {string: "-354", result: true},
            {string: "-354", result: true, defaultValue: true},
            {string: "-354", result: true, defaultValue: false},
            {string: "-354.234", result: true},
            {string: "-354.234", result: true, defaultValue: true},
            {string: "-354.234", result: true, defaultValue: false},

            // Number .04364
            {string: ".04364", result: true},
            {string: ".04364", result: true, defaultValue: true},
            {string: ".04364", result: true, defaultValue: false},
            {string: "-.04364", result: true},
            {string: "-.04364", result: true, defaultValue: true},
            {string: "-.04364", result: true, defaultValue: false},

            // Special cases
            {string: undefined, result: false},
            {string: undefined, result: true, defaultValue: true},
            {string: undefined, result: false, defaultValue: false},
            {string: null, result: false},
            {string: null, result: true, defaultValue: true},
            {string: null, result: false, defaultValue: false}
        ];
        cases.forEach(function (testCase) {
            it("string: \"" + testCase.string + "\" defaultValue: " + testCase.defaultValue + " expected result: " + testCase.result, function () {
                expect(helpers.checkBooleanString(testCase.string, testCase.defaultValue)).to.equal(testCase.result);
            });
        });
    });
    it("Test the CloneDeep helper", function () {
        var objects = [{ "a": 1 }, { "b": 2 }];

        var deep = helpers.cloneDeep(objects);
        expect(deep[0] === objects[0]).to.be.false;
    });
    describe("sortTasksByPriority", function () {
        it("Sort the task array with 2 submitted tasks", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true},
                    task2:{isSubmitted:true}});
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(2);
        });
        it("Sort the task array with 3 submitted tasks with priority", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(3);
        });
        it("Sort the task array with 3 submitted tasks with priority and multiple instances", function () {
            var tasks = helpers.sortTasksByPriority({
                    task1:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task3:{isSubmitted:true, priority:1, instances:2}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(4);
        });
        it("Sort the task array with 3 submitted tasks with priority and out of order names", function () {
            var tasks = helpers.sortTasksByPriority({
                    task3:{isSubmitted:true, priority:1},
                    task2:{isSubmitted:true, priority:2},
                    task1:{isSubmitted:true, priority:1}
                });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(3);
            expect(tasks[0].name).to.equal("task1-1");
        });
        it("Sort the task array with static ports out of order", function () {
            var tasks = helpers.sortTasksByPriority({
                task1: {isSubmitted: true, priority: 1, resources: {ports: 2, staticPorts: [9001, 8000]}}
            });
            expect(tasks).to.be.an("array");
            expect(tasks).to.have.lengthOf(1);
            expect(tasks[0].resources.staticPorts[0]).to.equal(8000);
        });
        it("Sort the task array with static ports out of order - no ports set", function () {
            var errorSet = false;
            try {
                helpers.sortTasksByPriority({
                    task1: {isSubmitted: true, priority: 1, resources: {staticPorts: [9001, 8000]}}
                });
            } catch (error) {
                expect(error).to.be.an("error");
                errorSet = true;
            }
            expect(errorSet).to.be.true;
        });
        it("Sort the task array with static ports out of order - not enough ports set", function () {
            var errorSet = false;
            try {
                helpers.sortTasksByPriority({
                    task1: {isSubmitted: true, priority: 1, resources: {ports: 1, staticPorts: [9001, 8000]}}
                });
            } catch (error) {
                expect(error).to.be.an("error");
                errorSet = true;
            }
            expect(errorSet).to.be.true;
        });
    });
    describe("Enum enumeration", function () {
        it("Simple enumeration", function () {
            var enumerated = helpers.stringifyEnums(new mesos.scheduler.Call(
            null,
            "SUBSCRIBE",
            null));
            expect(enumerated.type).to.equal("SUBSCRIBE");
        });
        it("Simple enumeration invalid value", function () {
            var base = new mesos.scheduler.Call(
            null,
            "SUBSCRIBE",
            null);
            base.type = 13;
            var enumerated = helpers.stringifyEnums(base);

            expect(enumerated.type).to.equal(13);
        });
        it("Recursive enumeration", function () {
            var ContainerInfo = new mesos.ContainerInfo(
                mesos.ContainerInfo.Type.DOCKER, // Type
                null, // Volumes
                null, // Hostname
                new mesos.ContainerInfo.DockerInfo(
                    "alpine", // Image
                    mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
                    null,  // PortMappings
                    false, // Privileged
                    [{
                    "key": "cap-add",
                    "value": "IPC_LOCK"
                    }],  // Parameters
                    true, // forcePullImage
                    null   // Volume Driver
                )
            );
            var enumerated = helpers.stringifyEnumsRecursive(ContainerInfo);
            expect(enumerated.type).to.equal("DOCKER");
            expect(enumerated.docker.network).to.equal("HOST");
        });
        it("Recursive enumeration of cloned message", function () {
            var ContainerInfo = new mesos.ContainerInfo(
                mesos.ContainerInfo.Type.DOCKER, // Type
                null, // Volumes
                null, // Hostname
                new mesos.ContainerInfo.DockerInfo(
                    "alpine", // Image
                    mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
                    null,  // PortMappings
                    false, // Privileged
                    [{
                    "key": "cap-add",
                    "value": "IPC_LOCK"
                    }],  // Parameters
                    true, // forcePullImage
                    null   // Volume Driver
                )
            );
            console.log(JSON.stringify(ContainerInfo));
            var ContainerInfoClone = helpers.cloneDeep(ContainerInfo);
            console.log(JSON.stringify(ContainerInfoClone));
            var enumerated = helpers.stringifyEnumsRecursive(ContainerInfoClone);
            console.log(JSON.stringify(enumerated));
            console.log(JSON.stringify(ContainerInfoClone));
            expect(enumerated.type).to.equal("DOCKER");
            expect(enumerated.docker.network).to.equal("HOST");
            expect(enumerated.type).to.not.equal(ContainerInfoClone.type);
            expect(enumerated.docker.network).to.not.equal(ContainerInfoClone.docker.network);
        });
        it("Recursive enumeration of cloned message in array", function () {
            var ContainerInfo = new mesos.ContainerInfo(
                mesos.ContainerInfo.Type.DOCKER, // Type
                null, // Volumes
                null, // Hostname
                new mesos.ContainerInfo.DockerInfo(
                    "alpine", // Image
                    mesos.ContainerInfo.DockerInfo.Network.HOST, // Network
                    null,  // PortMappings
                    false, // Privileged
                    [{
                    "key": "cap-add",
                    "value": "IPC_LOCK"
                    }],  // Parameters
                    true, // forcePullImage
                    null   // Volume Driver
                )
            );
            var taskInfos = [new mesos.TaskInfo(
                "fdasdfdsafdsa", // Task name
                new mesos.TaskID("ffsdfdsfsda32532fdsagd"),   // TaskID
                new mesos.AgentID("fdsfdsfds"),             // AgentID
                null,          // Resources
                null,   // ExecutorInfo
                null,     // CommandInfo
                ContainerInfo, // ContainerInfo
                new mesos.HealthCheck(new mesos.HealthCheck.HTTP(80, "/health", 200)),     // HealthCheck
                null, // KillPolicy
                null, // Data
                null, // Labels
                null  // DiscoveryInfo
            )];

            var launchMessage = new mesos.Offer.Operation(
                mesos.Offer.Operation.Type.LAUNCH,
                new mesos.Offer.Operation.Launch(taskInfos)
            );
            console.log(JSON.stringify(launchMessage));
            var enumerated = helpers.stringifyEnumsRecursive(launchMessage);
            console.log(JSON.stringify(enumerated));
            console.log(JSON.stringify(launchMessage));
            expect(enumerated.launch.task_infos[0].container.type).to.equal("DOCKER");
            expect(enumerated.launch.task_infos[0].container.docker.network).to.equal("HOST");
            expect(enumerated.launch.task_infos[0].type).to.not.equal(ContainerInfo.type);
            expect(enumerated.launch.task_infos[0].container.docker.network).to.not.equal(ContainerInfo.docker.network);
        });
    });
    describe("getLogger", function () {
        it("Default logger", function () {
            var logger = helpers.getLogger();
            expect(logger).to.be.an("Object");
            expect(logger).to.be.an.instanceof(winston.Logger);
        });
        it("Filename logger", function () {
            var logger = helpers.getLogger("logs","tests.log");
            expect(logger).to.be.an("Object");
            expect(logger).to.be.an.instanceof(winston.Logger);
        });
    });
    describe("doRequest", function() {
        beforeEach(function() {
            this.request = sinon.stub(http, "request");
        });
        afterEach(function() {
            http.request.restore();
        });
        it("OK state", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(202);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).to.be.a("null");
                expect(jsonResult.body).to.equal(data);
                expect(jsonResult.statusCode).to.equal(202);
                done();
            });
        });
        it("OK state with stream-id", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(202);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            this.requestTemplate = {
                host: "sfdsdfsfds",
                port: "5050",
                path: "/api/v1/scheduler",
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                    }
                };
            this.mesosStreamId = "123233523512";
            helpers.doRequest.call(this, "",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).to.be.a("null");
                expect(jsonResult.body).to.equal(data);
                expect(jsonResult.statusCode).to.equal(202);
                done();
            });
        });
        it("400 error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
        });
        it("req error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            res.end();
            var req = new MockReq({ method: "POST" });
            this.request.returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
            req.emit("error", data);
        });
        it("res error", function(done) {
            var data = "OK";
            var res = new MockRes();
            res.writeHead(400);
            res.write(data);
            //res.end();
            var req = new MockReq({ method: "POST" });
            this.request.callsArgWith(1, res).returns(req);
            helpers.doRequest("",function (error, jsonResult) {
                console.log("Error is: " + JSON.stringify(error));
                console.log("Result is:" + JSON.stringify(jsonResult));
                expect(error).not.to.be.a("null");
                expect(jsonResult).to.be.a("null");
                done();
            });
            res.emit("error", data);
        });
    });
    describe("Task cleanup", function () {
        it("Task with all fields set", function () {
            var runtimeInfo = {agentId: "agentId-before-cleanup"};
            var task = {
                "name": "TASK-1",
                "taskId": "12220-3440-12532-my-task",
                "mesosName": "TASK",
                "containerInfo": {},
                "runtimeInfo": runtimeInfo,
                "commandInfo": new mesos.CommandInfo(
                    null, // URI
                    new mesos.Environment([
                        new mesos.Environment.Variable("FOO", "BAR1"),
                        new mesos.Environment.Variable("HOST", "fsdfds.fdsds"),
                        new mesos.Environment.Variable("HOST1", "fdsffd.dfsfds"),
                        new mesos.Environment.Variable("1HOST", "dsgdsgs.dsfgs"),
                        new mesos.Environment.Variable("PORT2", "32423"),
                        new mesos.Environment.Variable("PORT", "32423"),
                        new mesos.Environment.Variable("PORT342", "32423"),
                        new mesos.Environment.Variable("1PORT2", "32423"),
                        new mesos.Environment.Variable(" PORT2", "32423"),
                        new mesos.Environment.Variable("PORT3a21", "342")
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
            helpers.taskCleanup(task);
            expect(task.taskId).to.be.undefined;
            expect(task.runtimeInfo).to.be.undefined;
            expect(task.mesosName).to.be.undefined;
            expect(task.commandInfo.environment.variables).lengthOf(7);
            expect(task.isSubmitted).to.be.false;
        });
        it("Task with no environment", function () {
            var runtimeInfo = {agentId: "agentId-before-cleanup"};
            var task = {
                "name": "TASK-1",
                "taskId": "12220-3440-12532-my-task",
                "mesosName": "TASK",
                "containerInfo": {},
                "runtimeInfo": runtimeInfo,
                "commandInfo": new mesos.CommandInfo(
                    null, // URI
                    new mesos.Environment([]), // Environment
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
            helpers.taskCleanup(task);
            expect(task.taskId).to.be.undefined;
            expect(task.runtimeInfo).to.be.undefined;
            expect(task.mesosName).to.be.undefined;
            expect(task.commandInfo.environment.variables).lengthOf(0);
            expect(task.isSubmitted).to.be.false;
        });
    });
    it("compare task ids", function () {
        var ids = ["fw.task-1.32432-dsfds-342-fds",
                "fw.task-11.32432-dsfds-342-fds",
                "fw.task-9.32432-dsfds-342-fds",
                "fw.task2-11.32432-dsfds-342-fds",
                "fw.task-1.1.32432-dsfds-342-fds",
                "fw.task-1132432-dsfds-342-fds",
                "fw.task-381.32432-dsfds-342-fds",
                "fw.task-131.32432-dsfds-342-fds",
                "fw.task-381.32432-dsfds-342-fds",
                "fw.task2-8.32432-dsfds-342-fds"];
        var idsSorted = ["fw.task-1.1.32432-dsfds-342-fds",
                "fw.task-1.32432-dsfds-342-fds",
                "fw.task-9.32432-dsfds-342-fds",
                "fw.task-11.32432-dsfds-342-fds",
                "fw.task-1132432-dsfds-342-fds",
                "fw.task-131.32432-dsfds-342-fds",
                "fw.task-381.32432-dsfds-342-fds",
                "fw.task-381.32432-dsfds-342-fds",
                "fw.task2-8.32432-dsfds-342-fds",
                "fw.task2-11.32432-dsfds-342-fds"];

        var result = ids.sort(helpers.compareTaskIds);
        expect(result).lengthOf(ids.length);
        console.log(result);
        expect(result).to.deep.equal(idsSorted);
    });
});

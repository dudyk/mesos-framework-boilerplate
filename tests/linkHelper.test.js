"use strict";

// NPM modules
var _ = require("lodash");
var rewire = require("rewire");
var fs = require("fs");

// Project modules
var linkHelper = rewire("../lib/linkHelper");
var mesosDNS = require("mesos-dns-node-resolver");

var helpers;

// Instantiate the mesos-framework module related objects
if (fs.existsSync("../mesos-framework")) {
    helpers = require("../mesos-framework").helpers;
} else {
    helpers = require("mesos-framework").helpers;
}

// Testing require
var expect = require("chai").expect;
var sinon = require("sinon");

describe("Link Helper", function () {
    var oldEnv;
    var sandbox;
    var clock;
    var rewires = [];
    var scheduler = {logger: {error: function (text) {
        console.log("error:" + text);
    }}};
    beforeEach(function () {
        oldEnv = _.cloneDeep(process.env);
        sandbox = sinon.sandbox.create();
        clock = sinon.useFakeTimers();
    });
    afterEach(function () {
        process.env = oldEnv;
        sandbox.restore();
        clock.restore();
        rewires.forEach(function (restore) {
            restore();
        });
        rewires = [];
    });
    it("Populate link config - with array", function () {
        process.env.FRAMEWORK_LINKS = JSON.stringify([
            {checkURL: "32121", linkHostname: "fdsfdsf.dsffsd"},
            {checkURL: "", linkHostname: "fdsfdsf.dsffsd"},
            {checkURL: "fdsfsd", linkHostname: ""},
            {checkURL: "", linkHostname: ""},
            {checkURL: ""},
            {linkHostname: ""},
            {},
            []
        ]);
        var links = linkHelper.populateLinkConfig();
        expect(links).to.have.lengthOf(1);
    });
    it("Populate link config - with invalid JSON", function () {
        process.env.FRAMEWORK_LINKS = JSON.stringify([
            {checkURL: "32121", linkHostname: "fdsfdsf.dsffsd"},
            {checkURL: "", linkHostname: "fdsfdsf.dsffsd"},
            {checkURL: "fdsfsd", linkHostname: ""},
            {checkURL: "", linkHostname: ""},
            {checkURL: ""},
            {linkHostname: ""},
            []
        ]) + "{";
        var links = linkHelper.populateLinkConfig();
        expect(links).to.have.lengthOf(0);
    });
    it("Populate link config - with no JSON", function () {
        process.env.FRAMEWORK_LINKS = "";
        var links = linkHelper.populateLinkConfig();
        expect(links).to.have.lengthOf(0);
    });
    it("Populate link config - with no var", function () {
        var links = linkHelper.populateLinkConfig();
        expect(links).to.have.lengthOf(0);
    });
    it("LinkCheckSetup - 1 link healthy", function () {
        var resolve = sandbox.stub(mesosDNS, "resolve");
        var doHealthRequest = sandbox.stub(helpers, "doHealthRequest");
        var links = [{checkURL: "32121", linkHostname: "fdsfdsf.dsffsd"}];
        resolve.callsArgWith(3, null, [{host: "fsdfsd", "ports": [32432, 432432]}]);
        doHealthRequest.callsArg(1);
        rewires.push(linkHelper.__set__("helpers", {"doHealthRequest": doHealthRequest}));
        rewires.push(linkHelper.__set__("mesosDNS", {"resolve": resolve}));
        rewires.push(linkHelper.__set__("setInterval", setInterval));
        linkHelper.linkCheckSetup(scheduler, {"frameworkLinks": links});
        clock.tick(30000);
        expect(links).to.have.lengthOf(1);
        expect(links[0].healthy).to.be.true;
        expect(links[0].failTries).to.equal(0);
    });
    it("LinkCheckSetup - 1 link unhealthy", function () {
        var resolve = sandbox.stub(mesosDNS, "resolve");
        var doHealthRequest = sandbox.stub(helpers, "doHealthRequest");
        var links = [{checkURL: "32121", linkHostname: "fdsfdsf.dsffsd"}];
        resolve.callsArgWith(3, null, [{host: "fsdfsd", "ports": [32432, 432432]}]);
        doHealthRequest.callsArg(2);
        rewires.push(linkHelper.__set__("helpers", {"doHealthRequest": doHealthRequest}));
        rewires.push(linkHelper.__set__("mesosDNS", {"resolve": resolve}));
        rewires.push(linkHelper.__set__("setInterval", setInterval));
        linkHelper.linkCheckSetup(scheduler, {"frameworkLinks": links});
        clock.tick(30000);
        expect(links).to.have.lengthOf(1);
        expect(links[0].healthy).to.be.false;
        expect(links[0].failTries).to.equal(1);
        clock.tick(30000);
        expect(links).to.have.lengthOf(1);
        expect(links[0].healthy).to.be.false;
        expect(links[0].failTries).to.equal(2);
    });
    it("LinkCheckSetup - 1 link not found", function () {
        var resolve = sandbox.stub(mesosDNS, "resolve");
        var doHealthRequest = sandbox.stub(helpers, "doHealthRequest");
        var links = [{checkURL: "32121", linkHostname: "fdsfdsf.dsffsd"}];
        resolve.callsArgWith(3, true, null);
        doHealthRequest.callsArg(2);
        rewires.push(linkHelper.__set__("helpers", {"doHealthRequest": doHealthRequest}));
        rewires.push(linkHelper.__set__("mesosDNS", {"resolve": resolve}));
        rewires.push(linkHelper.__set__("setInterval", setInterval));
        linkHelper.linkCheckSetup(scheduler, {"frameworkLinks": links});
        clock.tick(30000);
        expect(links).to.have.lengthOf(1);
        expect(links[0].healthy).to.be.undefined;
        expect(links[0].failTries).to.be.undefined;
        clock.tick(30000);
        expect(links).to.have.lengthOf(1);
        expect(links[0].healthy).to.be.undefined;
        expect(links[0].failTries).be.undefined;
    });
    it("LinkCheckSetup - 0 links", function () {
        var resolve = sandbox.stub(mesosDNS, "resolve");
        var doHealthRequest = sandbox.stub(helpers, "doHealthRequest");
        var links = [];
        resolve.callsArgWith(3, true, null);
        doHealthRequest.callsArg(2);
        rewires.push(linkHelper.__set__("helpers", {"doHealthRequest": doHealthRequest}));
        rewires.push(linkHelper.__set__("mesosDNS", {"resolve": resolve}));
        rewires.push(linkHelper.__set__("setInterval", setInterval));
        linkHelper.linkCheckSetup(scheduler, {"frameworkLinks": links});
        clock.tick(30000);
    });
    it("LinkCheckSetup - bad link", function () {
        var resolve = sandbox.stub(mesosDNS, "resolve");
        var doHealthRequest = sandbox.stub(helpers, "doHealthRequest");
        var links = [{linkHostname: "fdsfdsf.dsffsd"}];
        resolve.callsArgWith(3, true, null);
        doHealthRequest.callsArg(2);
        rewires.push(linkHelper.__set__("helpers", {"doHealthRequest": doHealthRequest}));
        rewires.push(linkHelper.__set__("mesosDNS", {"resolve": resolve}));
        rewires.push(linkHelper.__set__("setInterval", setInterval));
        linkHelper.linkCheckSetup(scheduler, {"frameworkLinks": links});
        clock.tick(30000);
    });
});
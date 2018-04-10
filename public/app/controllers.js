"use strict";
var controllers = angular.module('mesos-framework-ui.controllers', []);

controllers.controller('MainController', function ($scope, $interval, $route, $window, config, FrameworkStats, FrameworkInformation, FrameworkConfiguration, Tasks, TaskTypes, RollingRestart, Restart, FrameworkRestart, KillAll, KillAllType, Kill, ModuleInfo, PendingTasks) {
    $scope.$route = $route;

    /** Responsiveness helpers **/
    var mobileView = 992;
    $scope.getWidth = function () {
        return window.innerWidth;
    };
    $scope.$watch($scope.getWidth, function (newValue, oldValue) {
        if (newValue >= mobileView) {
            $scope.toggle = true;
        } else {
            $scope.toggle = false;
        }
    });
    $scope.toggleSidebar = function () {
        $scope.toggle = !$scope.toggle;
    };
    window.onresize = function () {
        $scope.$apply();
    };

    $scope.orderType = "taskId";
    $scope.orderReverse = false;
    $scope.moduleInfo = ModuleInfo.moduleInfo;

    $scope.taskElipsis = true;

    $scope.setModuleInfo = function (moduleInfo) {
        Object.getOwnPropertyNames(moduleInfo).forEach(function (name) {
            $scope.moduleInfo[name] = moduleInfo[name];
        });
    };

    /** Framework configuration **/
    var fetchFrameworkConfiguration = function () {
        FrameworkConfiguration.get(function (configuration) {
            $scope.name = configuration.frameworkName;
            if (configuration.user === "") {
                $window.location.href = "./login";
            }
            $scope.configuration = configuration.toJSON();
            $scope.serviceUnavailable = false;
            if ($scope.configuration && $scope.configuration.frameworkLinks && $scope.configuration.frameworkLinks.length) {
                var nameRegEx = new RegExp($scope.configuration.frameworkName, "i");
                if (nameRegEx.test(window.location.pathname)) {
                    $scope.configuration.frameworkLinks.forEach(function (link) {
                        var linkedFrameworkName = link.linkHostname.split(".")[0];
                        if (link.linkedFrameworkName) {
                            linkedFrameworkName = link.linkedFrameworkName;
                        }
                        link.href = window.location.protocol + '//' + window.location.host + window.location.pathname.replace(nameRegEx, linkedFrameworkName);
                    });
                } else {
                    $scope.configuration.frameworkLinks.forEach(function (link) {
                        var locationSplit = window.location.host.split(".");
                        var appNameSplit = $scope.configuration.appName.split("/");
                        var i;
                        var hrefHost = link.linkHostname;
                        for (i = appNameSplit.length - 1; i < locationSplit.length; i += 1) {
                            hrefHost += "." + locationSplit[i];
                        }
                        link.href = window.location.protocol + '//' + hrefHost + window.location.pathname;
                    });
                }
            }
            if ($scope.moduleInfo && $scope.moduleInfo.configure && $scope.moduleInfo.configure.length) {
                $scope.moduleInfo.configure.forEach(function (configFunction) {
                    configFunction();
                });
            }
        }, function (status) {
            $scope.serviceUnavailable = true;
        });
    };

    /** Framework info **/
    var fetchFrameworkInfo = function () {
        FrameworkInformation.get(function (info) {
            $scope.info = info.toJSON();
        });
    };


    /** Framework stats **/
    var fetchFrameworkStats = function () {
        FrameworkStats.get(function (stats) {
            $scope.stats = stats.toJSON();
            $scope.stats.types = Object.getOwnPropertyNames($scope.stats.byType);
        });
    };

    fetchFrameworkConfiguration();
    $interval(fetchFrameworkConfiguration, config.application.reloadInterval);

    fetchFrameworkInfo();

    fetchFrameworkStats();
    $interval(fetchFrameworkStats, config.application.reloadInterval);

    /** Tasks monitoring **/
    $scope.tasks = [];
    $scope.nodes = [];
    $scope.statesPercentage = [];

    $scope.taskStatesMapping = {
        TASK_STAGING: {
            progressBarType: "warning"
        },
        TASK_RUNNING: {
            progressBarType: "success"
        },
        TASK_RUNNING_UNKNOWN: {
            progressBarType: "warning"
        },
        TASK_RUNNING_UNHEALTHY: {
            progressBarType: "danger"
        },
        TASK_RUNNING_HEALTHY: {
            progressBarType: "success"
        },
        TASK_RUNNING_OUTDATED: {
            progressBarType: "warning"
        },
        TASK_FAILED: {
            progressBarType: "warning"
        },
        TASK_ERROR: {
            progressBarType: "danger"
        },
        TASK_STARTING: {
            progressBarType: "primary"
        },
        TASK_FINISHED: {
            progressBarType: "info"
        },
        TASK_LOST: {
            progressBarType: "danger"
        }
    };

    var updateStatesPercentage = function (states, tasksData) {
        var statesPercentage = [];
        angular.forEach(states, function (value, key) {
            if ($scope.taskStatesMapping[key]) {
                statesPercentage.push({
                    state: key,
                    type: $scope.taskStatesMapping[key].progressBarType,
                    percentage: Math.round(value.length / tasksData.length * 100)
                });
            }
        });
        statesPercentage.sort(function (a, b) {
            return (a.state < b.state) ? 1 : -1;
        });
        statesPercentage.forEach(function (value, index) {
            if (index + 1 < statesPercentage.length) {
                value.style = "border-right: 3px solid black;";
            }
        });
        $scope.statesPercentage = statesPercentage;
    };

    var fetchTaskTypes = function () {
        $scope.tasksByType = [];
        var types = $scope.stats.types.slice(0);
        for (var i = 0; i < types.length; i++) {
            var type = types[i];
            $scope.tasksByType[type.split(".")[0]] = $scope.tasks.filter(task => {
                    return task.name.split(".")[0].replace(/-[0-9]{1,2}/, "") === type.split(".")[0]
                }
            )
            ;
        }

        $scope.tasksByType["all"] = $scope.tasks;
    };

    var updateTasks = function (data) {
        $scope.tasks = data;

        fetchTaskTypes();

        var states = {};
        angular.forEach(data, function (value, key) {
            var task = value.toJSON();
            var state = task.runtimeInfo.state;
            if (state === "TASK_RUNNING") {
                var healthy = true;
                var outdated = false;
                if ($scope.configuration.healthCheck) {
                    healthy = task.runtimeInfo.healthy;
                    switch (healthy) {
                        case true:
                            state = "TASK_RUNNING_HEALTHY";
                            break;
                        case false:
                            state = "TASK_RUNNING_UNHEALTHY";
                            break;
                        default:
                            state = "TASK_RUNNING_UNKNOWN";
                    }
                }
                if (task.taskVersion && task.taskVersion !== task.runtimeInfo.taskVersion) {
                    outdated = true;
                }
                if (healthy && outdated) {
                    state = "TASK_RUNNING_OUTDATED";
                }
            }
            states.hasOwnProperty(state) || (states[state] = []);
            states[state].push(task.runtimeInfo.network.ip);
        });
        updateStatesPercentage(states, data);
    };

    var fetchTasks = function () {
        Tasks.query(function (tasks) {
            $scope.tasks = [];
            updateTasks(tasks);
            var webUiEnabled = (config.webUi && config.webUi.enabled ? config.webUi.enabled : false);
            if (webUiEnabled) {
                var webUiUrls = [];
                tasks.forEach(function (task) {
                    var tempTask = task.toJSON();
                    if (tempTask.name === config.webUi.name) {
                        webUiUrls.push("http://" + tempTask.runtimeInfo.network.ip + ":" + tempTask.runtimeInfo.network.ports[config.webUi.portIndex]);
                    }
                });
                if (webUiUrls.length > 0) {
                    $scope.webUi = {
                        enabled: true
                    };
                    if (config.webUi.random) {
                        // Select random endpoint
                        $scope.webUi.url = webUiUrls[Math.floor(Math.random() * webUiUrls.length)];
                    } else {
                        // Use first one
                        $scope.webUi.url = webUiUrls[0];
                    }
                }
            } else {
                $scope.webUi = {
                    enabled: false
                };
            }

        });
    };

    var fetchPendingTasks = function () {
        PendingTasks.query(function (pendingTasks) {
            // todo : need to handle response , i think that i have better way to do that
            $scope.pendingTasks = pendingTasks;

        })
    };


    $scope.frameworkRestart = function () {
        var confirmation = prompt("Are you sure you want to restart the framework?\nThis may cause service downtime, please write yes in the box and click OK if you are sure.");
        console.log("Confirmation: " + confirmation);
        FrameworkRestart.save({
            sure: confirmation
        }, {});
    };

    $scope.restart = function (taskId) {
        if ($scope.moduleInfo && $scope.moduleInfo.restartHooks && $scope.moduleInfo.restartHooks.length > 0) {
            var index;
            for (index = 0; index < $scope.moduleInfo.restartHooks.length; index += 1) {
                if (!$scope.moduleInfo.restartHooks[index](taskId)) {
                    return;
                }
            }
        }
        console.log("Restarting task id: " + taskId);
        Restart.save({
            task: taskId
        }, {});
    };

    $scope.rollingRestart = function () {
        if ($scope.moduleInfo && $scope.moduleInfo.rollingRestartHooks && $scope.moduleInfo.rollingRestartHooks.length > 0) {
            var index;
            for (index = 0; index < $scope.moduleInfo.rollingRestartHooks.length; index += 1) {
                if (!$scope.moduleInfo.rollingRestartHooks[index]()) {
                    return;
                }
            }
        }

        var confirmation = prompt("Are you sure you want to restart all tasks?\nThis may cause service downtime, please write yes in the box and click OK if you are sure.");
        console.log("Confirmation: " + confirmation);
        RollingRestart.save({
            sure: confirmation
        }, {});
    };

    $scope.kill = function (taskId) {
        var confirmation;
        if ($scope.moduleInfo && $scope.moduleInfo.killHooks && $scope.moduleInfo.killHooks.length > 0) {
            var index;
            for (index = 0; index < $scope.moduleInfo.killHooks.length; index += 1) {
                confirmation = $scope.moduleInfo.killHooks[index](taskId);
                if (!confirmation) {
                    return;
                }
            }
        }
        var message = "Are you sure you want to kill task: " + taskId + "? \nThis may cause service downtime and possibly data loss, please write yes in the box and click OK if you are sure.";
        if (confirmation === undefined) {
            confirmation = prompt(message);
        }
        Kill.save({
            sure: confirmation,
            task: taskId
        }, {});
    };

    $scope.killAll = function () {
        var index;
        var confirmation;
        if ($scope.moduleInfo && $scope.moduleInfo.killAllHooks && $scope.moduleInfo.killAllHooks.length > 0) {
            for (index = 0; index < $scope.moduleInfo.killAllHooks.length; index += 1) {
                confirmation = $scope.moduleInfo.killAllHooks[index]();
                if (!confirmation) {
                    return;
                }
            }
        }
        var message = "Are you sure you want to kill all tasks? \nThis WILL cause service downtime and possibly data loss, please write yes in the box and click OK if you are sure.";
        if (confirmation === undefined) {
            confirmation = prompt(message);
        }
        console.log("Confirmation: " + confirmation);
        KillAll.save({
            sure: confirmation
        }, {});
    };

    $scope.selectedType = null;

    $scope.currentSelectedTypeClick = function (type) {
        if ($scope.selectedType === type) {
            $scope.selectedType = null;
        } else {
            $scope.selectedType = type;
        }
    }

    $scope.killAllType = function (type) {
        var index;
        var confirmation;
        if ($scope.moduleInfo && $scope.moduleInfo.killAllTypeHooks && $scope.moduleInfo.killAllTypeHooks.length > 0) {
            for (index = 0; index < $scope.moduleInfo.killAllTypeHooks.length; index += 1) {
                confirmation = $scope.moduleInfo.killAllTypeHooks[index](type);
                if (!confirmation) {
                    return;
                }
            }
        }
        var message = "Are you sure you want to kill all " + type + " tasks? \nThis WILL cause service downtime and possibly data loss, please write yes in the box and click OK if you are sure.";
        if (confirmation === undefined) {
            confirmation = prompt(message);
        }
        console.log("Confirmation: " + confirmation);
        KillAllType.save({
            sure: confirmation,
            type: type
        }, {});
    };

    $scope.getTaskUptime = function (uptime) {
        if (uptime) {
            var diff = parseInt((Date.now() - uptime) / 1000);
            var days = parseInt(diff / 60 / 60 / 24);
            diff -= days * 24 * 60 * 60;
            var hours = parseInt(diff / 60 / 60);
            diff -= hours * 60 * 60;
            var mins = parseInt(diff / 60);
            diff -= mins * 60;
            var seconds = diff;
            var uptimeString = days.toString() + ":" + hours.toString() + ":" + (mins < 10 ? "0" : "") + mins.toString() + "." + (seconds < 10 ? "0" : "") + seconds.toString();
            return uptimeString;
        } else {
            return "unknown";
        }
    };

    $scope.checkLeaderCoherency = function () {
        for (var i = 0; i < $scope.tasks.length; i++) {
            var leaderAddress = $scope.tasks[i].runtimeInfo.leaderAddress;
            if (!leaderAddress || (leaderAddress === "self")) {
                continue;
            }
            var tasksFound = $scope.tasks.filter((task) => {
                    return task.runtimeInfo.network.ip === leaderAddress;
                })
            ;

            if (tasksFound.length === 0) {
                return false;
            }
        }

        return true;
    }

    $scope.sorter = function (a) {

        return parseInt(a[$scope.orderType].replace(/^\D+/g, '')); // gets number from a string
    }


    fetchTasks();
    fetchPendingTasks();
    $interval(fetchTasks, config.application.reloadInterval);
    $interval(fetchPendingTasks, config.application.reloadInterval);
});

controllers.controller('OverviewController', function ($scope) {

});

controllers.controller('ScalingController', function ($scope, $interval, config, Scaling, TaskTypes) {

    /** Framework info **/
    var fetchTaskTypes = function () {
        TaskTypes.getArray(function (types) {
            console.log(types.list);
            $scope.taskTypes = types.list;
        });
    };

    fetchTaskTypes();
    //$interval(fetchTaskTypes, config.application.reloadInterval);

    $scope.scaling = {
        nodes: $scope.$parent.configuration.ElasticsearchNodes,
        result: null
    };
    $scope.scalingSubmit = function () {
        if ($scope.scaling.nodes) {
            Scaling.save({}, {
                type: $scope.scaling.nodes
            });
        }
    };

    $scope.scale = function (type, instances) {
        console.log(type + " - " + instances);
        Scaling.save({
            type: type,
            instances: instances
        }, {});
    };

});

controllers.controller('LogsController', function ($scope, $interval, Logs, LogLevel, LogModules) {

    /** Logs **/
    $scope.fetchLogs = function () {
        Logs.getText(function (response) {
            console.log(response.content);
            $scope.logs = response.content; //.split("\n").join("<br>");
        });
    };

    $scope.setLogs = function (level, component) {
        LogLevel.save({
            level: level,
            component: component
        }, {});
    };

    $scope.setAllLogs = function (level) {
        $scope.logModules.forEach(function (logModule) {
            LogLevel.save({
                level: level,
                component: logModule.name
            }, {});
        });
        setTimeout(function () {
            $scope.updateLogModules();
        }, 2000);
    };

    $scope.updateLogModules = function () {
        LogModules.getLogModules(function (response) {
            console.log(response.content);
            $scope.logModules = JSON.parse(response.content);
        });
    }

    // preset log level allValue if all modules have the same log level
    var presetAllLogs = function () {
        LogModules.getLogModules(function (response) {
            console.log(response.content);
            $scope.logModules = JSON.parse(response.content);
            var logLevelFirstModule = $scope.logModules[0].value;
            for (var i = 1; i < $scope.logModules.length; i++) {
                if ($scope.logModules[i].value !== logLevelFirstModule) {
                    $scope.allValue = "mixed";
                    return;
                }
            }

            $scope.allValue = logLevelFirstModule;
        });
    }

    if ($scope.$parent.stopLogsInterval) {
        $interval.cancel($scope.$parent.stopLogsInterval);
    }

    $scope.updateLogModules();
    presetAllLogs();
});

controllers.controller('TasksController', function ($scope) {
    $scope.filterTaskTypes = function (data) {
        return $scope.$parent.stats.byType &&
            $scope.$parent.stats.byType[data] &&
            $scope.$parent.stats.byType[data].instances > 1;
    };

    $scope.filterAllTaskTypes = function (data) {
        return $scope.$parent.stats.byType &&
            $scope.$parent.stats.byType[data];
    };

    $scope.searchTaskTypes = function (data) {

        var foundTimes = 0;
        for (var key in $scope.$parent.stats.byType) {
            if (key === $scope.searchField) {
                foundTimes++;
            }
        }

        if (foundTimes === 1) {
            $scope.$parent.selectedType = data;
        }

        return data;
    };

    $scope.getIconStyle = function (type) {
        if (type === $scope.$parent.selectedType) {
            return {"color": "green"};
        } else {
            return {"color": "black"};
        }
    }

    $scope.getIconClass = function (type) {
        if (type === $scope.$parent.selectedType) {
            return "fa fa-caret-down fa-2";
        } else {
            return "fa fa-caret-right fa-2";
        }
    }

    $scope.getTableCellStyle = function (type) {
        if (type === $scope.$parent.selectedType) {
            return {'font-size': '15px', 'font-style': 'italic'}
        } else {
            return {'font-size': '15px'}
        }
    }


    $scope.getTableTypeHeaderStyle = function (type) {
        var style = "";
        if ($scope.$parent.stats.byType &&
            $scope.$parent.stats.byType[type] &&
            ($scope.$parent.stats.byType[type].hasOwnProperty("healthyInstances") ||
                $scope.$parent.stats.byType[type].hasOwnProperty("updatedInstances"))) {

            if ($scope.$parent.stats.byType[type].hasOwnProperty("healthyInstances")) {
                if ($scope.$parent.stats.byType[type].unhealthyInstances > 0) {
                    // There are unhealthy instances
                    style = "danger";
                } else if ($scope.$parent.stats.byType[type].healthyInstances < $scope.$parent.stats.byType[type].instances) {
                    // The number of healthy instances is lower than the total
                    style = "warning";
                }
            }
            if (style === "" && $scope.$parent.stats.byType[type].hasOwnProperty("updatedInstances") && $scope.$parent.stats.byType[type].instances > $scope.$parent.stats.byType[type].updatedInstances) {
                // There are outdated instances
                style = "warning";
            }
        }
        return style;
    }

    $scope.getTableRowStyle = function (task, type) {
        var style = "";
        if ($scope.$parent.stats.byType &&
            $scope.$parent.stats.byType[type] &&
            ($scope.$parent.stats.byType[type].hasOwnProperty("healthyInstances") ||
                $scope.$parent.stats.byType[type].hasOwnProperty("updatedInstances"))) {

            if ($scope.$parent.stats.byType[type].hasOwnProperty("healthyInstances")) {
                if (task.runtimeInfo.healthy === false) {
                    style = "danger";
                } else if (task.runtimeInfo.healthy !== true) {
                    style = "warning";
                }
            }
            if (style === "" && task.taskVersion && task.taskVersion !== task.runtimeInfo.taskVersion) {
                style = "warning";
            }
        }
        return style;
    }
});

controllers.controller('UpgradeController', function ($scope, UpgradeVersions, SubmitUpgradeReview, SubmitUpgradeFramework) {

    $scope.versionParams = [];
    $scope.enableUpgradeView = false;
    $scope.enableSubmitButton = false;
    $scope.enableSummaryAction = false;
    $scope.enableRequiredActionSection = false;
    $scope.versions = [{'version': 'Loading...'}];


    // load upgrade versions
    UpgradeVersions.getVersions(function (versions) {
        $scope.versions = JSON.parse(versions.content)
    })

    // load variable for relevant upgrade version
    $scope.loadVariables = function (versionId) {
        var relevantVersion = $scope.versions.filter(function (version) {
            return version.version === versionId;
        });
        console.log(relevantVersion[0].params);
        var myEl = angular.element(document.querySelectorAll('#versionVariableForum'));
        myEl.empty();
        $scope.versionParams = [];
        $scope.versionSummary = relevantVersion[0].summary;
        $scope.versionActions = relevantVersion[0].actions;
        $scope.version = relevantVersion[0].version;
        relevantVersion[0].params.forEach(function (paramName) {
            $scope.versionParams.push({
                name: paramName.name,
                path: paramName.path,
                description: paramName.desc,
                value: paramName.value,
                isDisabled: paramName.configurable ? false : true
            })
        });


        console.log(relevantVersion[0].params);

        $scope.enableSubmitButton = true;
        $scope.enableSummaryAction = true;

        if ($scope.versionActions != null) {
            $scope.enableRequiredActionSection = true;
        } else {
            $scope.disableRequiredActionSection = false;
        }
    }

    // submit update request for review
    $scope.submitViewUpgradeRequest = function () {
        console.log($scope.versionParams);
        SubmitUpgradeReview.submit(
            {version: $scope.version, params: $scope.versionParams}
            , function (response) {
                console.log(response);
                $scope.upgradeJsonObject = JSON.stringify(response, undefined, 4);
            })

        $scope.enableUpgradeView = true;
    }

    // upgrade framework
    $scope.submitUpgradeRequest = function () {
        var overall = $scope.$parent.stats.overall;
        if (overall.updatedInstances && overall.instances != overall.updatedInstances) {
            var confirmation = prompt("Are you sure you want to upgrade the framework?\nThere are outdated tasks that need to restart, please write yes in the box and click OK if you are sure.");
            if (confirmation.toLowerCase() === 'yes') {
                console.log('The user submit upgrade reqeust although there is outdated task..');
                SubmitUpgradeFramework.upgrade($scope.upgradeJsonObject, function (response) {
                    console.log(response)
                })
            }
        } else {
            SubmitUpgradeFramework.upgrade($scope.upgradeJsonObject, function (response) {
                console.log(response)
            })
        }
    }
})

controllers.controller('ConfigurationController', function ($scope) {

});

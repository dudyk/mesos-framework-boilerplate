"use strict";
var services = angular.module('mesos-framework-ui.services', []);

var baseURL = window.location.protocol + '//' + window.location.host + window.location.pathname;

services.factory('FrameworkConfiguration', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/framework/configuration';
    return $resource(URL);
});

services.factory('FrameworkInformation', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/framework/info';
    return $resource(URL);
});

services.factory('FrameworkStats', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/framework/stats';
    return $resource(URL);
});

services.factory('FrameworkRestart', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/framework/restart';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('Scaling', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/types/:type/scale/:instances';
    return $resource(URL, {}, {
        save: {
            method: 'PUT'
        }
    });
});

services.factory('Restart', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/:task/restart';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('RollingRestart', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/rollingRestart';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('Kill', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/:task/kill';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('KillAll', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/killAll';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('KillAllType', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/types/:type/killAll';
    return $resource(URL, {}, {
        save: {
            method: 'POST'
        }
    });
});

services.factory('Tasks', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/launched';
    return $resource(URL);
});

services.factory('PendingTasks', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/pending';
    return $resource(URL);
})

services.factory('TaskTypes', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/tasks/types';
    return $resource(URL, {}, {
        'getArray': {
            transformResponse: function (data, headersGetter, status) {
                return {
                    list: angular.fromJson(data)
                };
            }
        }
    });
});

services.factory('Logs', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/logs';
    return $resource(URL, {}, {
        'getText': {
            transformResponse: function (data, headersGetter, status) {
                return {
                    content: data
                };
            }
        }
    });
});


services.factory('LogLevel', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/logs/:component/:level';
    return $resource(URL, {}, {
        save: {
            method: 'PUT'
        }
    });
});

services.factory('UpgradeVersions', function ($resource,config) {
    var URL = baseURL + config.application.apiPrefix + '/upgradeVersions';
    return $resource(URL,{},{
        getVersions:{
            transformResponse: function (data,headersGetter,status) {
                return {content : data};
            }
        }
    })
});

services.factory('SubmitUpgradeReview',function ($resource,config) {
    var URL = baseURL + config.application.apiPrefix + '/submitReviewRequest';
    return $resource(URL, {}, {
            submit: {
                method: 'PUT'
            }
        }
    )
});

services.factory('SubmitUpgradeFramework',function ($resource,config) {
    var URL = baseURL + config.application.apiPrefix + '/upgradeFramework';
    return $resource(URL,{},{
        upgrade: {
            method: 'PUT'
        }
    })
})

services.factory('LogModules', function ($resource, config) {
    var URL = baseURL + config.application.apiPrefix + '/logs/modules';
    return $resource(URL, {}, {
        'getLogModules': {
            transformResponse: function (data, headersGetter, status) {
                return {
                    content: data
                };
            }
        }
    });
});



services.factory('ModuleInfo', function () {
    var info = {
        moduleInfo: {}
    };
    return info;
});

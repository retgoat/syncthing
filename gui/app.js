// Copyright (C) 2014 Jakob Borg and Contributors (see the CONTRIBUTORS file).
// All rights reserved. Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file.

/*jslint browser: true, continue: true, plusplus: true */
/*global $: false, angular: false */

'use strict';

var syncthing = angular.module('syncthing', ['pascalprecht.translate']);
var urlbase = 'rest';
var validLangs = ['de', 'en', 'es', 'fr', 'pt', 'sv'];

syncthing.config(function ($httpProvider, $translateProvider) {
    $httpProvider.defaults.xsrfHeaderName = 'X-CSRF-Token';
    $httpProvider.defaults.xsrfCookieName = 'CSRF-Token';

    $translateProvider.useStaticFilesLoader({
        prefix: 'lang-',
        suffix: '.json'
    });
});

syncthing.controller('SyncthingCtrl', function ($scope, $http, $translate, $location) {
    var prevDate = 0;
    var getOK = true;
    var restarting = false;

    $scope.connections = {};
    $scope.config = {};
    $scope.myID = '';
    $scope.nodes = [];
    $scope.configInSync = true;
    $scope.protocolChanged = false;
    $scope.errors = [];
    $scope.seenError = '';
    $scope.model = {};
    $scope.repos = {};
    $scope.reportData = {};
    $scope.reportPreview = false;
    $scope.upgradeInfo = {};

    $http.get(urlbase+"/lang").success(function (langs) {
        var lang;
        for (var i = 0; i < langs.length; i++) {
            lang = langs[i];
            if (validLangs.indexOf(lang) >= 0) {
                $translate.use(lang);
                break;
            }
        }
    })

    $scope.$on("$locationChangeSuccess", function () {
        var lang = $location.search().lang;
        if (lang) {
            $translate.use(lang);
        }
    });

    $scope.needActions = {
        'rm': 'Del',
        'rmdir': 'Del (dir)',
        'sync': 'Sync',
        'touch': 'Update',
    }
    $scope.needIcons = {
        'rm': 'remove',
        'rmdir': 'remove',
        'sync': 'download',
        'touch': 'asterisk',
    }

    function getSucceeded() {
        if (!getOK) {
            $scope.init();
            $('#networkError').modal('hide');
            getOK = true;
        }
        if (restarting) {
            $scope.init();
            $('#restarting').modal('hide');
            $('#shutdown').modal('hide');
            restarting = false;
        }
    }

    function getFailed() {
        if (restarting) {
            return;
        }
        if (getOK) {
            $('#networkError').modal({backdrop: 'static', keyboard: false});
            getOK = false;
        }
    }

    $scope.refresh = function () {
        $http.get(urlbase + '/system').success(function (data) {
            getSucceeded();
            $scope.system = data;
        }).error(function () {
            getFailed();
        });
        Object.keys($scope.repos).forEach(function (id) {
            if (typeof $scope.model[id] === 'undefined') {
                // Never fetched before
                $http.get(urlbase + '/model?repo=' + encodeURIComponent(id)).success(function (data) {
                    $scope.model[id] = data;
                });
            } else {
                $http.get(urlbase + '/model/version?repo=' + encodeURIComponent(id)).success(function (data) {
                    if (data.version > $scope.model[id].version) {
                        $http.get(urlbase + '/model?repo=' + encodeURIComponent(id)).success(function (data) {
                            $scope.model[id] = data;
                        });
                    }
                });
            }
        });
        $http.get(urlbase + '/connections').success(function (data) {
            var now = Date.now(),
            td = (now - prevDate) / 1000,
            id;

            prevDate = now;
            for (id in data) {
                if (!data.hasOwnProperty(id)) {
                    continue;
                }
                try {
                    data[id].inbps = Math.max(0, 8 * (data[id].InBytesTotal - $scope.connections[id].InBytesTotal) / td);
                    data[id].outbps = Math.max(0, 8 * (data[id].OutBytesTotal - $scope.connections[id].OutBytesTotal) / td);
                } catch (e) {
                    data[id].inbps = 0;
                    data[id].outbps = 0;
                }
            }
            $scope.connections = data;
        });
        $http.get(urlbase + '/errors').success(function (data) {
            $scope.errors = data;
        });
    };

    $scope.repoStatus = function (repo) {
        if (typeof $scope.model[repo] === 'undefined') {
            return 'unknown';
        }

        if ($scope.model[repo].invalid !== '') {
            return 'stopped';
        }

        return '' + $scope.model[repo].state;
    };

    $scope.repoClass = function (repo) {
        if (typeof $scope.model[repo] === 'undefined') {
            return 'info';
        }

        if ($scope.model[repo].invalid !== '') {
            return 'danger';
        }

        var state = '' + $scope.model[repo].state;
        if (state == 'idle') {
            return 'success';
        }
        if (state == 'syncing') {
            return 'primary';
        }
        return 'info';
    };

    $scope.syncPercentage = function (repo) {
        if (typeof $scope.model[repo] === 'undefined') {
            return 100;
        }
        if ($scope.model[repo].globalBytes === 0) {
            return 100;
        }

        var pct = 100 * $scope.model[repo].inSyncBytes / $scope.model[repo].globalBytes;
        return Math.floor(pct);
    };

    $scope.nodeIcon = function (nodeCfg) {
        var conn = $scope.connections[nodeCfg.NodeID];
        if (conn) {
            if (conn.Completion === 100) {
                return 'ok';
            } else {
                return 'refresh';
            }
        }

        return 'minus';
    };

    $scope.nodeClass = function (nodeCfg) {
        var conn = $scope.connections[nodeCfg.NodeID];
        if (conn) {
            if (conn.Completion === 100) {
                return 'success';
            } else {
                return 'primary';
            }
        }

        return 'info';
    };

    $scope.nodeAddr = function (nodeCfg) {
        var conn = $scope.connections[nodeCfg.NodeID];
        if (conn) {
            return conn.Address;
        }
        return '?';
    };

    $scope.nodeCompletion = function (nodeCfg) {
        var conn = $scope.connections[nodeCfg.NodeID];
        if (conn) {
            return conn.Completion + '%';
        }
        return '';
    };

    $scope.nodeVer = function (nodeCfg) {
        if (nodeCfg.NodeID === $scope.myID) {
            return $scope.version;
        }
        var conn = $scope.connections[nodeCfg.NodeID];
        if (conn) {
            return conn.ClientVersion;
        }
        return '?';
    };

    $scope.findNode = function (nodeID) {
        var matches = $scope.nodes.filter(function (n) { return n.NodeID == nodeID; });
        if (matches.length != 1) {
            return undefined;
        }
        return matches[0];
    };

    $scope.nodeName = function (nodeCfg) {
        if (typeof nodeCfg === 'undefined') {
            return "";
        }
        if (nodeCfg.Name) {
            return nodeCfg.Name;
        }
        return nodeCfg.NodeID.substr(0, 6);
    };

    $scope.thisNodeName = function () {
        var node = $scope.thisNode();
        if (typeof node === 'undefined') {
            return "(unknown node)";
        }
        if (node.Name) {
            return node.Name;
        }
        return node.NodeID.substr(0, 6);
    };

    $scope.editSettings = function () {
        // Make a working copy
        $scope.tmpOptions = angular.copy($scope.config.Options);
        $scope.tmpOptions.UREnabled = ($scope.tmpOptions.URAccepted > 0);
        $scope.tmpGUI = angular.copy($scope.config.GUI);
        $('#settings').modal({backdrop: 'static', keyboard: true});
    };

    $scope.saveConfig = function() {
        var cfg = JSON.stringify($scope.config);
        var opts = {headers: {'Content-Type': 'application/json'}};
        $http.post(urlbase + '/config', cfg, opts).success(function () {
            $http.get(urlbase + '/config/sync').success(function (data) {
                $scope.configInSync = data.configInSync;
            });
        });
    };

    $scope.saveSettings = function () {
        // Make sure something changed
        var changed = !angular.equals($scope.config.Options, $scope.tmpOptions) ||
                      !angular.equals($scope.config.GUI, $scope.tmpGUI);
        if (changed) {
            // Check if usage reporting has been enabled or disabled
            if ($scope.tmpOptions.UREnabled && $scope.tmpOptions.URAccepted <= 0) {
                $scope.tmpOptions.URAccepted = 1000;
            } else if (!$scope.tmpOptions.UREnabled && $scope.tmpOptions.URAccepted > 0){
                $scope.tmpOptions.URAccepted = -1;
            }

            // Check if protocol will need to be changed on restart
            if($scope.config.GUI.UseTLS !== $scope.tmpGUI.UseTLS){
                $scope.protocolChanged = true;
            }

            // Apply new settings locally
            $scope.config.Options = angular.copy($scope.tmpOptions);
            $scope.config.GUI = angular.copy($scope.tmpGUI);
            $scope.config.Options.ListenAddress = $scope.config.Options.ListenStr.split(',').map(function (x) { return x.trim(); });

            $scope.saveConfig();
        }

        $('#settings').modal("hide");
    };

    $scope.restart = function () {
        restarting = true;
        $scope.restartingTitle = "Restarting"
        $scope.restartingBody = "Syncthing is restarting."
        $('#restarting').modal({backdrop: 'static', keyboard: false});
        $http.post(urlbase + '/restart');
        $scope.configInSync = true;

        // Switch webpage protocol if needed
        if($scope.protocolChanged){
            var protocol = 'http';

            if($scope.config.GUI.UseTLS){
               protocol = 'https';
            }

            setTimeout(function(){
                window.location.protocol = protocol;
            }, 1000);

            $scope.protocolChanged = false;
        }
    };

    $scope.upgrade = function () {
        $scope.restartingTitle = "Upgrading"
        $scope.restartingBody = "Syncthing is upgrading."
        $('#restarting').modal({backdrop: 'static', keyboard: false});
        $http.post(urlbase + '/upgrade').success(function () {
            restarting = true;
            $scope.restartingBody = "Syncthing is restarting into the new version."
        }).error(function () {
            $('#restarting').modal('hide');
        });
    };

    $scope.shutdown = function () {
        restarting = true;
        $http.post(urlbase + '/shutdown').success(function () {
            $('#shutdown').modal({backdrop: 'static', keyboard: false});
        });
        $scope.configInSync = true;
    };

    $scope.editNode = function (nodeCfg) {
        $scope.currentNode = $.extend({}, nodeCfg);
        $scope.editingExisting = true;
        $scope.editingSelf = (nodeCfg.NodeID == $scope.myID);
        $scope.currentNode.AddressesStr = nodeCfg.Addresses.join(', ');
        $scope.nodeEditor.$setPristine();
        $('#editNode').modal({backdrop: 'static', keyboard: true});
    };

    $scope.idNode = function () {
        $('#idqr').modal('show');
    };

    $scope.addNode = function () {
        $scope.currentNode = {AddressesStr: 'dynamic', Compression: true};
        $scope.editingExisting = false;
        $scope.editingSelf = false;
        $scope.nodeEditor.$setPristine();
        $('#editNode').modal({backdrop: 'static', keyboard: true});
    };

    $scope.deleteNode = function () {
        $('#editNode').modal('hide');
        if (!$scope.editingExisting) {
            return;
        }

        $scope.nodes = $scope.nodes.filter(function (n) {
            return n.NodeID !== $scope.currentNode.NodeID;
        });
        $scope.config.Nodes = $scope.nodes;

        for (var id in $scope.repos) {
            $scope.repos[id].Nodes = $scope.repos[id].Nodes.filter(function (n) {
                return n.NodeID !== $scope.currentNode.NodeID;
            });
        }

        $scope.saveConfig();
    };

    $scope.saveNode = function () {
        var nodeCfg, done, i;

        $('#editNode').modal('hide');
        nodeCfg = $scope.currentNode;
        nodeCfg.Addresses = nodeCfg.AddressesStr.split(',').map(function (x) { return x.trim(); });

        done = false;
        for (i = 0; i < $scope.nodes.length; i++) {
            if ($scope.nodes[i].NodeID === nodeCfg.NodeID) {
                $scope.nodes[i] = nodeCfg;
                done = true;
                break;
            }
        }

        if (!done) {
            $scope.nodes.push(nodeCfg);
        }

        $scope.nodes.sort(nodeCompare);
        $scope.config.Nodes = $scope.nodes;

        $scope.saveConfig();
    };

    $scope.otherNodes = function () {
        return $scope.nodes.filter(function (n){
            return n.NodeID !== $scope.myID;
        });
    };

    $scope.thisNode = function () {
        var i, n;

        for (i = 0; i < $scope.nodes.length; i++) {
            n = $scope.nodes[i];
            if (n.NodeID === $scope.myID) {
                return n;
            }
        }
    };

    $scope.allNodes = function () {
        var nodes = $scope.otherNodes();
        nodes.push($scope.thisNode());
        return nodes;
    };

    $scope.errorList = function () {
        return $scope.errors.filter(function (e) {
            return e.Time > $scope.seenError;
        });
    };

    $scope.clearErrors = function () {
        $scope.seenError = $scope.errors[$scope.errors.length - 1].Time;
        $http.post(urlbase + '/error/clear');
    };

    $scope.friendlyNodes = function (str) {
        for (var i = 0; i < $scope.nodes.length; i++) {
            var cfg = $scope.nodes[i];
            str = str.replace(cfg.NodeID, $scope.nodeName(cfg));
        }
        return str;
    };

    $scope.repoList = function () {
        return repoList($scope.repos);
    };

    $scope.editRepo = function (nodeCfg) {
        $scope.currentRepo = angular.copy(nodeCfg);
        $scope.currentRepo.selectedNodes = {};
        $scope.currentRepo.Nodes.forEach(function (n) {
            $scope.currentRepo.selectedNodes[n.NodeID] = true;
        });
        if ($scope.currentRepo.Versioning && $scope.currentRepo.Versioning.Type === "simple") {
            $scope.currentRepo.simpleFileVersioning = true;
            $scope.currentRepo.simpleKeep = +$scope.currentRepo.Versioning.Params.keep;
        }
        $scope.currentRepo.simpleKeep = $scope.currentRepo.simpleKeep || 5;
        $scope.editingExisting = true;
        $scope.repoEditor.$setPristine();
        $('#editRepo').modal({backdrop: 'static', keyboard: true});
    };

    $scope.addRepo = function () {
        $scope.currentRepo = {selectedNodes: {}};
        $scope.editingExisting = false;
        $scope.repoEditor.$setPristine();
        $('#editRepo').modal({backdrop: 'static', keyboard: true});
    };

    $scope.saveRepo = function () {
        var repoCfg, done, i;

        $('#editRepo').modal('hide');
        repoCfg = $scope.currentRepo;
        repoCfg.Nodes = [];
        repoCfg.selectedNodes[$scope.myID] = true;
        for (var nodeID in repoCfg.selectedNodes) {
            if (repoCfg.selectedNodes[nodeID] === true) {
                repoCfg.Nodes.push({NodeID: nodeID});
            }
        }
        delete repoCfg.selectedNodes;

        if (repoCfg.simpleFileVersioning) {
            repoCfg.Versioning = {
                'Type': 'simple',
                'Params': {
                    'keep': '' + repoCfg.simpleKeep,
                }
            };
            delete repoCfg.simpleFileVersioning;
            delete repoCfg.simpleKeep;
        } else {
            delete repoCfg.Versioning;
        }

        $scope.repos[repoCfg.ID] = repoCfg;
        $scope.config.Repositories = repoList($scope.repos);

        $scope.saveConfig();
    };

    $scope.sharesRepo = function(repoCfg) {
        var names = [];
        repoCfg.Nodes.forEach(function (node) {
            names.push($scope.nodeName($scope.findNode(node.NodeID)));
        });
        names.sort();
        return names.join(", ");
    };

    $scope.deleteRepo = function () {
        $('#editRepo').modal('hide');
        if (!$scope.editingExisting) {
            return;
        }

        delete $scope.repos[$scope.currentRepo.ID];
        $scope.config.Repositories = repoList($scope.repos);

        $scope.saveConfig();
    };

    $scope.setAPIKey = function (cfg) {
        cfg.APIKey = randomString(30, 32);
    };

    $scope.init = function() {
        $http.get(urlbase + '/version').success(function (data) {
            $scope.version = data;
        });

        $http.get(urlbase + '/system').success(function (data) {
            $scope.system = data;
            $scope.myID = data.myID;
        });

        $http.get(urlbase + '/config').success(function (data) {
            $scope.config = data;
            $scope.config.Options.ListenStr = $scope.config.Options.ListenAddress.join(', ');

            $scope.nodes = $scope.config.Nodes;
            $scope.nodes.sort(nodeCompare);

            $scope.repos = repoMap($scope.config.Repositories);

            $scope.refresh();

            if ($scope.config.Options.URAccepted == 0) {
                // If usage reporting has been neither accepted nor declined,
                // we want to ask the user to make a choice. But we don't want
                // to bug them during initial setup, so we set a cookie with
                // the time of the first visit. When that cookie is present
                // and the time is more than four hours ago, we ask the
                // question.

                var firstVisit = document.cookie.replace(/(?:(?:^|.*;\s*)firstVisit\s*\=\s*([^;]*).*$)|^.*$/, "$1");
                if (!firstVisit) {
                    document.cookie = "firstVisit=" + Date.now() + ";max-age=" + 30*24*3600;
                } else {
                    if (+firstVisit < Date.now() - 4*3600*1000){
                        $('#ur').modal({backdrop: 'static', keyboard: false});
                    }
                }
            }
        });

        $http.get(urlbase + '/config/sync').success(function (data) {
            $scope.configInSync = data.configInSync;
        });

        $http.get(urlbase + '/report').success(function (data) {
            $scope.reportData = data;
        });

        $http.get(urlbase + '/upgrade').success(function (data) {
            $scope.upgradeInfo = data;
        }).error(function () {
            $scope.upgradeInfo = {};
        });
    };

    $scope.acceptUR = function () {
        $scope.config.Options.URAccepted = 1000; // Larger than the largest existing report version
        $scope.saveConfig();
        $('#ur').modal('hide');
    };

    $scope.declineUR = function () {
        $scope.config.Options.URAccepted = -1;
        $scope.saveConfig();
        $('#ur').modal('hide');
    };

    $scope.showNeed = function (repo) {
        $scope.neededLoaded = false;
        $('#needed').modal({backdrop: 'static', keyboard: true});
        $http.get(urlbase + "/need?repo=" + encodeURIComponent(repo)).success(function (data) {
            $scope.needed = data;
            $scope.neededLoaded = true;
        });
    };

    $scope.needAction = function (file) {
        var fDelete = 4096;
        var fDirectory = 16384;

        if ((file.Flags & (fDelete+fDirectory)) === fDelete+fDirectory) {
            return 'rmdir';
        } else if ((file.Flags & fDelete) === fDelete) {
            return 'rm';
        } else if ((file.Flags & fDirectory) === fDirectory) {
            return 'touch';
        } else {
            return 'sync';
        }
    };

    $scope.override = function (repo) {
        $http.post(urlbase + "/model/override?repo=" + encodeURIComponent(repo)).success(function () {
            $scope.refresh();
        });
    };

    $scope.about = function () {
        $('#about').modal('show');
    };

    $scope.init();
    setInterval($scope.refresh, 10000);
});

function nodeCompare(a, b) {
    if (typeof a.Name !== 'undefined' && typeof b.Name !== 'undefined') {
        if (a.Name < b.Name)
            return -1;
        return a.Name > b.Name;
    }
    if (a.NodeID < b.NodeID) {
        return -1;
    }
    return a.NodeID > b.NodeID;
}

function repoCompare(a, b) {
    if (a.Directory < b.Directory) {
        return -1;
    }
    return a.Directory > b.Directory;
}

function repoMap(l) {
    var m = {};
    l.forEach(function (r) {
        m[r.ID] = r;
    });
    return m;
}

function repoList(m) {
    var l = [];
    for (var id in m) {
        l.push(m[id]);
    }
    l.sort(repoCompare);
    return l;
}

function decimals(val, num) {
    var digits, decs;

    if (val === 0) {
        return 0;
    }

    digits = Math.floor(Math.log(Math.abs(val)) / Math.log(10));
    decs = Math.max(0, num - digits);
    return decs;
}

function randomString(len, bits)
{
    bits = bits || 36;
    var outStr = "", newStr;
    while (outStr.length < len)
    {
        newStr = Math.random().toString(bits).slice(2);
        outStr += newStr.slice(0, Math.min(newStr.length, (len - outStr.length)));
    }
    return outStr.toLowerCase();
}

syncthing.filter('natural', function () {
    return function (input, valid) {
        return input.toFixed(decimals(input, valid));
    };
});

syncthing.filter('binary', function () {
    return function (input) {
        if (input === undefined) {
            return '0 ';
        }
        if (input > 1024 * 1024 * 1024) {
            input /= 1024 * 1024 * 1024;
            return input.toFixed(decimals(input, 2)) + ' Gi';
        }
        if (input > 1024 * 1024) {
            input /= 1024 * 1024;
            return input.toFixed(decimals(input, 2)) + ' Mi';
        }
        if (input > 1024) {
            input /= 1024;
            return input.toFixed(decimals(input, 2)) + ' Ki';
        }
        return Math.round(input) + ' ';
    };
});

syncthing.filter('metric', function () {
    return function (input) {
        if (input === undefined) {
            return '0 ';
        }
        if (input > 1000 * 1000 * 1000) {
            input /= 1000 * 1000 * 1000;
            return input.toFixed(decimals(input, 2)) + ' G';
        }
        if (input > 1000 * 1000) {
            input /= 1000 * 1000;
            return input.toFixed(decimals(input, 2)) + ' M';
        }
        if (input > 1000) {
            input /= 1000;
            return input.toFixed(decimals(input, 2)) + ' k';
        }
        return Math.round(input) + ' ';
    };
});

syncthing.filter('short', function () {
    return function (input) {
        return input.substr(0, 6);
    };
});

syncthing.filter('alwaysNumber', function () {
    return function (input) {
        if (input === undefined) {
            return 0;
        }
        return input;
    };
});

syncthing.filter('shortPath', function () {
    return function (input) {
        if (input === undefined)
            return "";
        var parts = input.split(/[\/\\]/);
        if (!parts || parts.length <= 3) {
            return input;
        }
        return ".../" + parts.slice(parts.length-2).join("/");
    };
});

syncthing.filter('basename', function () {
    return function (input) {
        if (input === undefined)
            return "";
        var parts = input.split(/[\/\\]/);
        if (!parts || parts.length < 1) {
            return input;
        }
        return parts[parts.length-1];
    };
});

syncthing.filter('clean', function () {
    return function (input) {
        return encodeURIComponent(input).replace(/%/g, '');
    };
});

syncthing.directive('optionEditor', function () {
    return {
        restrict: 'C',
        replace: true,
        transclude: true,
        scope: {
            setting: '=setting',
        },
        template: '<input type="text" ng-model="config.Options[setting.id]"></input>',
    };
});

syncthing.directive('uniqueRepo', function() {
    return {
        require: 'ngModel',
        link: function(scope, elm, attrs, ctrl) {
            ctrl.$parsers.unshift(function(viewValue) {
                if (scope.editingExisting) {
                    // we shouldn't validate
                    ctrl.$setValidity('uniqueRepo', true);
                } else if (scope.repos[viewValue]) {
                    // the repo exists already
                    ctrl.$setValidity('uniqueRepo', false);
                } else {
                    // the repo is unique
                    ctrl.$setValidity('uniqueRepo', true);
                }
                return viewValue;
            });
        }
    };
});

syncthing.directive('validNodeid', function($http) {
    return {
        require: 'ngModel',
        link: function(scope, elm, attrs, ctrl) {
            ctrl.$parsers.unshift(function(viewValue) {
                if (scope.editingExisting) {
                    // we shouldn't validate
                    ctrl.$setValidity('validNodeid', true);
                } else {
                    $http.get(urlbase + '/nodeid?id='+viewValue).success(function (resp) {
                        if (resp.error) {
                            ctrl.$setValidity('validNodeid', false);
                        } else {
                            scope.currentNode.NodeID = resp.id;
                            ctrl.$setValidity('validNodeid', true);
                        }
                    });
                }
                return viewValue;
            });
        }
    };
});

syncthing.directive('modal', function () {
    return {
        restrict: 'E',
        templateUrl: 'modal.html',
        replace: true,
        transclude: true,
        scope: {
            title: '@',
            status: '@',
            icon: '@',
            close: '@',
            large: '@',
        },
    }
});

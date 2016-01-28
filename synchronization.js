(function () {
    'use strict';

    /* jshint latedef:nofunc */

    /**
     * @ngdoc service
     * @name app.synchronizationService
     * @description
     * # synchronizationService
     * Factory in the app.
     */
    angular.module('app')
    .factory('synchronizationService', function ($interval, $rootScope, $httpParamSerializer, fsApi, sessionService, storeService) {

        var interval = 1000;

        var builder = {};

        var processing = [];

        var queues = [
            {
                time: 3600,
                synchronize: true,
                modify_date: null,
                requestCount: 0,
                data: [
                    {
                        resolve: {
                            builder_id: 'id'
                        },
                        name: 'projects',
                        url: 'projects',
                        childNodes: [
                            {
                                resolve: {
                                    project_id: 'id',
                                    builder_id: 'builder_id'
                                },
                                name: 'suites',
                                url: 'suites',
                                childNodes: [
                                    {
                                        resolve: {
                                            suite_id: 'id',
                                            project_id: 'project_id',
                                            builder_id: 'builder_id'
                                        },
                                        name: 'suite_contacts',
                                        url: 'suitecontacts'
                                    }
                                ]
                            },
                            {
                                resolve: {
                                    project_id: 'id',
                                     builder_id: 'builder_id'
                                },
                                name: 'form_types',
                                url: 'formtypes'
                            }
                        ]
                    }
                ]
            },
            {
                time: 60,
                synchronize: false,
                modify_date: null,
                requestCount: 0,
                data: [
                    {
                        resolve: {
                            builder_id: 'id'
                        },
                        name: 'inspection_events',
                        url: 'inspectionevents'
                    }
                ]
            }
        ];
        
        var service = {
            
            init: init,
            reset: reset
        };
       
        return service;

        function init() {

            $interval(function(){

                if(!sessionService.loggedIn()) {
                
                    return;
                }
                
                builder = sessionService.builder();
            
                if(!builder) {

                    return;
                }
                
                if(!$rootScope.online) {
                    
                    return;
                }
                
                var current_date = new Date();
                
                var last_synchronize;
                
                angular.forEach(queues, function(value, key) {
                    
                    last_synchronize = sessionService.lastSynchronize('last_synchronize_' + value.time);

                    if(_processPermission(value) && (!last_synchronize || _timeRange(current_date, new Date(last_synchronize)) >= value.time)) {
                        
                        if(last_synchronize) {
                            
                            queues[key].modify_date = last_synchronize;
                        }

                        start(value);
                    }
                });
                
            }, interval);
        }
        
        function reset() {
            
            angular.forEach(queues, function(value, key) {
                
                storeService.remove('last_synchronize_' + value.time);
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name start
         * 
         * @param {object} queue
         */
        function start(queue) {
            
            if(!queue.data.length) {
                
                return;
            }
            
            _processStart(queue.time);
            console.log('Start. Queue: ' + queue.time);
            pull(queue, queue.data);
        }
        
        /**
         * @ngdoc method
         * 
         * @name pull
         * 
         * @param {object} queue
         * 
         * @param {array} data
         * 
         * @param {array} parentData
         */
        function pull(queue, data, parentData) {

            if(!parentData) parentData = [builder];

            angular.forEach(data, function(value, key) {
                
                if(!value.resolve) value.resolve = {};

                var apiQueue = [];
                
                angular.forEach(parentData, function(parent) {
                    
                    queue.requestCount++;
                    
                    var callbackAPI = function() {
                        
                        
                        var params = _resolve(value.resolve, parent);

                        if(queue.modify_date) {
                                    
                            params['modify_date'] = _normalizeDate(queue.modify_date);
                        }
                        
                        return fsApi.get(value.url, params, {key: value.name})
                            .then(function(response){
                                
                                queue.requestCount--;

                                _store(value.url, params, response);
                        
                                if(value.childNodes && value.childNodes.length) {
                                    
                                    pull(queue, value.childNodes, _passParentParams(params, response));
                                }
                                
                                //console.log(queue.requestCount); 
                                if(queue.requestCount === 0)
                                    _pullCallback(queue);
                            })
                            .catch(function(){
                                
                                queue.requestCount--;
                        
                                //console.log(queue.requestCount); 
                                if(queue.requestCount === 0)
                                    _pullCallback(queue);
                            });
                    }
                    
                    apiQueue.push(callbackAPI);
                });
                
                return serial(apiQueue);
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name serial
         * 
         * @param {object} tasks
         * 
         * @returns promise
         */
        function serial(tasks) {
            var prevPromise;
            angular.forEach(tasks, function (task) {
                //First task
                if (!prevPromise) { 
                  prevPromise = task(); 
                } else {
                  prevPromise = prevPromise.then(task); 
                }
            });
            
            return prevPromise;
        }

        /**
         * @ngdoc method
         * 
         * @name _pullCallback
         * 
         * @param {object} queue
         */
        function _pullCallback(queue) {
            
            console.log('Pull finished. Queue: ' + queue.time);
            
            sessionService.lastSynchronize('last_synchronize_' + queue.time, new Date());
            
            _processFinish(queue.time);
        }
       
       /**
         * @ngdoc method
         * 
         * @name _store
         * 
         * @param {string} url
         * 
         * @param {object} params
         * 
         * @param {object} data
         * 
         * @returns string
         */
        function _store(url, params, data) {
            
            var result = {};
            
            var key = _getKey(url, params);
            
            var stored = storeService.get(key);

            if(stored && stored.length && params.modify_date) {
                
                result[key] = _merge(stored, data);
            }else{
                
                result[key] = data;
            }

            storeService.set(result);
        }
        
        /**
         * @ngdoc method
         * 
         * @name _getKey
         * 
         * @param {string} url
         * 
         * @param {object} params
         * 
         * @returns string
         */
        function _getKey(url, params) {

            var key = '';
            
            var system_params = [
                'builder_id',
                'modify_date'
            ];
            
            if(params.builder_id) {
                
                key = params.builder_id + '_';
            }
            
            key += '/';
            
            var store_params = [];
            
            for(var i in params) {
                
                if($.inArray(i, system_params) == -1) {
                    
                    store_params[i] = params[i];
                }
            }
            
            key += url + _params(store_params)
            
            return key;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _processStart
         * 
         * @param {integer} time
         */
        function _processStart(time) {

            processing.push(time);
        }
        
        /**
         * @ngdoc method
         * 
         * @name _processFinish
         * 
         * @param {integer} time
         */
        function _processFinish(time) {
            
            var index = processing.indexOf(time);
            
            if (index > -1) {
                
                processing.splice(index, 1);
            }
        }
        
        /**
         * @ngdoc method
         * 
         * @name _processPermission
         * 
         * @param {object} queue
         * 
         * @returns boolean
         */
        function _processPermission(queue) {
            
            if($.inArray(queue.time, processing) != -1) {
                
                console.log('Process ' + queue.time + ' still working');
                return false;
            }
            
            if(processing.length != 0 && queue.synchronize) {
                
                console.log('Process ' + queue.time + ' should waiting for: ' + processing.join(', '));
                return false;
            }
                
            return true;
        }

        /**
         * @ngdoc method
         * 
         * @name _resolve
         * 
         * @param {object} oldData
         * 
         * @param {object} newData
         * 
         * @returns object
         */
        function _resolve(options, data) {
            
            if(!options) {
                
                return {};
            }
            
            var result = {};
            
            angular.forEach(options, function(value, key) {
                
                if(data[value]) {
                    
                    result[key] = data[value];
                }
            });
            
            return result;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _merge
         * 
         * @param {array} oldData
         * 
         * @param {array} newData
         * 
         * @returns array
         */
        function _merge(oldData, newData) {

            var scope = [];
            
            var result = [];
            
            angular.forEach(oldData, function(value, key) {
                
                var field = value.id ? value.id : value.guid;
                
                scope[field] = value;
            });
            
            angular.forEach(newData, function(value, key) {
                
                scope[value.id] = value;
            });
            
            for(var i in scope) {
                
                result.push(scope[i]);
            }

            return result;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _timeRange
         * 
         * @param {date} newDate
         * 
         * @param {date} oldDate
         * 
         * @returns integer
         */
        function _timeRange(newDate, oldDate) {
            
            return ((newDate.getTime() - oldDate.getTime()) / 1000).toFixed();
        }
        
        
        /**
         * @ngdoc method
         * 
         * @name _params
         * 
         * @param {array} data
         * 
         * @returns array
         */
        function _params(data) {

            return Object.keys(data).length ? '?' + $httpParamSerializer(data) : "";
        }
        
        /**
         * @ngdoc method
         * 
         * @name _passParentParams
         * 
         * @param {object} params
         * 
         * @param {array} data
         * 
         * @returns array
         * 
         * This function should pass parent request data for all childs elements.
         * It will help us to control needed parameters on every tree level.
         */
        function _passParentParams(params, data) {
            
            angular.forEach(data, function(value, key) {
                
                data[key] = angular.extend({}, value, params);
            });
            
            return data;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _normalizeDate
         * 
         * @param {string} date
         * 
         * @returns string
         */
        function _normalizeDate(date) {
            
            return new Date(date).toISOString();
        }
    });
})();

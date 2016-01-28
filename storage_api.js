(function () {
    'use strict';

    /**
     * @ngdoc service
     * @name app.storageApiService
     * @description
     * # storageApiService
     */
    angular.module('app')
    .factory('storageApiService', function ($q, $httpParamSerializer, storeService, sessionService, cryptographyService) {

        var builder = sessionService.builder();

        var service = {
            
            get: get,

            gets: get,
            
            post: post,
            
            put: put,
            
            'delete': deleted
        };

        return service;
        
        
        /**
         * @ngdoc method
         * 
         * @name get
         * 
         * @param {string} endpoint
         * 
         * @param {object} data
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function get(endpoint, data, options) {
            
            options.id = _getId(endpoint);

            endpoint = params(endpoint, data);

            return send('GET', endpoint, data, options);

        }
        
        /**
         * @ngdoc method
         * 
         * @name post
         * 
         * @param {string} endpoint
         * 
         * @param {object} data
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function post(endpoint, data, options) {
            
            var url = endpoint;

            var endpoint_data = options.endpoint ? options.endpoint : {};
            
            data.guid = cryptographyService.guid();
            
            endpoint = params(endpoint, endpoint_data);

            return send('POST', endpoint, data, options).then(function(response){
                
                var log = {
                    method: "POST",
                    url: url,
                    key: endpoint,
                    data: data,
                    options: options,
                    response: response
                };
                
                _logs(log);
                
                return response;
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name put
         * 
         * @param {string} endpoint
         * 
         * @param {object} data
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function put(endpoint, data, options) {
            
            var url = endpoint;

            var endpoint_data = options.endpoint ? options.endpoint : {};
            
            options.id = _getId(url);

            endpoint = params(endpoint, endpoint_data);
            
            return send('PUT', endpoint, data, options).then(function(response){

                if(!isGuid(options.id)) {
                    
                    var log = {
                        method: "PUT",
                        url: url,
                        key: endpoint,
                        data: data,
                        options: options,
                        response: response
                    };

                    _logs(log);
                }
                
                return response;
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name put
         * 
         * @param {string} endpoint
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function deleted(endpoint, options) {
            
            var url = endpoint;
            
            var endpoint_data = options.endpoint ? options.endpoint : {};
            
            options.id = _getId(endpoint);
            
            endpoint = params(endpoint, endpoint_data);
            
            return send('DELETE', endpoint, {}, options).then(function(response){

                if(!isGuid(options.id)) {
                    
                    var log = {
                        method: "DELETE",
                        url: url,
                        key: endpoint,
                        data: {},
                        options: options,
                        response: response
                    };

                    _logs(log);
                }
                
                return response;
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name send
         * 
         * @param {string} method
         * 
         * @param {string} url
         * 
         * @param {string} endpoint
         * 
         * @param {object} data
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function send(method, endpoint, data, options) {

            var response = {};

            switch (method) {
                case "GET":

                  var stored = storeService.get(endpoint);

                  options.id ? response = _searchById(stored, options.id) : response = stored;

                  break;
                case "POST":

                  response = _create(endpoint, data);
                  
                  break;
                case "PUT":
                  if(options.id) {
                      
                      response = _update(endpoint, data);
                  }
                  
                  break;
                case "DELETE":
                    
                  response = _remove(endpoint, options);  
                  
                  break;
            }

            if(response) {
                
                return success(response, options);
            }else {
                        
                return fail(response, options);
            }
        }
        
        /**
         * @ngdoc method
         * 
         * @name params
         * 
         * @param {string} endpoint
         * 
         * @param {object} options
         * 
         * @returns string
         */
        function params(endpoint, data) {

            endpoint = endpoint.replace(/\/[^\?]+$/, '');
            
            var params = Object.keys(data).length ? '?' + $httpParamSerializer(data) : "";
            
            return builder.id + '_/' + endpoint + params;
        }
        
        /**
         * @ngdoc method
         * 
         * @name success
         * 
         * @param {object} response
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function success(response, options) {
            
            return $q(function(resolve, reject) {
                
                return resolve(response);
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name fail
         * 
         * @param {object} response
         * 
         * @param {object} options
         * 
         * @returns promise
         */
        function fail(response, options) {
            
            response = {    
                
                message: 'Data was not found',

                code: 400,

                response: response 
            };
            
            return $q(function(resolve, reject) {
                
                return reject(response);
            });
        }
        
        /**
         * @ngdoc method
         * 
         * @name _getId
         * 
         * @param {string} endpoint
         * 
         * @returns mixed
         */
        function _getId(endpoint) {
            
            var match = endpoint.match(/([^\?\/]{1,})$/);
            
            if(match.length) {
                
                return match[0];
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name isGuid
         * 
         * @param {string} data
         * 
         * @returns boolean
         */
        function isGuid(data) {
            
            if(!$.isNumeric(data) && data.length >= 32) {
                
                return true;
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _searchById
         * 
         * @param {array} data
         * 
         * @param {integer} id
         * 
         * @returns mixed
         */
        function _searchById(data, id) {

            var field = isGuid(id) ? "guid" : "id";

            for(var i in data) {

                if(data[i][field] && data[i][field] == id) {
                    
                    return data[i];
                }  
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _remove
         * 
         * @param {string} key
         * 
         * @param {object} options
         * 
         * @returns mixed
         */
        function _remove(key, options) {
            
            var id = options.id;
            
            var stored = storeService.get(key);

            if(stored && id) {
                
                var field = isGuid(id) ? "guid" : "id";
                
                for(var i in stored) {

                    if(stored[i][field] && stored[i][field] == id) {
                        
                        var result = stored[i];
                        
                        stored.splice(i, 1);

                        return result;
                    }  
                }
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _update
         * 
         * @param {string} key
         * 
         * @param {object} row
         * 
         * @returns mixed
         */
        function _update(key, row) {
            
            var stored = storeService.get(key);
            
            if(stored) {
                
                row.modify_date_local = _normalizeDate(new Date());
                
                if(stored = _merge(stored, row)) {
                    
                    storeService.set(key, stored);
                    
                    return row;
                }
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _create
         * 
         * @param {string} key
         * 
         * @param {object} row
         * 
         * @returns mixed
         */
        function _create(key, row) {
            
            var stored = storeService.get(key);
            
            if(stored) {
                
                row.create_date_local = _normalizeDate(new Date());
                
                stored.push(row);
                
                storeService.set(key, stored);
                
                return row;
                
            }
            
            return false;
        }
        
        /**
         * @ngdoc method
         * 
         * @name _merge
         * 
         * @param {array} data
         * 
         * @param {object} row
         * 
         * @returns mixed
         */
        function _merge(data, row) {
            
            for(var i in data) {
                
                if((data[i].id && data[i].id == row.id) || (data[i].guid && data[i].guid == row.guid)) {
                    
                    data[i] = angular.extend({}, data[i], row);
                    
                    return data;
                }  
            }
            
            return false;
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
        
        /**
         * @ngdoc method
         * 
         * @name _logs
         * 
         * @param {object} data
         */
        function _logs(log) {
            
            var logs = sessionService.logs();
            
            logs = logs ? logs : [];
            
            log.date = _normalizeDate(new Date());
            
            logs.push(log);
            
            sessionService.logs(logs);
        }
    });
})();

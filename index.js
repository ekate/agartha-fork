/**
 * agartha.js
 * https://github.com/NYULibraries/agartha.js
 *
 * Copyright (c) 2014 New York University, contributors
 * Licensed under the MIT license.
 */

'use strict'

const agartha = (function() {

  // http://underscorejs.org
  const _ = require('underscore')

  if (!_.isObject(process.agartha)) {
    // https://nodejs.org/api/fs.html
    const fs = require('fs')
    // https://nodejs.org/api/path.html
    const path = require('path')
    // https://nodejs.org/api/events.html
    const events = require('events')
    // Create an eventEmitter object
    const eventEmitter = new events.EventEmitter()
    // https://github.com/request/request
    const request = require('request')
    // https://github.com/felixge/node-dateformat
    const dateformat = require('dateformat')
    // track start time
    const timespan = _.now()
    // https://github.com/substack/node-mkdirp
    const mkdirp = require('mkdirp')

    /**
     * Check if the given directory `path` is empty.
     *
     * @param {String} path
     * @param {Function} fn
     */
    function emptyDirectory (path, fn) {
      fs.readdir(path, function(err, files) {
        if (err && 'ENOENT' != err.code) throw err
        fn(!files || !files.length)
      })
    }

    function log (msg, status) {
      console.log('   \x1b[36m'+status+'\x1b[0m : ' + msg)
    }

    /**
     * echo str > path.
     *
     * @param {String} path
     * @param {String} str
     */
    function write (filename, str, mode) {
      const dirname = path.dirname(filename)
      if (!exists(dirname)) {
        mkdirp(dirname, function (err) {
          if (err) console.error(err);
          else {
            try {
              fs.writeFile(filename, str, 'utf8', function() {
                log(filename, 'create')
              })
            }
            catch (error) {
              console.error(error)
            }
          }
        });
      }
      else {
        try {
          fs.writeFile(filename, str, 'utf8', function() {
            log(filename, 'create')
          })
        }
        catch (error) {
          console.error(error)
        }
      }
    }

    /**
     * Mkdir -p.
     *
     * @param {String} path
     * @param {Function} fn
     */
    function mkdir (path, fn) {
      mkdirp(path, '0755', function (err) {
        if (err) throw err
        console.log('   create : ' + path)
        fn && fn()
      })
    }

    /**
     * Forge project
     * @param {String} path
     */
    function forge () {

      // custom module
      const transform = require('./lib/transform')

      transform.assets()

      transform.sass()

      transform.build()

    }

    function exists (filePath) {
      try {
        fs.accessSync(filePath, fs.F_OK)
        return true
      }
      catch (e) {
        return false
      }
    }

    function walk (dir, page) {
      var results = []
      try {
        if (fs.lstatSync(dir).isDirectory()) {
          fs.readdirSync(dir).forEach(function(file) {
            results[file] = agartha.path.join(dir, file)
          })
        }
      }
      catch (err) {
        log('Error listing directory ' + dir, 'error')
      }
      return results
    }

    function user () {
      return process.env.USER
    }

    function appDir () {
      return process.cwd()
    }

    function appPages () {
      var dir = agartha.path.join(agartha.appDir(), 'app', 'pages')
      if (!agartha.exists(dir)) return []
      return agartha.walk(dir)
    }

    function appBuildDir () {
      return agartha.path.join(agartha.appDir(), 'build')
    }

    function get (option) {
      let project = agartha.read.json(agartha.path.join(process.cwd(), 'project.json'))
      const environment = agartha.read.json(agartha.path.join(process.cwd(), 'env.json'))
      const AGARTHA_ENVIRONMENT = process.env.AGARTHA_ENVIRONMENT ? process.env.AGARTHA_ENVIRONMENT : 'default'
      try {
        // check for operational errors
        // https://www.joyent.com/node-js/production/design/errors#operational-errors-vs-programmer-errors
        const datasource = environment[AGARTHA_ENVIRONMENT]
        if (agartha._.isUndefined(datasource)) {
          throw new Error('Unable to read environment.json')
        }
        project.datasource = datasource
      }
      catch (e) {
        agartha.exit(e)
      }

      if (agartha._.isUndefined(option)) {
        return project
      }
      else {
        if (agartha._.has(project, option)) {
          return project[option]
        }
      }
    }

    const configurations = {
      htmlminify: function () {
        const source = agartha.path.join(agartha.appDir(), 'htmlminify.json');
        var configurations = {};
        if (agartha.exists(source)) {
          configurations = agartha.read.json(source);
        }
        return configurations;
      },
      js: function () {
        const source = agartha.path.join(agartha.appDir(), 'js.json');
        var configurations = {};
        if (agartha.exists(source)) {
          configurations = agartha.read.json(source);
        }
        else { // default JS configuration
          configurations = {
            build : 'external', // options: inline,  external
            style : 'expanded' // options: compressed, expanded
          };
        }

        configurations.template = {
          inline   : '<script data-timespan="<%= now %>"><%= src %></script>',
          external : '<script src="<%= src %>?n<%= now %>" defer></script>'
        };

        return configurations;
      },
      sass: function () {
        const source = agartha.path.join(agartha.appDir(), 'htmlminify.json');
        var configurations = {};
        if (agartha.exists(source)) {
          configurations = agartha.read.json(source);
        }
        else { // default SASS configuration
          configurations = {
            sass : {
              build : "external", // options: inline,  external
     	        // for options; see: https://github.com/gruntjs/grunt-contrib-sass
     	        options : {
                style : "expanded", // options: nested, compact, compressed, expanded
                debugInfo : false,
                lineNumbers : true,
                trace: false
              }
            }
          };
        }
        return {
          dist: {
            options: configurations.sass.options,
            files: {
              'build/css/style.css': __dirname + '/source/sass/style.scss'
            },
            build: configurations.sass.build
          }
        };
      },
      uglify: function () {
       return {
         options: {
           banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n',
           compress: {}, // https://github.com/gruntjs/grunt-contrib-uglify/issues/298#issuecomment-74161370
           preserveComments: false
         },
         my_target: {
           files: () => {
             var targets = {}
             //grunt.file.recurse(__dirname + '/source/js/', function callback (abspath, rootdir, subdir, filename) {
             //  if ( filename.match('.js') ) {
             //    var name = filename.replace('.js', '');
             //    targets['build/js/' + name + '.min.js'] = abspath;
             //   }
             //});
             return targets
           }
         }
       }
      }
    }

    // read files
    const read = {
      // https://github.com/Leonidas-from-XIV/node-xml2js
      xml : require('xml2js').parseString,
      json : function (filePath) {
        try {
          return JSON.parse(this.text(filePath))
        }
        catch (error) {
          console.log(error)
        }
      },
      text : function (filePath) {
        if (exists(filePath)) {
          try {
            return fs.readFileSync(filePath, 'utf-8')
          }
          catch (error) {
            console.log(error)
          }
        }
      }
    }

    function exit (error) {
      log(error, 'critical')
      process.exit(1)
    }

    function cwd() {
     return __dirname
    }

    function readdirSync (directory) {
      return fs.readdirSync(directory)
    }

    function getDirectories (dirPath) {
      return fs.readdirSync(dirPath).filter(function(file) {
        return fs.statSync(path.join(dirPath, file)).isDirectory()
      })
    }

    function relic () {
      return get('relic')
    }

    function appUrl () {
      return get('appUrl')
    }

    // export
    process.agartha = {
      _: _,
      configurations: configurations,
      relic: relic,
      appUrl: appUrl,
      forge: forge,
      mkdir: mkdir,
      cwd: cwd,
      emptyDirectory: emptyDirectory,
      readdirSync: readdirSync,
      walk: walk,
      exists: exists,
      read: read,
      user: user,
      appDir: appDir,
      appBuildDir: appBuildDir,
      log: log,
      path: path,
      write: write,
      pages: appPages,
      getDirectories: getDirectories,
      timespan: timespan,
      request: request,
      on: eventEmitter.addListener,
      emit: eventEmitter.emit,
      dateformat: dateformat,
      exit: exit,
      get: get
    }
  }
  return process.agartha

}())

exports.agartha = agartha

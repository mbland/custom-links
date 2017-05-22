'use strict'

var net = require('net')
var path = require('path')
var spawn = require('child_process').spawn

var rootDir = path.dirname(path.dirname(__dirname))
var packageInfo = require(path.join(rootDir, 'package.json'))
var serverMain = path.join(rootDir, packageInfo.main)
var testConfigPath = path.join(__dirname, 'test-config.json')
var testConfig = require(testConfigPath)

module.exports = exports = {
  ROOT_DIR: rootDir,
  PACKAGE_INFO: packageInfo,
  SERVER_MAIN: serverMain,
  TEST_CONFIG_PATH: testConfigPath,

  baseConfig: function() {
    return JSON.parse(JSON.stringify(testConfig))
  },

  pickUnusedPort: function() {
    return new Promise(function(resolve) {
      var server = net.createServer()

      server.listen(0, function() {
        var port = server.address().port
        server.on('close', function() {
          resolve(port)
        })
        server.close()
      })
    })
  },

  launchRedis: function(port) {
    return new Promise(function(resolve, reject) {
      var redisServer,
          stdout = ''

      redisServer = spawn('redis-server',
        ['--port', port, '--save', '', '--appendonly', 'no',
          '--dbfilename', 'some-nonexistent-file.db'])

      redisServer.stdout.on('data', function(data) {
        stdout += data
        if (stdout.match('The server is now ready to accept connections')) {
          resolve({ port: port, server: redisServer })
        }
      })
      redisServer.on('error', function(err) {
        reject(new Error('failed to start redis-server on port ' + port +
          ': ' + err))
      })
    })
  },

  launchServer: function(port, redisPort) {
    return new Promise(function(resolve, reject) {
      var output = { stdout: '', stderr: '' },
          server,
          okString = exports.PACKAGE_INFO.name + ' listening on port '

      // TODO: Update test config to allow this port to be used.
      process.env.URL_POINTERS_PORT = port
      process.env.URL_POINTERS_REDIS_PORT = redisPort
      server = spawn('node', [ exports.SERVER_MAIN, exports.TEST_CONFIG_PATH ])

      server.stdout.on('data', function(data) {
        output.stdout += data
        if (output.stdout.match(okString)) {
          setTimeout(resolve, 250, {server: server, port: port, output: output})
        }
      })
      server.stderr.on('data', function(data) {
        output.stderr += data
        reject(new Error(output.stderr))
      })
      server.on('error', function(err) {
        err.message = 'failed to start ' + exports.SERVER_MAIN + ': ' +
          err.message
        reject(err)
      })
    })
  },

  launchAll: function() {
    var redisInfo
    return exports.pickUnusedPort()
      .then(exports.launchRedis)
      .then(function(result) {
        redisInfo = result
        return exports.pickUnusedPort()
      })
      .then(function(port) {
        return exports.launchServer(port, redisInfo.port)
      })
      .then(function(serverInfo) {
        serverInfo.redis = redisInfo
        return serverInfo
      })
  },

  killServer: function(server, signal) {
    return new Promise(function(resolve) {
      signal = signal || 'SIGTERM'
      server.on('exit', function() {
        resolve()
      })
      server.kill(signal)
    })
  }
}

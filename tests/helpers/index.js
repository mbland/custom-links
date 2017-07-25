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

  baseConfig() {
    return JSON.parse(JSON.stringify(testConfig))
  },

  pickUnusedPort() {
    return new Promise(resolve => {
      var server = net.createServer()

      server.listen(0, () => {
        var port = server.address().port
        server.on('close', () => resolve(port))
        server.close()
      })
    })
  },

  launchRedis(port) {
    return new Promise((resolve, reject) => {
      var redisServer,
          stdout = ''

      redisServer = spawn('redis-server',
        ['--port', port, '--save', '', '--appendonly', 'no',
          '--dbfilename', 'some-nonexistent-file.db'])

      redisServer.stdout.on('data', data => {
        stdout += data
        if (stdout.match('[Rr]eady to accept connections')) {
          resolve({ port: port, server: redisServer })
        }
      })
      redisServer.on('error', err => {
        reject(new Error('failed to start redis-server on port ' + port +
          ': ' + err))
      })
    })
  },

  launchServer(port, redisPort, configPath) {
    return new Promise((resolve, reject) => {
      var args = [ exports.SERVER_MAIN ],
          output = { stdout: '', stderr: '' },
          server,
          okString = exports.PACKAGE_INFO.name + ' listening on port '

      if (configPath) {
        args.push(configPath)
      } else if (configPath !== null && !process.env.CUSTOM_LINKS_CONFIG_PATH) {
        args.push(path.join(__dirname, 'system-test-config.json'))
      }

      process.env.CUSTOM_LINKS_PORT = port
      process.env.CUSTOM_LINKS_REDIS_PORT = redisPort
      process.env.CUSTOM_LINKS_TEST_AUTH = 'mbland@acm.org'
      server = spawn('node', args)

      server.stdout.on('data', data => {
        output.stdout += data
        if (output.stdout.match(okString)) {
          resolve({server: server, port: port, output: output})
        }
      })
      server.stderr.on('data', data => {
        output.stderr += data
        reject(new Error(output.stderr))
      })
      server.on('error', err => {
        err.message = 'failed to start ' + exports.SERVER_MAIN + ': ' +
          err.message
        reject(err)
      })
    })
  },

  launchAll(configPath) {
    var redisInfo
    return exports.pickUnusedPort()
      .then(exports.launchRedis)
      .catch(err => {
        err.message = 'Failed to launch redis server: ' + err.message
        return Promise.reject(err)
      })
      .then(result => {
        redisInfo = result
        return exports.pickUnusedPort()
          .then(port => exports.launchServer(port, redisInfo.port, configPath))
          .catch(err => {
            err.message = 'Failed to launch server: ' + err.message
            return exports.killServer(redisInfo.server)
              .then(() => Promise.reject(err))
          })
          .then(serverInfo => {
            serverInfo.redis = redisInfo
            return serverInfo
          })
      })
  },

  killServer(server, signal) {
    return new Promise(resolve => {
      if (!server) {
        return
      }
      signal = signal || 'SIGTERM'
      server.on('exit', resolve)
      server.kill(signal)
    })
  }
}

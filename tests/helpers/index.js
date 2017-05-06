'use strict'

var net = require('net')
var spawn = require('child_process').spawn
var testConfig = require('./test-config.json')

module.exports = {
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
  }
}

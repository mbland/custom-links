'use strict'

var spawn = require('child_process').spawn
var path = require('path')
var helpers = require('./helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var rootDir = path.dirname(__dirname)
var packageInfo = require(path.join(rootDir, 'package.json'))
var scriptPath = path.join(rootDir, packageInfo.main)
var testConfigPath = path.join(rootDir, 'tests', 'helpers', 'test-config.json')

chai.should()
chai.use(chaiAsPromised)

describe('Smoke test', function() {
  var urlpServer, redisServer, launchServer, stdout, stderr, exitCode = 0

  before(function() {
    return helpers.pickUnusedPort()
      .then(helpers.launchRedis)
      .then(function(redisData) {
        process.env.URL_POINTERS_REDIS_PORT = redisData.port
        redisServer = redisData.server
      })
  })

  launchServer = function() {
    return new Promise(function(resolve, reject) {
      stdout = ''
      stderr = ''

      urlpServer = spawn('node', [ scriptPath, testConfigPath ])

      urlpServer.stdout.on('data', function(data) {
        stdout += data
      })
      urlpServer.stderr.on('data', function(data) {
        stderr += data
      })
      urlpServer.on('close', function(code) {
        exitCode = code
      })
      urlpServer.on('error', function(err) {
        err.message = 'failed to start ' + scriptPath + ': ' + err.message
        reject(err)
      })

      setTimeout(resolve, 500)
    })
  }

  afterEach(function() {
    return helpers.killServer(urlpServer)
  })

  after(function() {
    return helpers.killServer(redisServer)
  })

  it('launches successfully using a well-formed config file', function() {
    return launchServer().should.be.fulfilled
      .then(function() {
        stdout.should.have.string(packageInfo.name + ' listening on port ')
        stderr.should.equal('')
        exitCode.should.equal(0)
      })
  })
})

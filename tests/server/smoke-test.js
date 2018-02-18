'use strict'

var path = require('path')
var helpers = require('../helpers')
var EnvVars = require('../helpers/env-vars')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiAsPromised)

describe('Smoke test', function() {
  var testConfig = path.join(
        path.dirname(__dirname), 'helpers', 'system-test-config.json'),
      doLaunch,
      serverInfo,
      envVars

  this.timeout(5000)

  beforeEach(function() {
    serverInfo = null
    envVars = new EnvVars('CUSTOM_LINKS_')
    envVars.saveEnvVars()
  })

  afterEach(function() {
    envVars.restoreEnvVars()
    if (serverInfo === null) {
      return
    }
    return helpers.killServer(serverInfo.server).then(function() {
      return helpers.killServer(serverInfo.redis.server)
    })
  })

  doLaunch = function(configPath) {
    return helpers.launchAll(configPath).should.be.fulfilled
      .then(function(result) {
        serverInfo = result
        serverInfo.output.stdout.should.have.string(
          helpers.PACKAGE_INFO.name + ' listening on port ')
        serverInfo.output.stderr.should.equal('')
      })
  }

  it('launches using the default system-test-config.json', function() {
    return doLaunch()
  })

  it('launches using a config path command line argument', function() {
    return doLaunch(testConfig)
  })

  it('launches using CUSTOM_LINKS_CONFIG_PATH', function() {
    envVars.setEnvVar('CUSTOM_LINKS_CONFIG_PATH', testConfig)
    return doLaunch()
  })

  it('fails to launch due to missing variables', function() {
    return doLaunch(null).should.be.rejectedWith(Error,
      'missing AUTH_PROVIDERS')
  })

  it('fails due to a bad redis connection', function() {
    // Find an unused port so that the attempt to connect to Redis on that port
    // fails. This is less flaky than using a bogus hostname, since some DNS
    // providers may convert the failed name lookup into a search query (such as
    // those provided by coffee shop WiFi).
    return helpers.pickUnusedPort()
      .then(port => helpers.launchServer(port, port))
      .should.be.rejectedWith(Error, /Redis connection to [^ ]*:[0-9]+ failed/)
  })
})

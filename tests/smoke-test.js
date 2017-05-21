'use strict'

var helpers = require('./helpers')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiAsPromised)

describe('Smoke test', function() {
  var serverInfo

  beforeEach(function() {
    this.timeout(5000)
    return helpers.launchAll().then(function(result) {
      serverInfo = result
    })
  })

  afterEach(function() {
    return helpers.killServer(serverInfo.server).then(function() {
      return helpers.killServer(serverInfo.redis.server)
    })
  })

  it('launches successfully using a well-formed config file', function() {
    serverInfo.output.stdout.should.have.string(
      helpers.PACKAGE_INFO.name + ' listening on port ')
    serverInfo.output.stderr.should.equal('')
  })
})

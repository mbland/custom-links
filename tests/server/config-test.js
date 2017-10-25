'use strict'

var Config = require('../../lib/config')
var helpers = require('../helpers')
var EnvVars = require('../helpers/env-vars')
var path = require('path')

var sinon = require('sinon')
var chai = require('chai')
var expect = chai.expect
chai.should()

var TEST_CONFIG_PATH = path.join(
  path.dirname(__dirname), 'helpers', 'test-config.json')

describe('config', function() {
  var envVars

  beforeEach(function() {
    envVars = new EnvVars('CUSTOM_LINKS_')
    envVars.saveEnvVars()
  })

  afterEach(function() {
    envVars.restoreEnvVars()
  })

  it('validates a good config', function() {
    var configData = helpers.baseConfig(),
        config = new Config(configData)
    expect(JSON.stringify(config)).to.equal(JSON.stringify(configData))
  })

  it('converts users and domains to lowercase', function() {
    var configData = helpers.baseConfig(),
        config

    configData.users = ['MBland@acm.org']
    configData.domains = ['ACM.org']
    config = new Config(configData)
    expect(config.users).to.eql(['mbland@acm.org'])
    expect(config.domains).to.eql(['acm.org'])
  })

  it('raises errors for missing fields', function() {
    var errors = [
      'missing PORT',
      'missing AUTH_PROVIDERS',
      'missing SESSION_SECRET',
      'at least one of "users" or "domains" must be specified'
    ]
    expect(function() { return new Config({}) }).to.throw(Error,
      'Invalid configuration:\n  ' + errors.join('\n  '))
  })

  it('raises errors for missing provider fields', function() {
    var configData = helpers.baseConfig(),
        errors = [
          'missing GOOGLE_CLIENT_ID',
          'missing GOOGLE_CLIENT_SECRET',
          'missing GOOGLE_CALLBACK_URL'
        ]

    delete configData.GOOGLE_CLIENT_ID
    delete configData.GOOGLE_CLIENT_SECRET
    delete configData.GOOGLE_CALLBACK_URL
    expect(function() { return new Config(configData) }).to.throw(Error,
      'Invalid configuration:\n  ' + errors.join('\n  '))
  })

  it('raises errors for unknown properties', function() {
    var configData = helpers.baseConfig(),
        errors = [
          'unknown property foo',
          'unknown property bar',
          'unknown property baz'
        ]

    configData.foo = 'quux'
    configData.bar = 'xyzzy'
    configData.baz = 'plugh'

    expect(function() { return new Config(configData) }).to.throw(Error,
      'Invalid configuration:\n  ' + errors.join('\n  '))
  })

  it('raises an error for unknown AUTH_PROVIDERS', function() {
    var configData = helpers.baseConfig()

    configData.AUTH_PROVIDERS.push('frobozz-magic-auth')
    expect(function() { return new Config(configData) }).to.throw(Error,
      'Invalid configuration:\n  unknown auth provider frobozz-magic-auth')
  })

  it('loads fields from the environment', function() {
    var inputConfig = helpers.baseConfig(),
        compareConfig = helpers.baseConfig(),
        properties = [
          'PORT',
          'AUTH_PROVIDERS',
          'SESSION_SECRET',
          'SESSION_MAX_AGE',
          'REDIS_HOST',
          'REDIS_PORT',
          'GOOGLE_CLIENT_ID',
          'GOOGLE_CLIENT_SECRET',
          'GOOGLE_CALLBACK_URL'
        ],
        config

    inputConfig.REDIS_HOST = compareConfig.REDIS_HOST = 'redis'
    inputConfig.REDIS_PORT = compareConfig.REDIS_PORT = 666

    properties.forEach(function(name) {
      var value = inputConfig[name]
      envVars.setEnvVar(name, value instanceof Array ? value.join(',') : value)
      delete inputConfig[name]
    })

    config = new Config(inputConfig)
    expect(config.PORT).to.equal(compareConfig.PORT)
    expect(config.AUTH_PROVIDERS).to.eql(compareConfig.AUTH_PROVIDERS)
    expect(config.SESSION_SECRET)
      .to.equal(compareConfig.SESSION_SECRET)
    expect(config.SESSION_MAX_AGE)
      .to.equal(compareConfig.SESSION_MAX_AGE)
    expect(config.REDIS_HOST)
      .to.equal(compareConfig.REDIS_HOST)
    expect(config.REDIS_PORT)
      .to.equal(compareConfig.REDIS_PORT)
    expect(config.GOOGLE_CLIENT_ID)
      .to.equal(compareConfig.GOOGLE_CLIENT_ID)
    expect(config.GOOGLE_CLIENT_SECRET)
      .to.equal(compareConfig.GOOGLE_CLIENT_SECRET)
    expect(config.GOOGLE_CALLBACK_URL)
      .to.equal(compareConfig.GOOGLE_CALLBACK_URL)
  })

  it('uses environment variables to override config file values', function() {
    var fileData = helpers.baseConfig(),
        origPort = fileData.PORT,
        config

    process.env.CUSTOM_LINKS_PORT = origPort + 1
    config = new Config(fileData)
    config.PORT.should.equal(origPort + 1)
  })

  it('loads a valid config from a direct file path', function() {
    var logger = { info: function() { }  },
        configData = helpers.baseConfig(),
        config

    sinon.stub(logger, 'info')
    config = Config.fromFile(TEST_CONFIG_PATH, logger)
    expect(JSON.stringify(config)).to.equal(JSON.stringify(configData))
    expect(logger.info.args).to.eql(
      [[ 'reading configuration from ' + TEST_CONFIG_PATH ]])
  })

  it('raises an error if the config file doesn\'t exist', function() {
    var logger = { info: function() { }  },
        configPath = path.join(__dirname, 'nonexistent.json')

    sinon.stub(logger, 'info')
    expect(function() { return Config.fromFile(configPath, logger) })
      .to.throw(Error, 'failed to load configuration: ')
    expect(logger.info.args).to.eql(
      [[ 'reading configuration from ' + configPath ]])
  })

  it('raises an error loading an invalid config from a file', function() {
    var logger = { info: function() { }  }

    sinon.stub(logger, 'info')
    expect(function() { return Config.fromFile(__filename, logger) })
      .to.throw(Error, 'failed to load configuration: invalid JSON: ')
    expect(logger.info.args).to.eql(
      [[ 'reading configuration from ' + __filename ]])
  })
})

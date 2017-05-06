'use strict'

var fs = require('fs')

module.exports = Config

function Config(configData) {
  var config = this

  applyEnvUpdates(configData)
  validateConfig(configData)

  Object.keys(configData).forEach(function(key) {
    config[key] = configData[key]
  })
}

Config.fromFile = function(configPath, logger) {
  var errorPrefix

  try {
    logger.info('reading configuration from ' + configPath)
    return new Config(JSON.parse(fs.readFileSync(configPath, 'utf8')))

  } catch (err) {
    errorPrefix = 'failed to load configuration: '
    if (err instanceof SyntaxError) {
      errorPrefix += 'invalid JSON: '
    }
    err.message = errorPrefix + err.message
    throw err
  }
}

var schema = {
  requiredTopLevelFields: {
    PORT: 'port on which the server will listen for requests',
    redirectUrl: 'URL to which the OAuth provider will redirect the client',
    GOOGLE_CLIENT_ID: 'Google application ID for OAuth authentication',
    GOOGLE_CLIENT_SECRET: 'Google application secret for OAuth authentication',
    SESSION_SECRET: 'secret key used to encrypt sessions'
  },
  optionalTopLevelFields: {
    users: 'list of authorized usernames (email addresses)',
    domains: 'list of authorized domains'
  }
}

function applyEnvUpdates(configData) {
  var envProperties = [
    'PORT',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET'
  ]

  envProperties.forEach(function(property) {
    var envVar = process.env['URL_POINTERS_' + property]
    if (!configData[property] && envVar !== undefined) {
      configData[property] = envVar
    }
  })
}

function validateConfig(config) {
  var errors = [],
      users = config.users || [],
      domains = config.domains || []

  findMissingFields(schema.requiredTopLevelFields, config, errors)
  findUnknownFields(schema.requiredTopLevelFields,
    schema.optionalTopLevelFields, config, errors)

  if (users.length + domains.length === 0) {
    errors.push('at least one of "users" or "domains" must be specified')
  }

  if (errors.length !== 0) {
    throw new Error('Invalid configuration:\n  ' + errors.join('\n  '))
  }
}

function findMissingFields(required, target, errors) {
  return Object.keys(required).filter(function(field) {
    return !target.hasOwnProperty(field)
  })
  .forEach(function(missing) {
    errors.push('missing ' + missing)
  })
}

function findUnknownFields(required, optional, target, errors) {
  return Object.keys(target).filter(function(field) {
    return !(required.hasOwnProperty(field) || optional.hasOwnProperty(field))
  })
  .forEach(function(unknown) {
    errors.push('unknown property ' + unknown)
  })
}

'use strict'

var fs = require('fs')

module.exports = Config

function Config(configData) {
  var config = this,
      numericValues = {
        PORT: true,
        SESSION_MAX_AGE: true,
        REDIS_PORT: true
      }

  applyEnvUpdates(configData)
  validateConfig(configData)

  Object.keys(configData).forEach(key => {
    var value = configData[key]
    config[key] = numericValues[key] ? parseInt(value) : value
  })
}

Config.fromFile = (configPath, logger) => {
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
    AUTH_PROVIDERS: 'names of the authentication providers to use',
    SESSION_SECRET: 'secret key used to encrypt sessions'
  },
  optionalTopLevelFields: {
    SESSION_MAX_AGE: 'maximum age of a session, in seconds',
    REDIS_PORT: 'redis-server port',
    users: 'list of authorized usernames (email addresses)',
    domains: 'list of authorized domains'
  },
  requiredProviderFields: {
    'test': {
    }
  }
}

var providers = [
  'google'
]

providers.forEach(provider => {
  schema.requiredProviderFields[provider] = require('./auth/' + provider).config
})

function applyEnvUpdates(configData) {
  var envProperties = [
    'PORT',
    'AUTH_PROVIDERS',
    'SESSION_SECRET',
    'SESSION_MAX_AGE',
    'REDIS_PORT'
  ]

  envProperties.forEach(assignEnvVarToConfigProperty(configData))

  if (configData.AUTH_PROVIDERS === undefined) {
    return
  } else if (typeof configData.AUTH_PROVIDERS === 'string') {
    configData.AUTH_PROVIDERS = configData.AUTH_PROVIDERS.split(',')
  }
  requiredAuthProviderFields(configData.AUTH_PROVIDERS)
    .forEach(assignEnvVarToConfigProperty(configData))
}

function assignEnvVarToConfigProperty(configData) {
  return property => {
    var envVar = process.env['CUSTOM_LINKS_' + property]
    if (!configData[property] && envVar !== undefined) {
      configData[property] = envVar
    }
  }
}

function requiredAuthProviderFields(authProviders) {
  var collectFields = (result, provider) => {
    var fields = Object.keys(schema.requiredProviderFields[provider] || {})
    return result.concat(fields)
  }
  return authProviders.reduce(collectFields, [])
}

function allAuthProviderFields() {
  return requiredAuthProviderFields(Object.keys(schema.requiredProviderFields))
}

function validateConfig(config) {
  var errors = [],
      errMsg,
      requiredFields,
      optionalFields,
      authProviders = config.AUTH_PROVIDERS || [],
      users = config.users || [],
      domains = config.domains || []

  requiredFields = Object.keys(schema.requiredTopLevelFields).concat(
    requiredAuthProviderFields(authProviders))
  optionalFields = Object.keys(schema.optionalTopLevelFields).concat(
    allAuthProviderFields())

  findMissingFields(requiredFields, config, errors)
  findUnknownFields(requiredFields, optionalFields, config, errors)

  authProviders.forEach(provider => {
    if (!schema.requiredProviderFields.hasOwnProperty(provider)) {
      errors.push('unknown auth provider ' + provider)
    }
  })

  if (users.length + domains.length === 0) {
    errors.push('at least one of "users" or "domains" must be specified')
  }

  if (errors.length !== 0) {
    errMsg = 'Invalid configuration:\n  ' + errors.join('\n  ')
    throw new Error(errMsg)
  }
}

function findMissingFields(required, target, errors) {
  return required.filter(field => !target.hasOwnProperty(field))
    .forEach(missing => errors.push('missing ' + missing))
}

function findUnknownFields(required, optional, target, errors) {
  var knownFields = {},
      collectFields = (result, field) => {
        result[field] = null
        return result
      }

  required.concat(optional)
    .reduce(collectFields, knownFields)

  return Object.keys(target)
    .filter(field => !knownFields.hasOwnProperty(field))
    .forEach(unknown => errors.push('unknown property ' + unknown))
}

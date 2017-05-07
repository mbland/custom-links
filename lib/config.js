'use strict'

var fs = require('fs')

module.exports = Config

function Config(configData) {
  var config = this,
      numericValues = {
        PORT: true,
        SESSION_MAX_AGE: true
      }

  applyEnvUpdates(configData)
  validateConfig(configData)

  Object.keys(configData).forEach(function(key) {
    var value = configData[key]
    config[key] = numericValues[key] ? parseInt(value) : value
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
    AUTH_PROVIDERS: 'names of the authentication providers to use',
    SESSION_SECRET: 'secret key used to encrypt sessions'
  },
  optionalTopLevelFields: {
    SESSION_MAX_AGE: 'maximum age of a session, in seconds',
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

providers.forEach(function(provider) {
  schema.requiredProviderFields[provider] = require('./auth/' + provider).config
})

function applyEnvUpdates(configData) {
  var envProperties = [
    'PORT',
    'AUTH_PROVIDERS',
    'SESSION_SECRET',
    'SESSION_MAX_AGE'
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
  return function(property) {
    var envVar = process.env['URL_POINTERS_' + property]
    if (!configData[property] && envVar !== undefined) {
      configData[property] = envVar
    }
  }
}

function requiredAuthProviderFields(authProviders) {
  var collectFields = function(result, provider) {
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

  authProviders.forEach(function(provider) {
    if (!schema.requiredProviderFields.hasOwnProperty(provider)) {
      errors.push('unknown auth provider ' + provider)
    }
  })

  if (users.length + domains.length === 0) {
    errors.push('at least one of "users" or "domains" must be specified')
  }

  if (errors.length !== 0) {
    throw new Error('Invalid configuration:\n  ' + errors.join('\n  '))
  }
}

function findMissingFields(required, target, errors) {
  return required.filter(function(field) {
    return !target.hasOwnProperty(field)
  })
  .forEach(function(missing) {
    errors.push('missing ' + missing)
  })
}

function findUnknownFields(required, optional, target, errors) {
  var knownFields = {},
      collectFields = function(result, field) {
        result[field] = null
        return result
      }

  required.concat(optional)
    .reduce(collectFields, knownFields)
  return Object.keys(target).filter(function(field) {
    return !knownFields.hasOwnProperty(field)
  })
  .forEach(function(unknown) {
    errors.push('unknown property ' + unknown)
  })
}

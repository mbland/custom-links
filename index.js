'use strict'

var config = require('./lib/config').fromFile(
      process.argv[2] || process.env.URL_POINTERS_CONFIG_PATH, console)

var packageInfo = require('./package.json')
var express = require('express')
var app = express()
var redis = require('redis')
var RedirectDb = require('./lib/redirect-db')
var RedisClient = require('./lib/redis-client')
var redisClientOptions = {}
var session = require('express-session')
var RedisStore = require('connect-redis')(session)
var redisStoreOptions = {}
var urlPointers = require('./lib')
var morgan = require('morgan')
var logger = console

if (config.REDIS_PORT !== undefined) {
  redisClientOptions.port = config.REDIS_PORT
  redisStoreOptions.port = config.REDIS_PORT
}

var redisClient = redis.createClient(redisClientOptions)

app.use(morgan('combined'))
urlPointers.assembleApp(
  app,
  new RedirectDb(new RedisClient(redisClient, logger)),
  logger,
  new RedisStore(redisStoreOptions),
  config)

var server = app.listen(config.PORT)

process.on('exit', function() {
  server.close()
  redisClient.quit()
})
logger.log(packageInfo.name + ' listening on port ' + config.PORT)

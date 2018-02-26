'use strict'

var Config = require('./lib/config')
var configFile = process.argv[2] || process.env.CUSTOM_LINKS_CONFIG_PATH
var Log = require('log')
var log = new Log('info')
var config = configFile ? Config.fromFile(configFile, log) : new Config({})

var packageInfo = require('./package.json')
var express = require('express')
var app = express()
var redis = require('redis')
var LinkDb = require('./lib/link-db')
var RedisClient = require('./lib/redis')
var redisClientOptions = {}
var session = require('express-session')
var RedisStore = require('connect-redis')(session)
var redisStoreOptions = {}
var customLinks = require('./lib')
var morgan = require('morgan')

redisClientOptions.host = redisStoreOptions.host = config.REDIS_HOST
redisClientOptions.port = redisStoreOptions.port = config.REDIS_PORT

var redisClient = redis.createClient(redisClientOptions)

app.use(morgan('combined'))
customLinks.assembleApp(
  app,
  new LinkDb(new RedisClient(redisClient, config)),
  log,
  new RedisStore(redisStoreOptions),
  config)

var server = { close() { } }

redisClient.on('ready', () => {
  server = app.listen(config.PORT)
  log.info(packageInfo.name + ' listening on port ' + config.PORT)
})

process.on('exit', () => {
  server.close()
  redisClient.quit()
})

'use strict'

var config = require('./lib/config').fromFile(
      process.argv[2] || process.env.URL_POINTERS_CONFIG_PATH, console)

var packageInfo = require('./package.json')
var express = require('express')
var app = express()
var redis = require('redis')
var RedirectDb = require('./lib/redirect-db')
var RedisClient = require('./lib/redis-client')
var urlPointers = require('./lib')
var logger = console

urlPointers.assembleApp(
  app,
  new RedirectDb(new RedisClient(redis.createClient(), logger)),
  logger)
app.listen(config.PORT)
logger.log(packageInfo.name + ' listening on port ' + config.PORT)

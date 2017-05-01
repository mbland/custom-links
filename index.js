'use strict'

var PORT = 3000

var packageInfo = require('./package.json')
var express = require('express')
var app = express()
var redis = require('redis')
var RedirectDb = require('./lib/redirect-db')
var RedisClient = require('./lib/redis-client')
var urlPointers = require('./lib')

urlPointers.assembleApp(
  new RedirectDb(new RedisClient(redis.createClient()), console),
  app)
app.listen(PORT)
console.log(packageInfo.name + ' listening on port ' + PORT)

'use strict'

var express = require('express')
var app = express()
var istanbulMiddleware = require('istanbul-middleware')
var path = require('path')
var url = require('url')
var rootDir = path.dirname(path.dirname(__dirname))

istanbulMiddleware.hookLoader(rootDir)

app.use('/coverage', istanbulMiddleware.createHandler())
app.get('/coverage.json', function(req, res) {
  res.json(global.__coverage__ || {})
})

app.use('/', istanbulMiddleware.createClientHandler(rootDir, {
  matcher(req) {
    return /\.js$/.test(req.url) &&
      ! (/\/(vendor|generated)\//.test(req.url) || /\.min\.js$/.test(req.url))
  },
  pathTransformer(req) {
    var pathname = url.parse(req.url).pathname.substring(1)
    return path.resolve(rootDir, 'public', pathname)
  }
}))

module.exports = app

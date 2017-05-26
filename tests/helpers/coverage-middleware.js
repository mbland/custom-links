'use strict'

var istanbulMiddleware = require('istanbul-middleware')
var path = require('path')
var url = require('url')
var rootDir = path.dirname(path.dirname(__dirname))

istanbulMiddleware.hookLoader(rootDir)

module.exports = istanbulMiddleware.createClientHandler(rootDir, {
  pathTransformer(req) {
    var pathname = url.parse(req.url).pathname.substring(1)

    if (/\/(vendor|generated)\//.test(pathname) ||
        /\.min\.js$/.test(pathname)) {
      return null
    }
    return path.resolve(rootDir, 'public', pathname)
  }
})

'use strict'

var http = require('http')

module.exports = AppHelper

function AppHelper(app) {
  this.server = http.createServer(app).listen(0)
  this.port = this.server.address().port
}

AppHelper.prototype.sendRequest = function(method, url) {
  var port = this.port

  return new Promise(function(resolve, reject) {
    var options = {
          protocol: 'http:',
          host:     'localhost',
          port:     port,
          path:     url,
          method:   method
        },
        req

    req = http.request(options, function(res) {
      var result = ''

      res.setEncoding('utf8')
      res.on('data', function(chunk) {
        result += chunk
      })
      res.on('end', function() {
        if (res.statusCode === 200) {
          resolve(result)
        } else if (res.statusCode === 302) {
          resolve(res.headers['location'] || 'Location missing')
        } else {
          reject(new Error(res.statusCode + ': ' + result))
        }
      })
    })
    req.on('error', function(err) {
      reject(new Error('Unexpected HTTP error: ' + err.message))
    })
    req.end()
  })
}

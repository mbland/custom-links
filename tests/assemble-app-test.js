'use strict'

var assembleApp = require('../lib').assembleApp
var RedirectDb = require('../lib/redirect-db')
var http = require('http')
var express = require('express')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

describe('assembleApp', function() {
  var redirectDb, getRedirect, expressApp, server, port, sendRequest

  before(function() {
    redirectDb = new RedirectDb
    expressApp = express()
    assembleApp(redirectDb, expressApp)
    server = http.createServer(expressApp).listen(0)
    port = server.address().port
  })

  beforeEach(function() {
    getRedirect = sinon.stub(redirectDb, 'getRedirect')
  })

  afterEach(function() {
    getRedirect.restore()
  })

  sendRequest = function(method, url) {
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

  it('returns the index page', function() {
    return sendRequest('GET', '/').should.be.fulfilled.then(function(result) {
      result.match('Url Pointers').should.exist
    })
  })

  it('redirects to the url returned by the RedirectDb', function() {
    var redirectLocation = 'https://mike-bland.com/'
    getRedirect.withArgs('/foo').returns(Promise.resolve(redirectLocation))
    return sendRequest('GET', '/foo').should.become(redirectLocation)
  })

  it('reports an error', function() {
    getRedirect.withArgs('/foo').callsFake(function() {
      return Promise.reject('forced error')
    })
    return sendRequest('GET', '/foo').should.be.rejectedWith(Error, 
      '500: Error while processing /foo: forced error')
  })
})

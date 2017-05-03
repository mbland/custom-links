'use strict'

var assembleApp = require('../lib').assembleApp
var RedirectDb = require('../lib/redirect-db')
var AppHelper = require('./helpers/app-helper')
var express = require('express')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var expect = chai.expect
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

describe('assembleApp', function() {
  var app, redirectDb, logger

  before(function() {
    redirectDb = new RedirectDb
    logger = { error: function() { } }
    app = new AppHelper(assembleApp(express(), redirectDb, logger))
  })

  describe('get homepage and redirects', function() {
    var getRedirect

    beforeEach(function() {
      getRedirect = sinon.stub(redirectDb, 'getRedirect')
    })

    afterEach(function() {
      getRedirect.restore()
    })

    it('returns the index page', function() {
      return app.sendRequest('GET', '/')
        .should.be.fulfilled.then(function(result) {
          result.match('Url Pointers').should.exist
        })
    })

    it('redirects to the url returned by the RedirectDb', function() {
      var redirectLocation = 'https://mike-bland.com/'
      getRedirect.withArgs('/foo').returns(Promise.resolve(
        { location: redirectLocation, owner: 'mbland', count: 27 }))
      return app.sendRequest('GET', '/foo').should.become(redirectLocation)
    })

    it('redirects to the homepage with nonexistent url parameter', function() {
      getRedirect.withArgs('/foo').returns(Promise.resolve(null))
      return app.sendRequest('GET', '/foo').should.become('/?url=/foo')
    })

    it('reports an error', function() {
      var logError = sinon.spy(logger, 'error')

      getRedirect.withArgs('/foo').callsFake(function() {
        return Promise.reject(new Error('forced error'))
      })
      return app.sendRequest('GET', '/foo')
        .should.be.rejectedWith(Error,
          '500: Error while processing /foo: Error: forced error')
        .then(function() {
          logError.calledOnce.should.be.true
          expect(logError.args[0][0].message).to.equal('forced error')
        })
    })
  })
})

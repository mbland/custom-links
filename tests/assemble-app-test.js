'use strict'

var assembleApp = require('../lib').assembleApp
var RedirectDb = require('../lib/redirect-db')
var AppHelper = require('./helpers/app-helper')
var express = require('express')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

describe('assembleApp', function() {
  var redirectDb, getRedirect, app

  before(function() {
    redirectDb = new RedirectDb
    app = new AppHelper(assembleApp(redirectDb, express()))
  })

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
    getRedirect.withArgs('/foo').returns(Promise.resolve(redirectLocation))
    return app.sendRequest('GET', '/foo').should.become(redirectLocation)
  })

  it('reports an error', function() {
    getRedirect.withArgs('/foo').callsFake(function() {
      return Promise.reject('forced error')
    })
    return app.sendRequest('GET', '/foo').should.be.rejectedWith(Error,
      '500: Error while processing /foo: forced error')
  })
})

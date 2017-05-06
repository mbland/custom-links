'use strict'

var assembleApp = require('../lib').assembleApp
var RedirectDb = require('../lib/redirect-db')
var express = require('express')
var request = require('supertest')
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
    app = new assembleApp(express(), redirectDb, logger)
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
      return request(app)
        .get('/')
        .expect(200)
        .expect(/Url Pointers/)
    })

    it('redirects to the url returned by the RedirectDb', function() {
      var redirectLocation = 'https://mike-bland.com/'
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(
          { location: redirectLocation, owner: 'mbland', count: 27 }))

      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', redirectLocation)
    })

    it('redirects to the homepage with nonexistent url parameter', function() {
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(null))

      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', '/?url=/foo')
    })

    it('reports an error', function() {
      var logError = sinon.spy(logger, 'error')

      getRedirect.withArgs('/foo', { recordAccess: true })
        .callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

      return request(app)
        .get('/foo')
        .expect(500)
        .expect('Error while processing /foo: Error: forced error')
        .then(function() {
          logError.calledOnce.should.be.true
          expect(logError.args[0][0].message).to.equal('forced error')
        })
    })
  })
})

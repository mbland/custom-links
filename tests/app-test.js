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
  var app, redirectDb, logger, logError

  before(function() {
    redirectDb = new RedirectDb
    logger = { error: function() { } }
    app = new assembleApp(express(), redirectDb, logger)
  })

  beforeEach(function() {
    logError = sinon.spy(logger, 'error')
  })

  afterEach(function() {
    logError.restore()
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
        .expect(200, /Url Pointers/)
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
      getRedirect.withArgs('/foo', { recordAccess: true })
        .callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

      return request(app)
        .get('/foo')
        .expect(500, 'Internal Server Error')
        .then(function() {
          logError.calledOnce.should.be.true
          expect(logError.args[0][0].message).to.equal('forced error')
        })
    })
  })

  describe('API', function() {
    describe('unknown or malformed request', function() {
      it('returns bad request', function() {
        return request(app)
          .get('/api')
          .expect(400, 'Bad Request')
      })
    })

    describe('/info', function() {
      var getRedirect

      beforeEach(function() {
        getRedirect = sinon.stub(redirectDb, 'getRedirect')
      })

      afterEach(function() {
        getRedirect.restore()
      })

      it('returns info for an existing URL', function() {
        var urlData = {
          location: 'https://mike-bland.com/', owner: 'mbland', count: 27 }
        getRedirect.withArgs('/foo').returns(Promise.resolve(urlData))

        return request(app)
          .get('/api/info/foo')
          .expect(200)
          .then(function(response) {
            response.body.should.eql(urlData)
          })
      })

      it('returns not found', function() {
        getRedirect.withArgs('/foo').returns(Promise.resolve(null))

        return request(app)
          .get('/api/info/foo')
          .expect(404, 'Not Found')
      })

      it('returns server error', function() {
        getRedirect.withArgs('/foo').callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

        return request(app)
          .get('/api/info/foo')
          .expect(500, 'Internal Server Error')
          .expect(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message).to.equal('forced error')
          })
      })
    })
  })
})

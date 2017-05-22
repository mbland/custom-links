'use strict'

var appLib = require('../lib')
var assembleApp = appLib.assembleApp
var sessionParams = appLib.sessionParams
var Config = require('../lib/config')
var RedirectDb = require('../lib/redirect-db')
var express = require('express')
var request = require('supertest')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var expect = chai.expect
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

var REDIRECT_LOCATION = 'https://mike-bland.com/'

describe('assembleApp', function() {
  var app, redirectDb, logger, logError, config, sessionCookie

  before(function() {
    redirectDb = new RedirectDb
    sinon.stub(redirectDb, 'findUser')
      .returns(Promise.resolve({ id: 'mbland@acm.org' }))

    logger = { error: function() { } }
    config = new Config({
      PORT: 0,
      AUTH_PROVIDERS: [ 'test' ],
      SESSION_SECRET: '<session-secret>',
      users: [ 'mbland@acm.org' ]
    })
    app = express()
    // A null session store will use the in-memory implementation
    app = new assembleApp(app, redirectDb, logger, null, config)
  })

  beforeEach(function() {
    logError = sinon.spy(logger, 'error')
    process.env.URL_POINTERS_TEST_AUTH = 'mbland@acm.org'

    return request(app)
      .get('/auth')
      .expect(302)
      .expect('location', '/auth/callback')
      .then(function(res) {
        sessionCookie = res.headers['set-cookie']
        return request(app)
          .get('/auth/callback')
          .set('cookie', sessionCookie)
          .expect(302)
          .expect('location', '/')
      })
  })

  afterEach(function() {
    delete process.env.URL_POINTERS_TEST_AUTH
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

    it('redirects to /auth if not logged in', function() {
      // Note that `.set('cookie', sessionCookie)` isn't called first
      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', '/auth')
        .then(function(res) {
          sessionCookie = res.headers['set-cookie']
          return request(app)
            .get('/auth')
            .set('cookie', sessionCookie)
            .expect(302)
            .expect('location', '/auth/callback')
        })
        .then(function() {
          return request(app)
            .get('/auth/callback')
            .set('cookie', sessionCookie)
            .expect(302)
            .expect('location', '/foo')
        })
    })

    it('redirects back to /auth if authentication failed', function() {
      // Note that `.set('cookie', sessionCookie)` isn't called first
      return request(app)
        .get('/foo')
        .expect(302)
        .expect('location', '/auth')
        .then(function(res) {
          sessionCookie = res.headers['set-cookie']
          return request(app)
            .get('/auth')
            .set('cookie', sessionCookie)
            .expect(302)
            .expect('location', '/auth/callback')
        })
        .then(function() {
          process.env.URL_POINTERS_TEST_AUTH = 'fail'
          return request(app)
            .get('/auth/callback')
            .set('cookie', sessionCookie)
            .expect(302)
            .expect('location', '/auth')
        })
    })

    it('returns the index page', function() {
      return request(app)
        .get('/')
        .set('cookie', sessionCookie)
        .expect(200, /URL Pointers/)
    })

    it('logs out on /logout', function() {
      return request(app)
        .get('/logout')
        .set('cookie', sessionCookie)
        .expect(302)
        .expect('location', '/auth')
        .then(function() {
          request(app)
            .get('/')
            .set('cookie', sessionCookie)
            .expect(302)
            .expect('location', '/auth')
        })
    })

    it('redirects to the url returned by the RedirectDb', function() {
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(
          { location: REDIRECT_LOCATION, owner: 'mbland@acm.org', count: 27 }))

      return request(app)
        .get('/foo')
        .set('cookie', sessionCookie)
        .expect(302)
        .expect('location', REDIRECT_LOCATION)
    })

    it('redirects to the homepage with nonexistent url parameter', function() {
      getRedirect.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(null))

      return request(app)
        .get('/foo')
        .set('cookie', sessionCookie)
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
        .set('cookie', sessionCookie)
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
          .set('cookie', sessionCookie)
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
          location: 'https://mike-bland.com/',
          owner: 'mbland@acm.org',
          count: 27
        }
        getRedirect.withArgs('/foo').returns(Promise.resolve(urlData))

        return request(app)
          .get('/api/info/foo')
          .set('cookie', sessionCookie)
          .expect(200)
          .then(function(response) {
            response.body.should.eql(urlData)
          })
      })

      it('returns not found', function() {
        getRedirect.withArgs('/foo').returns(Promise.resolve(null))

        return request(app)
          .get('/api/info/foo')
          .set('cookie', sessionCookie)
          .expect(404, 'Not Found')
      })

      it('returns server error', function() {
        getRedirect.withArgs('/foo').callsFake(function() {
          return Promise.reject(new Error('forced error'))
        })

        return request(app)
          .get('/api/info/foo')
          .set('cookie', sessionCookie)
          .expect(500, 'Internal Server Error')
          .expect(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message).to.equal('forced error')
          })
      })
    })

    describe('/create', function() {
      var createRedirect, setArgs, makeRequest

      beforeEach(function() {
        createRedirect = sinon.stub(redirectDb, 'createRedirect')
      })

      afterEach(function() {
        createRedirect.restore()
      })

      setArgs = function() {
        return createRedirect
          .withArgs('/foo', REDIRECT_LOCATION, 'mbland@acm.org')
      }

      makeRequest = function() {
        return request(app)
          .post('/api/create/foo')
          .send({ location: REDIRECT_LOCATION })
          .set('cookie', sessionCookie)
      }

      it('creates a new URL', function() {
        setArgs().returns(Promise.resolve())
        return makeRequest().expect(201)
      })

      it('raises a server error when createRedirect fails', function() {
        setArgs().callsFake(function(url, location, userId) {
          return Promise.reject(new Error('forced error for ' +
            [url, location, userId].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo ' + REDIRECT_LOCATION +
                ' mbland@acm.org')
          })
      })

      it('returns forbidden when a failure isn\'t an Error', function() {
        setArgs().callsFake(function(url, location, userId) {
          return Promise.reject('forced error for ' +
            [url, location, userId].join(' '))
        })

        return makeRequest()
          .expect(403)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .then(function(res) {
            var expected = 'forced error for /foo ' + REDIRECT_LOCATION +
              ' mbland@acm.org'

            expect(res.body.err).to.equal(expected)
            logError.calledOnce.should.be.true
            expect(logError.args[0][0]).to.equal(expected)
          })
      })
    })

    describe('/user', function() {
      var getOwnedRedirects

      beforeEach(function() {
        getOwnedRedirects = sinon.stub(redirectDb, 'getOwnedRedirects')
      })

      afterEach(function() {
        getOwnedRedirects.restore()
      })

      it('returns the list of redirect info owned by the user', function() {
        // Not including the owner, though it would be normally.
        var urls = [
          { url: '/foo', location: REDIRECT_LOCATION, count: 27 },
          { url: '/bar', location: REDIRECT_LOCATION, count: 28 },
          { url: '/baz', location: REDIRECT_LOCATION, count: 29 }
        ]

        getOwnedRedirects.withArgs('mbland@acm.org')
          .returns(Promise.resolve(urls))

        return request(app)
          .get('/api/user/mbland@acm.org')
          .set('cookie', sessionCookie)
          .expect(200)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .then(function(res) {
            expect(res.body.urls).to.eql(urls)
          })
      })

      it('raises a server error', function() {
        getOwnedRedirects.withArgs('mbland@acm.org')
          .callsFake(function(userId) {
            return Promise.reject(new Error('forced error for ' + userId))
          })

        return request(app)
          .get('/api/user/mbland@acm.org')
          .set('cookie', sessionCookie)
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for mbland@acm.org')
          })
      })

      it('returns not found if a user doesn\'t exist', function() {
        getOwnedRedirects.withArgs('mbland@acm.org')
          .callsFake(function(userId) {
            return Promise.reject(userId + ' doesn\'t exist')
          })

        return request(app)
          .get('/api/user/mbland@acm.org')
          .set('cookie', sessionCookie)
          .expect(404)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0])
              .to.equal('mbland@acm.org doesn\'t exist')
          })
      })
    })

    describe('/owner', function() {
      var changeOwner, setArgs, makeRequest

      beforeEach(function() {
        changeOwner = sinon.stub(redirectDb, 'changeOwner')
      })

      afterEach(function() {
        changeOwner.restore()
      })

      setArgs = function() {
        return changeOwner.withArgs('/foo', 'mbland@acm.org', 'msb@example.com')
      }

      makeRequest = function() {
        return request(app)
          .post('/api/owner/foo')
          .send({ owner: 'msb@example.com' })
          .set('cookie', sessionCookie)
      }

      it('sucessfully transforms ownership', function() {
        setArgs().returns(Promise.resolve())
        return makeRequest().expect(204)
      })

      it('raises a server error', function() {
        setArgs().callsFake(function(url, user, owner) {
          return Promise.reject(new Error('forced error for ' +
            [url, user, owner].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo mbland@acm.org msb@example.com')
          })
      })

      it('returns forbidden when the user doesn\'t own the URL', function() {
        setArgs().callsFake(function(url, user) {
          return Promise.reject(user + ' doesn\'t own ' + url)
        })
        return makeRequest()
          .expect(403)
          .then(function(res) {
            res.body.err.should.equal('mbland@acm.org doesn\'t own /foo')
            logError.calledOnce.should.be.true
            expect(logError.args[0][0])
              .to.equal('mbland@acm.org doesn\'t own /foo')
          })
      })
    })

    describe('/location', function() {
      var updateLocation, setArgs, makeRequest

      beforeEach(function() {
        updateLocation = sinon.stub(redirectDb, 'updateLocation')
      })

      afterEach(function() {
        updateLocation.restore()
      })

      setArgs = function() {
        return updateLocation.withArgs(
          '/foo', 'mbland@acm.org', REDIRECT_LOCATION)
      }

      makeRequest = function() {
        return request(app)
          .post('/api/location/foo')
          .send({ location: REDIRECT_LOCATION })
          .set('cookie', sessionCookie)
      }

      it('successfully sets the location', function() {
        setArgs().returns(Promise.resolve())
        return makeRequest().expect(204)
      })

      it('raises a server error', function() {
        setArgs().callsFake(function(url, user, location) {
          return Promise.reject(new Error('forced error for ' +
            [url, user, location].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo mbland@acm.org ' +
                REDIRECT_LOCATION)
          })
      })

      it('returns forbidden when the user doesn\'t own the URL', function() {
        setArgs().callsFake(function(url, user) {
          return Promise.reject(user + ' doesn\'t own ' + url)
        })
        return makeRequest()
          .expect(403)
          .then(function(res) {
            res.body.err.should.equal('mbland@acm.org doesn\'t own /foo')
            logError.calledOnce.should.be.true
            expect(logError.args[0][0])
              .to.equal('mbland@acm.org doesn\'t own /foo')
          })
      })
    })

    describe('/delete', function() {
      var deleteRedirection, setArgs

      beforeEach(function() {
        deleteRedirection = sinon.stub(redirectDb, 'deleteRedirection')
      })

      afterEach(function() {
        deleteRedirection.restore()
      })

      setArgs = function() {
        return deleteRedirection.withArgs('/foo', 'mbland@acm.org')
      }

      it('sucessfully deletes a redirection', function() {
        setArgs().returns(Promise.resolve())
        return request(app)
          .delete('/api/delete/foo')
          .set('cookie', sessionCookie)
          .expect(204)
      })

      it('raises a server error', function() {
        setArgs().callsFake(function(url, user) {
          return Promise.reject(
            new Error('forced error for ' + url + ' ' + user))
        })
        return request(app)
          .delete('/api/delete/foo')
          .set('cookie', sessionCookie)
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo mbland@acm.org')
          })
      })

      it('returns forbidden when the user doesn\'t own the URL', function() {
        setArgs().callsFake(function(url, user) {
          return Promise.reject(user + ' doesn\'t own ' + url)
        })
        return request(app)
          .delete('/api/delete/foo')
          .set('cookie', sessionCookie)
          .expect(403)
          .then(function(res) {
            res.body.err.should.equal('mbland@acm.org doesn\'t own /foo')
            logError.calledOnce.should.be.true
            expect(logError.args[0][0])
              .to.equal('mbland@acm.org doesn\'t own /foo')
          })
      })
    })
  })
})

describe('sessionParams', function() {
  it('uses default session store and max age', function() {
    var params = sessionParams({SESSION_SECRET: 'secret'})
    params.should.eql({
      store: null,
      secret: 'secret',
      resave: true,
      saveUninitialized: true,
      maxAge: appLib.DEFAULT_SESSION_MAX_AGE * 1000
    })
  })

  it('uses supplied session store and configured max age', function() {
    var config = { SESSION_SECRET: 'secret', SESSION_MAX_AGE: 3600 },
        store = {},
        params = sessionParams(config, store)

    params.should.eql({
      store: store,
      secret: 'secret',
      resave: true,
      saveUninitialized: true,
      maxAge: 3600 * 1000
    })
  })

  it('uses session store with touch method and null max age', function() {
    var config = { SESSION_SECRET: 'secret', SESSION_MAX_AGE: null },
        store = { touch: true },
        params = sessionParams(config, store)

    params.should.eql({
      store: store,
      secret: 'secret',
      resave: false,
      saveUninitialized: false,
      maxAge: null
    })
  })

  it('throws an error when max age is negative', function() {
    expect(function() { sessionParams({ SESSION_MAX_AGE: -1 }) })
      .to.throw(Error, 'SESSION_MAX_AGE cannot be negative: -1')
  })
})

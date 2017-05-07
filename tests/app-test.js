'use strict'

var appLib = require('../lib')
var assembleApp = appLib.assembleApp
var sessionParams = appLib.sessionParams
var Config = require('../lib/config')
var RedirectDb = require('../lib/redirect-db')
var testAuth = require('../lib/auth/test')
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
  var app, redirectDb, logger, logError, config, authenticate, sessionCookie

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
    authenticate = sinon.stub(testAuth.strategyImpl, 'authenticate')

    authenticate.callsFake(function(req, info, strategy) {
      if (req.path === '/auth') {
        strategy.redirect('/auth/callback')
      } else if (req.path === '/auth/callback') {
        strategy.success({ id: 'mbland@acm.org' }, info)
      } else {
        strategy.fail()
      }
    })

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
    authenticate.restore()
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

    it('returns the index page', function() {
      return request(app)
        .get('/')
        .set('cookie', sessionCookie)
        .expect(200, /Url Pointers/)
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
        return makeRequest().expect(500)
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
            expect(res.body.err).to.equal(
              'forced error for /foo ' + REDIRECT_LOCATION + ' mbland@acm.org')
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

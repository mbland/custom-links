'use strict'

var appLib = require('../../lib')
var assembleApp = appLib.assembleApp
var sessionParams = appLib.sessionParams
var Config = require('../../lib/config')
var LinkDb = require('../../lib/link-db')
var express = require('express')
var request = require('supertest')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var expect = chai.expect
var sinon = require('sinon')

chai.should()
chai.use(chaiAsPromised)

var LINK_TARGET = 'https://mike-bland.com/'

describe('assembleApp', function() {
  var app, linkDb, logger, logError, config, sessionCookie

  before(function() {
    linkDb = new LinkDb
    sinon.stub(linkDb, 'findOrCreateUser')
      .returns(Promise.resolve({ id: 'mbland@acm.org' }))
    sinon.stub(linkDb, 'findUser')
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
    app = new assembleApp(app, linkDb, logger, null, config)
  })

  beforeEach(function() {
    logError = sinon.spy(logger, 'error')
    process.env.CUSTOM_LINKS_TEST_AUTH = 'mbland@acm.org'

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
    delete process.env.CUSTOM_LINKS_TEST_AUTH
    logError.restore()
  })

  describe('get homepage and links', function() {
    var getLink

    beforeEach(function() {
      getLink = sinon.stub(linkDb, 'getLink')
    })

    afterEach(function() {
      getLink.restore()
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
          process.env.CUSTOM_LINKS_TEST_AUTH = 'fail'
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
        .expect(200, /Custom Links/)
    })

    it('provides the user ID on /id', function() {
      return request(app)
        .get('/id')
        .set('cookie', sessionCookie)
        .expect(200, 'mbland@acm.org')
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

    it('redirects to the target URL returned by the LinkDb', function() {
      getLink.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(
          { target: LINK_TARGET, owner: 'mbland@acm.org', count: 27 }))

      return request(app)
        .get('/foo')
        .set('cookie', sessionCookie)
        .expect(302)
        .expect('location', LINK_TARGET)
    })

    it('redirects to the homepage with nonexistent link parameter', function() {
      getLink.withArgs('/foo', { recordAccess: true })
        .returns(Promise.resolve(null))

      return request(app)
        .get('/foo')
        .set('cookie', sessionCookie)
        .expect(302)
        .expect('location', '/#-/foo')
    })

    it('reports an error', function() {
      getLink.withArgs('/foo', { recordAccess: true })
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
      var getLink

      beforeEach(function() {
        getLink = sinon.stub(linkDb, 'getLink')
      })

      afterEach(function() {
        getLink.restore()
      })

      it('returns info for an existing link', function() {
        var linkData = {
          target: 'https://mike-bland.com/',
          owner: 'mbland@acm.org',
          created: '1234567890',
          updated: '1234567890',
          count: 27
        }
        getLink.withArgs('/foo').returns(Promise.resolve(linkData))

        return request(app)
          .get('/api/info/foo')
          .set('cookie', sessionCookie)
          .expect(200)
          .then(function(response) {
            response.body.should.eql(linkData)
          })
      })

      it('returns not found', function() {
        getLink.withArgs('/foo').returns(Promise.resolve(null))

        return request(app)
          .get('/api/info/foo')
          .set('cookie', sessionCookie)
          .expect(404, 'Not Found')
      })

      it('returns server error', function() {
        getLink.withArgs('/foo').callsFake(function() {
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
      var createLink, setArgs, makeRequest

      beforeEach(function() {
        createLink = sinon.stub(linkDb, 'createLink')
      })

      afterEach(function() {
        createLink.restore()
      })

      setArgs = function() {
        return createLink
          .withArgs('/foo', LINK_TARGET, 'mbland@acm.org')
      }

      makeRequest = function() {
        return request(app)
          .post('/api/create/foo')
          .send({ target: LINK_TARGET })
          .set('cookie', sessionCookie)
      }

      it('creates a new link', function() {
        setArgs().returns(Promise.resolve())
        return makeRequest().expect(201)
      })

      it('raises a server error when createLink fails', function() {
        setArgs().callsFake(function(link, target, userId) {
          return Promise.reject(new Error('forced error for ' +
            [link, target, userId].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo ' + LINK_TARGET +
                ' mbland@acm.org')
          })
      })

      it('returns forbidden when a failure isn\'t an Error', function() {
        setArgs().callsFake(function(link, target, userId) {
          return Promise.reject('forced error for ' +
            [link, target, userId].join(' '))
        })

        return makeRequest()
          .expect(403)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .then(function(res) {
            var expected = 'forced error for /foo ' + LINK_TARGET +
              ' mbland@acm.org'

            expect(res.body.err).to.equal(expected)
            logError.calledOnce.should.be.true
            expect(logError.args[0][0]).to.equal(expected)
          })
      })
    })

    describe('/user', function() {
      var getOwnedLinks

      beforeEach(function() {
        getOwnedLinks = sinon.stub(linkDb, 'getOwnedLinks')
      })

      afterEach(function() {
        getOwnedLinks.restore()
      })

      it('returns the list of redirect info owned by the user', function() {
        // Not including the owner, though it would be normally.
        var links = [
          { link: '/foo', target: LINK_TARGET, count: 27 },
          { link: '/bar', target: LINK_TARGET, count: 28 },
          { link: '/baz', target: LINK_TARGET, count: 29 }
        ]

        getOwnedLinks.withArgs('mbland@acm.org')
          .returns(Promise.resolve(links))

        return request(app)
          .get('/api/user/mbland@acm.org')
          .set('cookie', sessionCookie)
          .expect(200)
          .expect('Content-Type', 'application/json; charset=utf-8')
          .then(function(res) {
            expect(res.body.links).to.eql(links)
          })
      })

      it('raises a server error', function() {
        getOwnedLinks.withArgs('mbland@acm.org')
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
        getOwnedLinks.withArgs('mbland@acm.org')
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
        changeOwner = sinon.stub(linkDb, 'changeOwner')
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
        setArgs().callsFake(function(link, user, owner) {
          return Promise.reject(new Error('forced error for ' +
            [link, user, owner].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo mbland@acm.org msb@example.com')
          })
      })

      it('returns forbidden when the user doesn\'t own the link', function() {
        setArgs().callsFake(function(link, user) {
          return Promise.reject(user + ' doesn\'t own ' + link)
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

    describe('/target', function() {
      var updateTarget, setArgs, makeRequest

      beforeEach(function() {
        updateTarget = sinon.stub(linkDb, 'updateTarget')
      })

      afterEach(function() {
        updateTarget.restore()
      })

      setArgs = function() {
        return updateTarget.withArgs(
          '/foo', 'mbland@acm.org', LINK_TARGET)
      }

      makeRequest = function() {
        return request(app)
          .post('/api/target/foo')
          .send({ target: LINK_TARGET })
          .set('cookie', sessionCookie)
      }

      it('successfully sets the target', function() {
        setArgs().returns(Promise.resolve())
        return makeRequest().expect(204)
      })

      it('raises a server error', function() {
        setArgs().callsFake(function(link, user, target) {
          return Promise.reject(new Error('forced error for ' +
            [link, user, target].join(' ')))
        })
        return makeRequest()
          .expect(500)
          .then(function() {
            logError.calledOnce.should.be.true
            expect(logError.args[0][0].message)
              .to.equal('forced error for /foo mbland@acm.org ' + LINK_TARGET)
          })
      })

      it('returns forbidden when the user doesn\'t own the link', function() {
        setArgs().callsFake(function(link, user) {
          return Promise.reject(user + ' doesn\'t own ' + link)
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
      var deleteLink, setArgs

      beforeEach(function() {
        deleteLink = sinon.stub(linkDb, 'deleteLink')
      })

      afterEach(function() {
        deleteLink.restore()
      })

      setArgs = function() {
        return deleteLink.withArgs('/foo', 'mbland@acm.org')
      }

      it('sucessfully deletes a redirection', function() {
        setArgs().returns(Promise.resolve())
        return request(app)
          .delete('/api/delete/foo')
          .set('cookie', sessionCookie)
          .expect(204)
      })

      it('raises a server error', function() {
        setArgs().callsFake(function(link, user) {
          return Promise.reject(
            new Error('forced error for ' + link + ' ' + user))
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

      it('returns forbidden when the user doesn\'t own the link', function() {
        setArgs().callsFake(function(link, user) {
          return Promise.reject(user + ' doesn\'t own ' + link)
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

'use strict'

var auth = require('../lib/auth')
var RedirectDb = require('../lib/redirect-db')

var sinon = require('sinon')
var chai = require('chai')
var expect = chai.expect
var chaiAsPromised = require('chai-as-promised')

chai.should()
chai.use(chaiAsPromised)

describe('auth', function() {
  var redirectDb, stubs, stubDbMethod

  before(function() {
    redirectDb = new RedirectDb
    stubs = []
  })

  afterEach(function() {
    stubs.forEach(function(stub) {
      stub.restore()
    })
  })

  stubDbMethod = function(method) {
    var stub = sinon.stub(redirectDb, method)
    stubs.push(stub)
    return stub
  }

  describe('findVerifiedEmail', function() {
    it('fails on all empty data', function() {
      expect(auth.findVerifiedEmail([], {})).to.be.undefined
    })

    it('fails on empty email list', function() {
      expect(auth.findVerifiedEmail([],
        { users: [ 'mbland@acm.org' ], domains: [ 'acm.org' ]})
        ).to.be.undefined
    })

    it('succeeds on username match', function() {
      auth.findVerifiedEmail(['mbland@example.com', 'mbland@acm.org'],
        { users: [ 'mbland@foo.com', 'mbland@acm.org' ]})
        .should.equal('mbland@acm.org')
    })

    it('succeeds on domain match', function() {
      auth.findVerifiedEmail(['mbland@example.com', 'mbland@acm.org'],
        { domains: [ 'foo.com', 'acm.org' ]})
        .should.equal('mbland@acm.org')
    })
  })

  describe('verifyGoogle', function() {
    var doVerify, userInfo

    beforeEach(function() {
      userInfo = {
        emails: [
          { value: 'mbland@example.com', type: 'account' },
          { value: 'mbland@acm.org', type: 'account' }
        ]
      }
    })

    doVerify = function(userObj, config) {
      var verifyGoogle = auth.verifyGoogle(redirectDb, config)
      return new Promise(function(resolve, reject) {
        verifyGoogle('access token', 'refresh token', userObj,
          function(err, user) {
            err ? reject(err) : resolve(user)
          })
      })
    }

    it('successfully verifies the user', function() {
      stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
        .returns(Promise.resolve({ id: 'mbland@acm.org' }))

      return doVerify(userInfo, { users: [ 'mbland@acm.org' ]})
        .should.become({ id: 'mbland@acm.org' })
    })

    it('fails to verify the user', function() {
      stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
        .returns(Promise.resolve(true))

      return doVerify(userInfo, {}).should.become(false)
    })

    it('fails to validate the user due to a RedirectDb error', function() {
      stubDbMethod('findOrCreateUser').withArgs('mbland@acm.org')
        .callsFake(function(user) {
          return Promise.reject(new Error('forced error for ' + user))
        })

      return doVerify(userInfo, { users: [ 'mbland@acm.org' ]})
        .should.be.rejectedWith(Error, 'forced error for mbland@acm.org')
    })
  })

  describe('serializeUser', function() {
    it('serializes the user ID', function() {
      return new Promise(
        function(resolve, reject) {
          var serializeUser = auth.serializeUser(redirectDb)
          serializeUser({ id: 'mbland@acm.org' }, function(err, user) {
            err ? reject(err) : resolve(user)
          })
        })
        .should.become('mbland@acm.org')
    })
  })

  describe('deserializeUser', function() {
    var doDeserialize

    doDeserialize = function(user) {
      var deserializeUser = auth.deserializeUser(redirectDb)
      return new Promise(function(resolve, reject) {
        deserializeUser(user, function(err, user) {
          err ? reject(err) : resolve(user)
        })
      })
    }

    it('deserializes the user ID', function() {
      stubDbMethod('userExists').withArgs('mbland@acm.org')
        .returns(Promise.resolve())

      return doDeserialize('mbland@acm.org')
        .should.become({ id: 'mbland@acm.org' })
    })

    it('fails to deserialize the user ID', function() {
      stubDbMethod('userExists').withArgs('mbland@acm.org')
        .returns(Promise.reject('user mbland@acm.org doesn\'t exist'))

      return doDeserialize('mbland@acm.org')
        .should.be.rejectedWith('user mbland@acm.org doesn\'t exist')
    })
  })
})
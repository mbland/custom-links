'use strict'

var RedisClient = require('../lib/redis-client')
var helpers = require('./helpers')
var redis = require('redis')
var sinon = require('sinon')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var REDIRECT_TARGET = 'https://mike-bland.com/'

chai.should()
chai.use(chaiAsPromised)

describe('RedisClient', function() {
  var redisClient, clientImpl, serverPort, redisServer, setData, readOwnerList,
      stubClientImplMethod, stubs

  before(function() {
    return helpers.pickUnusedPort()
      .then(helpers.launchRedis)
      .then(function(redisData) {
        serverPort = redisData.port
        redisServer = redisData.server
        clientImpl = redis.createClient({ port: serverPort })
        redisClient = new RedisClient(clientImpl)
      })
  })

  beforeEach(function() {
    stubs = []
  })

  afterEach(function() {
    stubs.forEach(function(stub) {
      stub.restore()
    })
    return new Promise(function(resolve, reject) {
      clientImpl.flushdb(function(err) {
        err ? reject(err) : resolve()
      })
    })
  })

  after(function() {
    redisServer.kill()
  })

  setData = function(url, redirectTarget, owner, count) {
    return new Promise(function(resolve, reject) {
      clientImpl.hmset('/foo',
        'location', redirectTarget,
        'owner', owner,
        'count', count,
        function(err) {
          err ? reject(err) : resolve()
        })
    })
  }

  readOwnerList = function(owner) {
    return new Promise(function(resolve, reject) {
      clientImpl.lrange(owner, 0, -1, function(err, data) {
        err ? reject(new Error(err)) : resolve(data)
      })
    })
  }

  stubClientImplMethod = function(methodName) {
    var stub = sinon.stub(clientImpl, methodName)
    stubs.push(stub)
    return stub
  }

  describe('userExists', function() {
    it('returns false if a user doesn\'t exist', function() {
      return redisClient.userExists('mbland').should.become(false)
    })

    it('returns true if a user exists', function() {
      return new Promise(
        function(resolve, reject) {
          clientImpl.lpush('mbland', '', function(err) {
            err ? reject(err) : resolve()
          })
        })
        .should.be.fulfilled
        .then(function() {
          return redisClient.userExists('mbland').should.become(true)
        })
    })

    it('raises an error when exists fails', function() {
      stubClientImplMethod('exists').callsFake(function(userId, cb) {
        cb(new Error('forced error for ' + userId))
      })
      return redisClient.userExists('mbland')
        .should.be.rejectedWith(Error, 'forced error for mbland')
    })
  })

  describe('findOrCreateUser', function() {
    it('creates a new user', function() {
      return redisClient.findOrCreateUser('mbland').should.become(true)
    })

    it('finds an existing user', function() {
      return redisClient.findOrCreateUser('mbland').should.become(true)
        .then(function() {
          return redisClient.findOrCreateUser('mbland').should.become(false)
        })
    })

    it('raises an error when lpush fails', function() {
      stubClientImplMethod('lpush').callsFake(function(userId, value, cb) {
        cb(new Error('forced error for ' + userId + ' "' + value + '"'))
      })
      return redisClient.findOrCreateUser('mbland')
        .should.be.rejectedWith(Error, 'forced error for mbland ""')
    })
  })

  describe('getRedirect', function() {
    it('returns null if a redirect doesn\'t exist', function() {
      return redisClient.getRedirect('/foo').should.become(null)
    })

    it('returns data if redirect exists, converts count to int', function() {
      return setData('/foo', REDIRECT_TARGET, 'mbland', 0).should.be.fulfilled
        .then(function() {
          return redisClient.getRedirect('/foo').should.become({
            location: REDIRECT_TARGET, owner: 'mbland', count: 0
          })
        })
    })

    it('raises an error when clientImpl fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(url, cb) {
        cb(new Error('forced error for ' + url))
      })
      return redisClient.getRedirect('/foo')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })
  })

  describe('recordAccess', function() {
    it('increments the count for a URL', function() {
      return setData('/foo', REDIRECT_TARGET, 'mbland', 0).should.be.fulfilled
        .then(function() {
          return redisClient.recordAccess('/foo').should.be.fulfilled
        })
        .then(function() {
          return redisClient.getRedirect('/foo').should.become({
            location: REDIRECT_TARGET, owner: 'mbland', count: 1
          })
        })
    })

    it('raises an error when clientImpl fails', function() {
      stubClientImplMethod('hincrby').callsFake(function(url, field, val, cb) {
        cb(new Error('forced error for ' + [url, field, val].join(' ')))
      })
      return redisClient.recordAccess('/foo')
        .should.be.rejectedWith(Error, 'forced error for /foo count 1')
    })
  })

  describe('addUrlToOwner', function() {
    it('adds URLs to an owner\'s list in LIFO order', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return readOwnerList('mbland')
            .should.become(['/baz', '/bar', '/foo', ''])
        })
    })

    it('fails to add a URL to a nonexistent owner', function() {
      return redisClient.addUrlToOwner('mbland', '/foo').should.become(false)
    })

    it('raises an error if client.lpushx fails', function() {
      stubClientImplMethod('lpushx').callsFake(function(owner, url, cb) {
        cb(new Error('forced error for ' + owner + ' ' + url))
      })
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/foo')
        })
        .should.be.rejectedWith(Error, 'forced error for mbland /foo')
    })
  })

  describe('removeUrlFromOwner', function() {
    it('removes a URL from an owner\'s list', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return redisClient.removeUrlFromOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return readOwnerList('mbland').should.become(['/baz', '/foo', ''])
        })
    })

    it('returns false if the owner didn\'t own the URL', function() {
      return redisClient.removeUrlFromOwner('mbland', '/foo')
        .should.become(false)
    })

    it('raises an error if client.lrem fails', function() {
      stubClientImplMethod('lrem').callsFake(function(owner, cnt, url, cb) {
        cb(new Error('forced error for ' + [owner, cnt, url].join(' ')))
      })
      return redisClient.removeUrlFromOwner('mbland', '/foo')
        .should.be.rejectedWith(Error, 'forced error for mbland 1 /foo')
    })
  })

  describe('createRedirect', function() {
    it('creates a new redirection', function() {
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.getRedirect('/foo')
        })
        .should.become({
          location: REDIRECT_TARGET, owner: 'mbland', count: 0
        })
    })

    it('fails to create a new redirection when one already exists', function() {
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        })
        .should.become(false)
    })

    it('raises an error when hsetnx fails', function() {
      stubClientImplMethod('hsetnx').callsFake(function(url, field, val, cb) {
        cb(new Error('forced error for ' + [url, field, val].join(' ')))
      })
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo owner mbland')
        .then(function() {
          return redisClient.getRedirect('/foo').should.become(null)
        })
    })

    it('raises an error when hmset fails', function() {
      stubClientImplMethod('hmset').callsFake(
        function(url, field1, val1, field2, val2, cb) {
          cb(new Error('forced error for ' +
            [url, field1, val1, field2, val2].join(' ')))
        })
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'failed to set location and count: ' +
          'Error: forced error for /foo location ' + REDIRECT_TARGET +
          ' count 0')
        .then(function() {
          return redisClient.getRedirect('/foo')
            .should.become({ owner: 'mbland' })
        })
    })
  })

  describe('getOwnedRedirects', function() {
    it('returns the empty list if no redirects exist', function() {
      return redisClient.getOwnedRedirects('mbland').should.become([])
    })

    it('returns the user\'s redirects in reverse order', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addUrlToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return redisClient.getOwnedRedirects('mbland')
        })
        .should.become(['/baz', '/bar', '/foo', ''])
    })

    it('raises an error when lrange fails', function() {
      stubClientImplMethod('lrange').callsFake(function(key, start, end, cb) {
        cb(new Error('forced error for ' + [key, start, end].join(' ')))
      })
      return redisClient.getOwnedRedirects('mbland')
        .should.be.rejectedWith(Error, 'forced error for mbland 0 -1')
    })
  })

  describe('updateProperty', function() {
    it('successfully updates a property', function() {
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'msb')
        .should.become(true).then(function() {
          return redisClient.updateProperty('/foo', 'owner', 'mbland')
        })
        .should.become(true).then(function() {
          return redisClient.getRedirect('/foo')
        })
        .should.become({ owner: 'mbland', location: REDIRECT_TARGET, count: 0 })
    })

    it('raises an error if getting redirect info fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(url, cb) {
        cb(new Error('forced error for ' + url))
      })
      return redisClient.updateProperty('/foo', 'owner', 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })

    it('fails if the redirection doesn\'t exist', function() {
      return redisClient.updateProperty('/foo', 'owner', 'mbland')
        .should.become(false)
    })

    it('raises an error if changing property fails', function() {
      stubClientImplMethod('hset').callsFake(function(url, field, val, cb) {
        cb(new Error('forced error for ' + [url, field, val].join(' ')))
      })
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'msb')
        .should.become(true).then(function() {
          return redisClient.updateProperty('/foo', 'owner', 'mbland')
        })
        .should.be.rejectedWith(Error, 'forced error for /foo owner')
    })
  })

  describe('deleteRedirection', function() {
    it('successfully deletes the redirection', function() {
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.deleteRedirection('/foo')
        })
        .should.become(true).then(function() {
          return redisClient.getRedirect('/foo')
        })
        .should.become(null)
    })

    it('returns false if the redirection doesn\'t exist', function() {
      return redisClient.deleteRedirection('/foo').should.become(false)
    })

    it('raises an error if client.del fails', function() {
      stubClientImplMethod('del').callsFake(function(key, cb) {
        cb(new Error('forced error for ' + key))
      })
      return redisClient.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.deleteRedirection('/foo')
        })
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })
  })
})

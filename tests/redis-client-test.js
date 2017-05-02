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
  var redisClient, clientImpl, serverPort, redisServer, setData,
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

  stubClientImplMethod = function(methodName) {
    var stub = sinon.stub(clientImpl, methodName)
    stubs.push(stub)
    return stub
  }

  describe('get', function() {
    it('returns null if a redirect doesn\'t exist', function() {
      return redisClient.get('/foo').should.become(null)
    })

    it('returns data if redirect exists, converts count to int', function() {
      return setData('/foo', REDIRECT_TARGET, 'mbland', 0).should.be.fulfilled
        .then(function() {
          return redisClient.get('/foo').should.become({
            location: REDIRECT_TARGET, owner: 'mbland', count: 0
          })
        })
    })

    it('raises an error when clientImpl fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(url, cb) {
        cb(new Error('forced error for ' + url))
      })
      return redisClient.get('/foo')
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
          return redisClient.get('/foo').should.become({
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

  describe('create', function() {
    it('creates a new redirection', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.fulfilled.then(function() {
          return redisClient.get('/foo')
        })
        .should.become({
          location: REDIRECT_TARGET, owner: 'mbland', count: 0
        })
        .then(function() {
          return new Promise(function(resolve, reject) {
            clientImpl.lrange('mbland', 0, -1, function(err, data) {
              err ? reject(err) : resolve(data)
            })
          })
        })
        .should.become(['/foo'])
    })

    it('fails to create a new redirection when one already exists', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.fulfilled.then(function() {
          return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        })
        .should.be.rejectedWith(Error, 'redirection already exists for /foo')
    })

    it('raises an error when hsetnx fails', function() {
      stubClientImplMethod('hsetnx').callsFake(function(url, field, val, cb) {
        cb(new Error('forced error for ' + [url, field, val].join(' ')))
      })
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo owner mbland')
        .then(function() {
          return redisClient.get('/foo').should.become(null)
        })
    })

    it('raises an error when hmset fails', function() {
      stubClientImplMethod('hmset').callsFake(
        function(url, field1, val1, field2, val2, cb) {
          cb(new Error('forced error for ' +
            [url, field1, val1, field2, val2].join(' ')))
        })
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'failed to set location and count: ' +
          'Error: forced error for /foo location ' + REDIRECT_TARGET +
          ' count 0')
        .then(function() {
          return redisClient.get('/foo').should.become({ owner: 'mbland' })
        })
    })

    it('raises an error when lpush fails', function() {
      stubClientImplMethod('lpush').callsFake(function(owner, url, cb) {
        cb(new Error('forced error for ' + owner + ' ' + url))
      })
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error,
          'failed to add to list for user mbland: ' +
          'Error: forced error for mbland /foo')
        .then(function() {
          return redisClient.get('/foo').should.become({
            owner: 'mbland', location: REDIRECT_TARGET, count: 0
          })
        })
    })
  })

  describe('getOwnedRedirects', function() {
    it('returns the empty list if no redirects exist', function() {
      return redisClient.getOwnedRedirects('mbland').should.become([])
    })

    it('returns the user\'s redirects in reverse order', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return redisClient.create('/bar', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return redisClient.create('/baz', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return redisClient.getOwnedRedirects('mbland')
        })
        .should.become(['/baz', '/bar', '/foo'])
    })

    it('raises an error when lrange fails', function() {
      stubClientImplMethod('lrange').callsFake(function(key, start, end, cb) {
        cb(new Error('forced error for ' + [key, start, end].join(' ')))
      })

      return redisClient.getOwnedRedirects('mbland')
        .should.be.rejectedWith(Error, 'failed to get redirects ' +
          'owned by mbland: Error: forced error for mbland 0 -1')
    })
  })

  describe('changeOwner', function() {
    it('sucessfully changes the owner of a redirection', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return redisClient.changeOwner('/foo', 'mbland')
        })
        .should.be.fulfilled.then(function() {
          return redisClient.get('/foo')
        })
        .should.become({ owner: 'mbland', location: REDIRECT_TARGET, count: 0 })
        .then(function() {
          return redisClient.getOwnedRedirects('msb')
        })
        .should.become([])
        .then(function() {
          return redisClient.getOwnedRedirects('mbland')
        })
        .should.become(['/foo'])
    })

    it('raises an error if the redirection doesn\'t exist', function() {
      return redisClient.changeOwner('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'no redirection for /foo exists')
    })

    it('raises an error if getting redirect info fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(url, cb) {
        cb(new Error('forced error for ' + url))
      })
      return redisClient.changeOwner('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'failed to determine existence of ' +
          '/foo before changing owner to mbland: ' +
          'Error: forced error for /foo')
    })

    it('raises an error if adding changing ownership fails', function() {
      stubClientImplMethod('hset').callsFake(function(url, field, val, cb) {
        cb(new Error('forced error for ' + [url, field, val].join(' ')))
      })
      return redisClient.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return redisClient.changeOwner('/foo', 'mbland')
        })
        .should.be.rejectedWith(Error, 'failed to change owner for /foo ' +
          'to mbland: Error: forced error for /foo owner')
    })

    it('raises an error if adding to the new owner\'s list fails', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          stubClientImplMethod('lpush').callsFake(function(owner, url, cb) {
            cb(new Error('forced error for ' + owner + ' ' + url))
          })
          return redisClient.changeOwner('/foo', 'mbland')
        })
        .should.be.rejectedWith(Error, 'changed ownership of /foo ' +
          'from msb to mbland, but failed to add it to new owner\'s list: ' +
          'Error: forced error for mbland /foo')
    })

    it('raises an error if removing from old owner\'s list fails', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          stubClientImplMethod('lrem').callsFake(function(owner, cnt, url, cb) {
            cb(new Error('forced error for ' + [owner, cnt, url].join(' ')))
          })
          return redisClient.changeOwner('/foo', 'mbland')
        })
        .should.be.rejectedWith(Error, 'changed ownership of /foo ' +
          'from msb to mbland, but failed to remove it from previous ' +
          'owner\'s list: Error: forced error for msb 1 /foo')
    })
  })

  // We only test one case because it uses the same underlying helper function
  // as changeOwner.
  describe('updateLocation', function() {
    it('successfully updates the location', function() {
      return redisClient.create('/foo', 'https://example.com/', 'mbland')
        .then(function() {
          return redisClient.updateLocation('/foo', REDIRECT_TARGET)
        })
        .should.be.fulfilled.then(function() {
          return redisClient.get('/foo')
        })
        .should.become({ owner: 'mbland', location: REDIRECT_TARGET, count: 0 })
    })
  })

  describe('deleteRedirection', function() {
    it('successfully deletes the redirection', function() {
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return redisClient.create('/bar', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return redisClient.create('/baz', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return redisClient.deleteRedirection('/bar')
        })
        .should.be.fulfilled.then(function() {
          return redisClient.get('/bar')
        })
        .should.become(null)
        .then(function() {
          return redisClient.getOwnedRedirects('mbland')
        })
        .should.become(['/baz', '/foo'])
    })

    it('raises an error if the redirection doesn\'t exist', function() {
      return redisClient.deleteRedirection('/foo')
        .should.be.rejectedWith(Error, 'failed to delete nonexistent ' +
          'redirection for /foo')
    })

    it('raises an error if client.del fails', function() {
      stubClientImplMethod('del').callsFake(function(key, cb) {
        cb(new Error('forced error for ' + key))
      })
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return redisClient.deleteRedirection('/foo')
        })
        .should.be.rejectedWith(Error, 'failed to delete redirection for ' +
          '/foo: Error: forced error for /foo')
    })

    it('raises an error if client.lrem fails', function() {
      stubClientImplMethod('lrem').callsFake(function(key, count, val, cb) {
        cb(new Error('forced error for ' + [key, count, val].join(' ')))
      })
      return redisClient.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return redisClient.deleteRedirection('/foo')
        })
        .should.be.rejectedWith(Error, 'failed to remove /foo from ' +
          'redirections owned by mbland: Error: forced error for mbland 1 /foo')
    })
  })
})

'use strict'

var RedisClient = require('../../lib/redis')
var helpers = require('../helpers')
var redis = require('redis')
var sinon = require('sinon')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var LINK_TARGET = 'https://mike-bland.com/'

chai.should()
chai.use(chaiAsPromised)

describe('RedisClient', function() {
  var redisClient, clientImpl, serverPort, redisServer, setData, readOwnerList,
      stubClientImplMethod, fakeTimestamp, getFakeTimestamp, stubs

  before(function() {
    var config = { REDIS_RANGE_SIZE: 2 }
    return helpers.pickUnusedPort()
      .then(helpers.launchRedis)
      .then(function(redisData) {
        serverPort = redisData.port
        redisServer = redisData.server
        clientImpl = redis.createClient({ port: serverPort })
        getFakeTimestamp = () => new Date(parseInt(fakeTimestamp)).getTime()
        redisClient = new RedisClient(clientImpl, config, getFakeTimestamp)
      })
  })

  beforeEach(function() {
    fakeTimestamp = '1234567890'
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
    clientImpl.quit()
    return helpers.killServer(redisServer)
  })

  setData = function(link, target, owner, clicks) {
    return new Promise(function(resolve, reject) {
      clientImpl.hmset('/foo',
        'target', target,
        'owner', owner,
        'clicks', clicks,
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

  describe('getTimestamp', function() {
    it('uses the fake version in the test suite', function() {
      redisClient.getTimestamp().should.equal(parseInt(fakeTimestamp))
    })

    it('uses the Date builtin in production', function() {
      var before = new Date().getTime(),
          prodTime = new RedisClient(clientImpl, {}).getTimestamp()

      prodTime.should.be.within(before, new Date().getTime())
    })
  })

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

  describe('getLink', function() {
    it('returns null if a link doesn\'t exist', function() {
      return redisClient.getLink('/foo').should.become(null)
    })

    it('returns data if link exists, converts clicks to int', function() {
      return setData('/foo', LINK_TARGET, 'mbland', 0).should.be.fulfilled
        .then(function() {
          return redisClient.getLink('/foo').should.become({
            target: LINK_TARGET, owner: 'mbland', clicks: 0
          })
        })
    })

    it('raises an error when clientImpl fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(link, cb) {
        cb(new Error('forced error for ' + link))
      })
      return redisClient.getLink('/foo')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })
  })

  describe('recordAccess', function() {
    it('increments the clicks for a link', function() {
      return setData('/foo', LINK_TARGET, 'mbland', 0).should.be.fulfilled
        .then(function() {
          return redisClient.recordAccess('/foo').should.be.fulfilled
        })
        .then(function() {
          return redisClient.getLink('/foo').should.become({
            target: LINK_TARGET, owner: 'mbland', clicks: 1
          })
        })
    })

    it('raises an error when clientImpl fails', function() {
      stubClientImplMethod('hincrby').callsFake(function(link, field, val, cb) {
        cb(new Error('forced error for ' + [link, field, val].join(' ')))
      })
      return redisClient.recordAccess('/foo')
        .should.be.rejectedWith(Error, 'forced error for /foo clicks 1')
    })
  })

  describe('addLinkToOwner', function() {
    it('adds links to an owner\'s list in LIFO order', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return readOwnerList('mbland')
            .should.become(['/baz', '/bar', '/foo', ''])
        })
    })

    it('fails to add a link to a nonexistent owner', function() {
      return redisClient.addLinkToOwner('mbland', '/foo').should.become(false)
    })

    it('raises an error if client.lpushx fails', function() {
      stubClientImplMethod('lpushx').callsFake(function(owner, link, cb) {
        cb(new Error('forced error for ' + owner + ' ' + link))
      })
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/foo')
        })
        .should.be.rejectedWith(Error, 'forced error for mbland /foo')
    })
  })

  describe('removeLinkFromOwner', function() {
    it('removes a link from an owner\'s list', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return redisClient.removeLinkFromOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return readOwnerList('mbland').should.become(['/baz', '/foo', ''])
        })
    })

    it('returns false if the owner didn\'t own the link', function() {
      return redisClient.removeLinkFromOwner('mbland', '/foo')
        .should.become(false)
    })

    it('raises an error if client.lrem fails', function() {
      stubClientImplMethod('lrem').callsFake(function(owner, cnt, link, cb) {
        cb(new Error('forced error for ' + [owner, cnt, link].join(' ')))
      })
      return redisClient.removeLinkFromOwner('mbland', '/foo')
        .should.be.rejectedWith(Error, 'forced error for mbland 1 /foo')
    })
  })

  describe('createLink', function() {
    it('creates a new link', function() {
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.getLink('/foo')
        })
        .should.become({
          target: LINK_TARGET,
          owner: 'mbland',
          created: fakeTimestamp,
          updated: fakeTimestamp,
          clicks: 0
        })
    })

    it('fails to create a new link when one already exists', function() {
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        })
        .should.become(false)
    })

    it('raises an error when hsetnx fails', function() {
      stubClientImplMethod('hsetnx').callsFake(function(link, field, val, cb) {
        cb(new Error('forced error for ' + [link, field, val].join(' ')))
      })
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo owner mbland')
        .then(function() {
          return redisClient.getLink('/foo').should.become(null)
        })
    })

    it('raises an error when hmset fails', function() {
      stubClientImplMethod('hmset').callsFake(
        function(link, f1, v1, f2, v2, f3, v3, f4, v4, cb) {
          cb(new Error('forced error for ' +
            [link, f1, v1, f2, v2, f3, v3, f4, v4].join(' ')))
        })
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith(Error,
          'failed to set target, clicks, and timestamps: ' +
          'Error: forced error for /foo target ' + LINK_TARGET +
          ' created ' + fakeTimestamp + ' updated ' + fakeTimestamp +
          ' clicks 0')
        .then(function() {
          return redisClient.getLink('/foo')
            .should.become({ owner: 'mbland' })
        })
    })
  })

  describe('indexLink', function() {
    it('should successfully index a link', () => {
      return redisClient.indexLink('/foobar', { target: LINK_TARGET })
        .should.be.fulfilled
        .then(() => redisClient.completeLink('foo'))
        .should.become(['foobar'])
        .then(() => redisClient.getLinksToTarget(LINK_TARGET))
        .should.become(['/foobar'])
    })

    it('raises an error when indexing a link fails', () => {
      stubClientImplMethod('zadd').callsFake((...args) => {
        var cb = args.pop()
        cb(new Error('forced error for ' + args.join(' ')))
      })

      return redisClient.indexLink('/foo', { target: LINK_TARGET })
        .should.be.rejectedWith(Error,
          'forced error for complete:links 0 f 0 fo 0 foo 0 foo*')
    })
  })

  describe('getOwnedLinks', function() {
    it('returns the empty list if no links exist', function() {
      return redisClient.getOwnedLinks('mbland').should.become([])
    })

    it('returns the user\'s links in reverse order', function() {
      return redisClient.findOrCreateUser('mbland')
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/foo')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/bar')
        })
        .should.become(true).then(function() {
          return redisClient.addLinkToOwner('mbland', '/baz')
        })
        .should.become(true).then(function() {
          return redisClient.getOwnedLinks('mbland')
        })
        .should.become(['/baz', '/bar', '/foo'])
    })

    it('raises an error when lrange fails', function() {
      stubClientImplMethod('lrange').callsFake(function(key, start, end, cb) {
        cb(new Error('forced error for ' + [key, start, end].join(' ')))
      })
      return redisClient.getOwnedLinks('mbland')
        .should.be.rejectedWith(Error, 'forced error for mbland 0 -1')
    })
  })

  describe('updateProperty', function() {
    it('successfully updates a property', function() {
      var updateTimestamp = (parseInt(fakeTimestamp) + 3600) + ''

      return redisClient.createLink('/foo', LINK_TARGET, 'msb')
        .should.become(true).then(function() {
          fakeTimestamp = updateTimestamp
          return redisClient.updateProperty('/foo', 'owner', 'mbland')
        })
        .should.become(true).then(function() {
          return redisClient.getLink('/foo')
        })
        .should.become({
          owner: 'mbland',
          target: LINK_TARGET,
          created: fakeTimestamp,
          updated: updateTimestamp,
          clicks: 0
        })
    })

    it('raises an error if getting link info fails', function() {
      stubClientImplMethod('hgetall').callsFake(function(link, cb) {
        cb(new Error('forced error for ' + link))
      })
      return redisClient.updateProperty('/foo', 'owner', 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })

    it('fails if the link doesn\'t exist', function() {
      return redisClient.updateProperty('/foo', 'owner', 'mbland')
        .should.become(false)
    })

    it('raises an error if changing property fails', function() {
      return redisClient.createLink('/foo', LINK_TARGET, 'msb')
        .should.become(true).then(function() {
          stubClientImplMethod('hmset').callsFake(
            (link, field, val, updatedLabel, updatedStamp, cb) => {
              cb(new Error('forced error for ' +
                [link, field, val, updatedLabel, updatedStamp].join(' ')))
            })
          return redisClient.updateProperty('/foo', 'owner', 'mbland')
        })
        .should.be.rejectedWith(Error,
          'forced error for /foo owner mbland updated ' + fakeTimestamp)
    })
  })

  describe('reindexLink', function() {
    it('should successfully reindex a link', () => {
      var prevInfo = { target: LINK_TARGET },
          newInfo =  { target: LINK_TARGET + 'the-rainbow-of-death' }

      return redisClient.indexLink('/foobar', prevInfo)
        .should.be.fulfilled
        .then(() => redisClient.reindexLink('/foobar', prevInfo, newInfo))
        .should.be.fulfilled
        .then(() => redisClient.getLinksToTarget(prevInfo.target))
        .should.become([])
        .then(() => redisClient.getLinksToTarget(newInfo.target))
        .should.become(['/foobar'])
    })

    it('resolves to an Error when reindexing a link fails', () => {
      stubClientImplMethod('srem').callsFake((...args) => {
        var cb = args.pop()
        cb(new Error('forced error for ' + args.join(' ')))
      })

      return redisClient.reindexLink('/foo', { target: LINK_TARGET }, {})
        .should.be.rejectedWith(Error,
          'forced error for target:' + LINK_TARGET + ' /foo')
    })
  })

  describe('deleteLink', function() {
    it('successfully deletes the link', function() {
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.deleteLink('/foo')
        })
        .should.become(true).then(function() {
          return redisClient.getLink('/foo')
        })
        .should.become(null)
    })

    it('returns false if the link doesn\'t exist', function() {
      return redisClient.deleteLink('/foo').should.become(false)
    })

    it('raises an error if client.del fails', function() {
      stubClientImplMethod('del').callsFake(function(key, cb) {
        cb(new Error('forced error for ' + key))
      })
      return redisClient.createLink('/foo', LINK_TARGET, 'mbland')
        .should.become(true).then(function() {
          return redisClient.deleteLink('/foo')
        })
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })
  })

  describe('deindexLink', function() {
    it('should successfully deindex a link', () => {
      return redisClient.indexLink('/foobar', { target: LINK_TARGET })
        .should.be.fulfilled
        .then(() => redisClient.deindexLink('/foobar', { target: LINK_TARGET }))
        .should.be.fulfilled
        .then(() => redisClient.completeLink('foo'))
        .should.become([])
        .then(() => redisClient.getLinksToTarget(LINK_TARGET))
        .should.become([])
    })

    it('resolves to an Error when deindexing a link fails', () => {
      stubClientImplMethod('zrem').callsFake((...args) => {
        var cb = args.pop()
        cb(new Error('forced error for ' + args.join(' ')))
      })

      return redisClient.deindexLink('/foo', { target: LINK_TARGET })
        .should.be.rejectedWith(Error, 'forced error for complete:links foo*')
    })
  })

  describe('searchShortLinks', function() {
    it('should return nothing if there are no links', function() {
      return redisClient.searchShortLinks().should.become([])
    })

    it('should return all links', function() {
      return Promise.all([
        redisClient.createLink('/foo', LINK_TARGET, 'mbland'),
        redisClient.createLink('/bar', LINK_TARGET, 'mbland'),
        redisClient.createLink('/baz', LINK_TARGET, 'mbland')
      ]).should.be.fulfilled.then(function() {
        return redisClient.searchShortLinks()
      }).should.be.fulfilled.then(function(links) {
        links.map(l => l.link).should.eql(['/bar', '/baz', '/foo'])
      })
    })

    it('returns all matching links', function() {
      return Promise.all([
        redisClient.createLink('/foo1', LINK_TARGET, 'akash'),
        redisClient.createLink('/foo2', LINK_TARGET, 'akash'),
        redisClient.createLink('/bar1', LINK_TARGET, 'akash'),
        redisClient.createLink('/alphafoo1', LINK_TARGET, 'akash')
      ]).should.be.fulfilled.then(function() {
        return redisClient.searchShortLinks('foo')
      }).should.be.fulfilled.then(function(links){
        links.map(l => l.link).sort()
          .should.eql(['/alphafoo1', '/foo1', '/foo2'])
      })
    })
  })

  describe('searchTargetLinks', function() {
    it('should return nothing if there are no links', function() {
      return redisClient.searchTargetLinks().should.become({})
    })

    it('should return all links', function() {
      return Promise.all([
        redisClient.createLink('/foo', LINK_TARGET, 'akash'),
        redisClient.createLink('/bar', LINK_TARGET, 'akash'),
        redisClient.createLink('/baz', LINK_TARGET, 'akash'),
        redisClient.createLink('/test', 'https://akash.com', 'akash')
      ]).should.be.fulfilled.then(function() {
        return redisClient.searchTargetLinks()
      }).should.be.fulfilled.then(function(link) {
        link.should.eql({
          'https://mike-bland.com/': ['/bar', '/baz', '/foo'],
          'https://akash.com': ['/test']
        })
      })
    })

    it('should return all matching links and their shortlinks', function() {
      return Promise.all([
        redisClient.createLink('/foo', LINK_TARGET, 'akash'),
        redisClient.createLink('/bar', LINK_TARGET, 'akash'),
        redisClient.createLink('/baz', LINK_TARGET, 'akash'),
        redisClient.createLink('/test', 'https://akash.com', 'akash')
      ]).should.be.fulfilled.then(function() {
        return redisClient.searchTargetLinks('akash')
      }).should.be.fulfilled.then(function(link) {
        link.should.eql({
          'https://akash.com': ['/test']
        })
      })
    })
  })

  describe('completeLink', function() {
    beforeEach(function() {
      return Promise.all([
        redisClient.indexLink('/foobar', { target: LINK_TARGET }),
        redisClient.indexLink('/bar', { target: LINK_TARGET }),
        redisClient.indexLink('/barbaz', { target: LINK_TARGET }),
        redisClient.indexLink('/barquux', { target: LINK_TARGET }),
        redisClient.indexLink('/baz', { target: LINK_TARGET })
      ])
    })

    it('should complete the appropriate links', function() {
      return redisClient.completeLink('bar')
        .should.be.fulfilled.then(links => {
          links.should.eql(['bar', 'barbaz', 'barquux'])
        })
    })

    it('should complete nothing if prefix.length < 3', function() {
      return redisClient.completeLink('ba')
        .should.be.fulfilled.then(links => links.should.be.empty)
    })

    it('should return nothing if no links start with the prefix', function() {
      return redisClient.completeLink('plugh')
        .should.be.fulfilled.then(links => links.should.be.empty)
    })

    it('should not return a link after it\'s been deleted', function() {
      return redisClient.deindexLink('/barbaz', { target: LINK_TARGET })
        .should.be.fulfilled.then(() => redisClient.completeLink('bar'))
        .should.be.fulfilled.then(links => links.should.eql(['bar', 'barquux']))
    })
  })

  describe('getLinksToTarget', function() {
    beforeEach(function() {
      return Promise.all([
        redisClient.indexLink('/foo', { target: LINK_TARGET }),
        redisClient.indexLink('/bar', { target: LINK_TARGET }),
        redisClient.indexLink('/baz', { target: LINK_TARGET })
      ])
    })

    it('should return all the links to LINK_TARGET', function() {
      return redisClient.getLinksToTarget(LINK_TARGET)
        .should.be.fulfilled.then(links => {
          links.should.eql(['/bar', '/baz', '/foo'])
        })
    })

    it('should return nothing if the target doesn\'t exist', function() {
      return redisClient.getLinksToTarget('https://nonexistent.com/')
        .should.be.fulfilled.then(links => links.should.be.empty)
    })

    it('should not return a link after it\'s been deleted', function() {
      return redisClient.deindexLink('/baz', { target: LINK_TARGET })
        .should.be.fulfilled.then(() => {
          return redisClient.getLinksToTarget(LINK_TARGET)
        })
        .should.be.fulfilled.then(links => links.should.eql(['/bar', '/foo']))
    })
  })
})

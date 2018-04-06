'use strict'

var LinkDb = require('../../lib/link-db')
var RedisClient = require('../../lib/redis')

var sinon = require('sinon')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var LINK_TARGET = 'https://mike-bland.com/'

chai.should()
chai.use(chaiAsPromised)

describe('LinkDb', function() {
  var linkDb, logger, client, stubClientMethod, stubs

  beforeEach(function() {
    client = new RedisClient
    logger = { error: function() { } }
    linkDb = new LinkDb(client, logger)
    stubs = []
  })

  afterEach(function() {
    stubs.forEach(function(stub) {
      stub.restore()
    })
  })

  stubClientMethod = function(methodName) {
    var stub = sinon.stub(client, methodName)
    stubs.push(stub)
    return stub
  }

  describe('userExists', function() {
    it('resolves if a user exists', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      return linkDb.userExists('mbland').should.be.fulfilled
    })

    it('rejects if a user doesn\'t exist', function() {
      stubClientMethod('userExists').returns(Promise.resolve(false))
      return linkDb.userExists('mbland')
        .should.be.rejectedWith('user mbland doesn\'t exist')
    })

    it('raises an error if the client fails', function() {
      stubClientMethod('userExists').callsFake(function(user) {
        return Promise.reject(new Error('forced error for ' + user))
      })
      return linkDb.userExists('mbland')
        .should.be.rejectedWith(Error, 'forced error for mbland')
    })
  })

  describe('findUser', function() {
    it('finds an existing user', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      return linkDb.findUser('mbland').should.become({ id: 'mbland' })
    })

    it('does not find an existing user', function() {
      stubClientMethod('userExists').returns(Promise.resolve(false))
      return linkDb.findUser('mbland')
        .should.be.rejectedWith('user mbland doesn\'t exist')
    })
  })

  describe('findOrCreateUser', function() {
    it('finds or creates a user', function() {
      stubClientMethod('findOrCreateUser').withArgs('mbland')
        .returns(Promise.resolve(true))
      return linkDb.findOrCreateUser('mbland')
        .should.become({ id: 'mbland' })
    })
  })

  describe('getLink', function() {
    it('returns null for an unknown link', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve(null))
      return linkDb.getLink('/foo').should.become(null)
    })

    it('returns the data for a known link', function() {
      var linkData = { target: LINK_TARGET, owner: 'mbland', clicks: 27 }

      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve(linkData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .returns(Promise.resolve())
      return linkDb.getLink('/foo').should.become(linkData)
        .then(function() {
          client.recordAccess.calledOnce.should.be.false
        })
    })

    it('records access of a known link', function() {
      var linkData = { target: LINK_TARGET, owner: 'mbland', clicks: 27 }

      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve(linkData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .returns(Promise.resolve())
      return linkDb.getLink('/foo', { recordAccess: true })
        .should.become(linkData)
        .then(function() {
          client.recordAccess.calledOnce.should.be.true
        })
    })

    it('logs an error if the link is known but recordAccess fails', function() {
      var linkData = { target: LINK_TARGET, owner: 'mbland', clicks: 27 },
          errorSpy = sinon.spy(logger, 'error')

      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve(linkData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .callsFake(function(link) {
          return Promise.reject('forced error for ' + link)
        })

      return linkDb.getLink('/foo', { recordAccess: true })
        .should.become(linkData)
        .then(function() {
          errorSpy.calledWith('failed to record access for /foo: ' +
            'forced error for /foo').should.be.true
        })
    })
  })

  describe('createLink', function() {
    it('successfully creates a new link', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink')
        .withArgs('/foo', LINK_TARGET, 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner')
        .returns(Promise.resolve())
      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.fulfilled
    })

    it('fails to create a link if the user doesn\'t exist', function() {
      stubClientMethod('userExists').returns(Promise.resolve(false))
      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith('user mbland doesn\'t exist')
    })

    it('fails to create a new link when one already exists', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink').returns(Promise.resolve(false))
      stubClientMethod('getLink')
        .returns(Promise.resolve({ link: '/foo', owner: 'mbland' }))

      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith('/foo already exists')
    })

    it('error shows owner of existing link if another user', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink').returns(Promise.resolve(false))
      stubClientMethod('getLink')
        .returns(Promise.resolve({ link: '/foo', owner: 'msb' }))

      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith('/foo is owned by msb')
    })

    it('fails to create a new link due to a server error', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink')
        .withArgs('/foo', LINK_TARGET, 'mbland')
        .callsFake(function(link, target, user) {
          return Promise.reject(new Error('forced error for ' +
            [link, target, user].join(' ')))
        })

      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith(Error,
          'error creating /foo to be owned by mbland: ' +
           'forced error for /foo ' + LINK_TARGET + ' mbland')
    })

    it('fails when the owner disappears after creating the link', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink')
        .withArgs('/foo', LINK_TARGET, 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner').returns(Promise.resolve(false))
      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith(Error, '/foo created, ' +
          'but failed to add to list for user mbland: ' +
          'user was deleted before link could be assigned')
    })

    it('fails to add the link to the owner\'s list', function() {
      stubClientMethod('userExists').returns(Promise.resolve(true))
      stubClientMethod('createLink')
        .withArgs('/foo', LINK_TARGET, 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner')
        .callsFake(function(user, link) {
          return Promise.reject(
            new Error('forced error for ' + user + ' ' + link))
        })

      return linkDb.createLink('/foo', LINK_TARGET, 'mbland')
        .should.be.rejectedWith(Error, '/foo created, ' +
          'but failed to add to list for user mbland: ' +
          'forced error for mbland /foo')
    })
  })

  describe('getOwnedLinks', function() {
    it('successfully fetches zero links', function() {
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('getOwnedLinks').withArgs('mbland')
        .returns(Promise.resolve([]))
      return linkDb.getOwnedLinks('mbland').should.become([])
    })

    it('successfully fetches owned links', function() {
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('getOwnedLinks').withArgs('mbland')
        .returns(Promise.resolve(['/baz', '/bar', '/foo']))
      stubClientMethod('getLink').callsFake(function(link) {
        return Promise.resolve({
          link: link, target: LINK_TARGET, owner: 'mbland', clicks: 0 })
      })

      return linkDb.getOwnedLinks('mbland')
        .should.become([
          { link: '/baz', target: LINK_TARGET, owner: 'mbland', clicks: 0 },
          { link: '/bar', target: LINK_TARGET, owner: 'mbland', clicks: 0 },
          { link: '/foo', target: LINK_TARGET, owner: 'mbland', clicks: 0 }
        ])
    })

    it('fails to fetch links for a nonexistent user', function() {
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(false))
      return linkDb.getOwnedLinks('mbland')
        .should.be.rejectedWith('user mbland doesn\'t exist')
    })

    it('fails to fetch any links for valid user', function() {
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('getOwnedLinks').withArgs('mbland')
        .callsFake(function(owner) {
          return Promise.reject(new Error('forced failure for ' + owner))
        })
      return linkDb.getOwnedLinks('mbland')
        .should.be.rejectedWith(Error, 'forced failure for mbland')
    })

    it('fails to fetch full info for one of the links', function() {
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('getOwnedLinks').withArgs('mbland')
        .returns(Promise.resolve(['/baz', '/bar', '/foo']))
      stubClientMethod('getLink').callsFake(function(link) {
        if (link === '/bar') {
          return Promise.reject(new Error('forced failure for ' + link))
        }
        return Promise.resolve({
          link: link, target: LINK_TARGET, owner: 'mbland', clicks: 0 })
      })
      return linkDb.getOwnedLinks('mbland')
        .should.be.rejectedWith(Error, 'forced failure for /bar')
    })
  })

  describe('getLinkIfOwner', function() {
    it('returns the link info object if ownership validation succeeds', () => {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      return linkDb.getLinkIfOwner('/foo', 'mbland')
        .should.become({ owner: 'mbland' })
    })

    it('fails if the link doesn\'t exist', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve(null))
      return linkDb.getLinkIfOwner('/foo', 'mbland')
        .should.be.rejectedWith('/foo does not exist')
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return linkDb.getLinkIfOwner('/foo', 'mbland')
        .should.be.rejectedWith('/foo is owned by msb')
    })
  })

  describe('getShortLinksFromTargetLink', function() {
    it('returns no short links when there are no links', () => {
      stubClientMethod('getShortLinksFromTargetLink').withArgs('')
        .returns(Promise.resolve({}))
      return linkDb.getShortLinksFromTargetLink('').should.become({})
    })

    it('returns all links', () => {
      stubClientMethod('getShortLinksFromTargetLink')
      .withArgs('')
        .returns(Promise.resolve({
          'https://mike-bland.com/': ['/baz', '/bar', '/foo'],
          'https://akash.com': ['/test']
        }))
      return linkDb.getShortLinksFromTargetLink('').should.become({
        'https://mike-bland.com/': ['/baz', '/bar', '/foo'],
        'https://akash.com': ['/test']
      })
    })

    it('returns all matching links and their shortlinks', () => {
      stubClientMethod('getShortLinksFromTargetLink').withArgs('akash')
        .returns(Promise.resolve({ 'https://akash.com': ['/test'] }))
      return linkDb.getShortLinksFromTargetLink('akash')
        .should.become({ 'https://akash.com': ['/test'] })
    })
  })

  describe('updateProperty', function() {
    it('successfully changes the target', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'target', '/baz')
        .returns(Promise.resolve(true))

      return linkDb.updateProperty('/foo', 'mbland', 'target', '/baz')
        .should.be.fulfilled
    })

    it('raises an error if client.updateProperty fails', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'target', '/baz')
        .callsFake(function(link, name, value) {
          return Promise.reject(new Error('forced error for ' +
            [link, name, value].join(' ')))
        })
      return linkDb.updateProperty('/foo', 'mbland', 'target', '/baz')
        .should.be.rejectedWith(Error, 'failed to update target of /foo ' +
          'to /baz: forced error for /foo target /baz')
    })

    it('returns failure if a property doesn\'t exist', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'target', '/baz')
        .returns(Promise.resolve(false))
      return linkDb.updateProperty('/foo', 'mbland', 'target', '/baz')
        .should.be.rejectedWith(Error,
          'property target of /foo doesn\'t exist')
    })
  })

  describe('changeOwner', function() {
    it('successfully changes the owner', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeLinkFromOwner').withArgs('msb', '/foo')
        .returns(Promise.resolve(true))

      return linkDb.changeOwner('/foo', 'msb', 'mbland').should.be.fulfilled
    })

    it('fails unless invoked by the original owner', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      return linkDb.changeOwner('/foo', 'mbland', 'mbland')
        .should.be.rejectedWith('/foo is owned by msb')
    })

    it('fails if the new owner doesn\'t exist', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(false))
      return linkDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith('user mbland doesn\'t exist')
    })

    it('fails if adding to the new owner\'s list raises error', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner').withArgs('mbland', '/foo')
        .callsFake(function(owner, link) {
          return Promise.reject(
            new Error('forced error for ' + owner + ' ' + link))
        })
      stubClientMethod('removeLinkFromOwner').withArgs('msb', '/foo')
        .returns(Promise.resolve(true))

      return linkDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'changed ownership of /foo ' +
          'from msb to mbland, but failed to add it to new owner\'s list: ' +
          'forced error for mbland /foo')
    })

    it('fails if the link\'s missing from the old owner\'s list', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeLinkFromOwner').withArgs('msb', '/foo')
        .returns(Promise.resolve(false))

      return linkDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'assigned ownership of /foo to ' +
          'mbland, but msb didn\'t own it')
    })

    it('fails if removing from the old owner\'s list raises error', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('userExists').withArgs('mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve(true))
      stubClientMethod('addLinkToOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeLinkFromOwner').withArgs('msb', '/foo')
        .callsFake(function(owner, link) {
          return Promise.reject(
            new Error('forced error for ' + owner + ' ' + link))
        })

      return linkDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'changed ownership of /foo from msb ' +
          'to mbland, but failed to remove it from previous owner\'s list: ' +
          'forced error for msb /foo')
    })
  })

  describe('updateTarget', function() {
    it('successfully changes the target', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'target', '/baz')
        .returns(Promise.resolve(true))

      return linkDb.updateTarget('/foo', 'mbland', '/baz')
        .should.be.fulfilled
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return linkDb.updateTarget('/foo', 'mbland', '/baz')
        .should.be.rejectedWith('/foo is owned by msb')
    })
  })

  describe('deleteLink', function() {
    it('successfully deletes the link', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteLink').withArgs('/foo')
        .returns(Promise.resolve(true))
      stubClientMethod('removeLinkFromOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve(true))

      return linkDb.deleteLink('/foo', 'mbland').should.be.fulfilled
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return linkDb.deleteLink('/foo', 'mbland')
        .should.be.rejectedWith('/foo is owned by msb')
    })

    it('fails if link doesn\'t exist after ownership check', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteLink').withArgs('/foo')
        .returns(Promise.resolve(false))

      return linkDb.deleteLink('/foo', 'mbland')
        .should.be.rejectedWith('/foo already deleted')
    })

    it('fails if deleting link data throws an error', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteLink').withArgs('/foo')
        .callsFake(function(link) {
          return Promise.reject(new Error('forced error for ' + link))
        })

      return linkDb.deleteLink('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })

    it('fails if removing from the owner\'s list fails', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteLink').withArgs('/foo')
        .returns(Promise.resolve(true))
      stubClientMethod('removeLinkFromOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve(false))

      return linkDb.deleteLink('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'deleted /foo, ' +
          'but mbland didn\'t own it')
    })

    it('fails if removing from the owner\'s list raises an error', function() {
      stubClientMethod('getLink').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteLink').withArgs('/foo')
        .returns(Promise.resolve(true))
      stubClientMethod('removeLinkFromOwner').withArgs('mbland', '/foo')
        .callsFake(function(owner, link) {
          return Promise.reject(new Error('forced error for ' +
            owner + ' ' + link))
        })

      return linkDb.deleteLink('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'deleted /foo, ' +
          'but failed to remove link from the owner\'s list for mbland: ' +
          'forced error for mbland /foo')
    })
  })
})

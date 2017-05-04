'use strict'

var RedirectDb = require('../lib/redirect-db')
var RedisClient = require('../lib/redis-client')

var sinon = require('sinon')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')

var REDIRECT_TARGET = 'https://mike-bland.com/'

chai.should()
chai.use(chaiAsPromised)

describe('RedirectDb', function() {
  var redirectDb, logger, client, stubClientMethod, stubs

  beforeEach(function() {
    client = new RedisClient
    logger = { error: function() { } }
    redirectDb = new RedirectDb(client, logger)
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

  describe('getRedirect', function() {
    it('returns null for an unknown redirect', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve(null))
      return redirectDb.getRedirect('/foo').should.become(null)
    })

    it('returns the data for a known URL', function() {
      var urlData = { location: REDIRECT_TARGET, owner: 'mbland', count: 27 }

      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve(urlData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .returns(Promise.resolve())
      return redirectDb.getRedirect('/foo').should.become(urlData)
        .then(function() {
          client.recordAccess.calledOnce.should.be.false
        })
    })

    it('records access of a known URL', function() {
      var urlData = { location: REDIRECT_TARGET, owner: 'mbland', count: 27 }

      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve(urlData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .returns(Promise.resolve())
      return redirectDb.getRedirect('/foo', { recordAccess: true })
        .should.become(urlData)
        .then(function() {
          client.recordAccess.calledOnce.should.be.true
        })
    })

    it('logs an error if the URL is known but recordAccess fails', function() {
      var urlData = { location: REDIRECT_TARGET, owner: 'mbland', count: 27 },
          errorSpy = sinon.spy(logger, 'error')

      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve(urlData))
      stubClientMethod('recordAccess').withArgs('/foo')
        .callsFake(function(url) {
          return Promise.reject('forced error for ' + url)
        })

      return redirectDb.getRedirect('/foo').should.become(urlData)
        .then(function() {
          errorSpy.calledWith('failed to record access for /foo: ' +
            'forced error for /foo')
        })
    })
  })

  describe('createRedirect', function() {
    it('successfully creates a new redirection', function() {
      stubClientMethod('createRedirect')
        .withArgs('/foo', REDIRECT_TARGET, 'mbland')
        .returns(Promise.resolve())
      stubClientMethod('addUrlToOwner')
        .returns(Promise.resolve())
      return redirectDb.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.fulfilled
    })

    it('fails to create a new redirection', function() {
      stubClientMethod('createRedirect')
        .withArgs('/foo', REDIRECT_TARGET, 'mbland')
        .callsFake(function(url, location, user) {
          return Promise.reject('forced error for ' +
            [url, location, user].join(' '))
        })

      return redirectDb.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error,
          'error creating redirection for /foo to be owned by mbland: ' +
           'forced error for /foo ' + REDIRECT_TARGET + ' mbland')
    })

    it('fails to add the URL to the owner\'s list', function() {
      stubClientMethod('createRedirect')
        .withArgs('/foo', REDIRECT_TARGET, 'mbland')
        .returns(Promise.resolve())
      stubClientMethod('addUrlToOwner')
        .callsFake(function(user, url) {
          return Promise.reject(
            new Error('forced error for ' + user + ' ' + url))
        })

      return redirectDb.createRedirect('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, 'redirection created for /foo, ' +
          'but failed to add to list for user mbland: ' +
          'Error: forced error for mbland /foo')
    })
  })

  describe('getOwnedRedirects', function() {
    it('successfully fetches zero redirects', function() {
      stubClientMethod('getOwnedRedirects').withArgs('mbland')
        .returns(Promise.resolve([]))
      return redirectDb.getOwnedRedirects('mbland').should.become([])
    })

    it('successfully fetches owned redirects', function() {
      stubClientMethod('getOwnedRedirects').withArgs('mbland')
        .returns(Promise.resolve(['/baz', '/bar', '/foo']))
      stubClientMethod('getRedirect').callsFake(function(url) {
        return Promise.resolve({
          url: url, location: REDIRECT_TARGET, owner: 'mbland', count: 0 })
      })

      return redirectDb.getOwnedRedirects('mbland')
        .should.become([
          { url: '/baz', location: REDIRECT_TARGET, owner: 'mbland', count: 0 },
          { url: '/bar', location: REDIRECT_TARGET, owner: 'mbland', count: 0 },
          { url: '/foo', location: REDIRECT_TARGET, owner: 'mbland', count: 0 }
        ])
    })

    it('fails to fetch any redirects', function() {
      stubClientMethod('getOwnedRedirects').withArgs('mbland')
        .callsFake(function(owner) {
          return Promise.reject(new Error('forced failure for ' + owner))
        })
      return redirectDb.getOwnedRedirects('mbland')
        .should.be.rejectedWith(Error, 'forced failure for mbland')
    })

    it('fails to fetch full info for one of the redirects', function() {
      stubClientMethod('getOwnedRedirects').withArgs('mbland')
        .returns(Promise.resolve(['/baz', '/bar', '/foo']))
      stubClientMethod('getRedirect').callsFake(function(url) {
        if (url === '/bar') {
          return Promise.reject(new Error('forced failure for ' + url))
        }
        return Promise.resolve({
          url: url, location: REDIRECT_TARGET, owner: 'mbland', count: 0 })
      })
      return redirectDb.getOwnedRedirects('mbland')
        .should.be.rejectedWith(Error, 'forced failure for /bar')
    })
  })

  describe('checkOwnership', function() {
    it('successfully validates ownership', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      return redirectDb.checkOwnership('/foo', 'mbland').should.be.fulfilled
    })

    it('fails if the redirection doesn\'t exist', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve(null))
      return redirectDb.checkOwnership('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'no redirection exists for /foo')
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return redirectDb.checkOwnership('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
    })
  })

  describe('updateProperty', function() {
    it('successfully changes the location', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'location', '/baz')
        .returns(Promise.resolve('/bar'))

      return redirectDb.updateProperty('/foo', 'mbland', 'location', '/baz')
        .should.become('/bar')
    })

    it('raises an error if client.updateProperty fails', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'location', '/baz')
        .callsFake(function(url, name, value) {
          return Promise.reject(new Error('forced error for ' +
            [url, name, value].join(' ')))
        })
      return redirectDb.updateProperty('/foo', 'mbland', 'location', '/baz')
        .should.be.rejectedWith(Error, 'failed to update location of /foo ' +
          'to /baz: Error: forced error for /foo location /baz')
    })
  })

  describe('changeOwner', function() {
    it('successfully changes the owner', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve('msb'))
      stubClientMethod('addUrlToOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeUrlFromOwner').withArgs('msb', '/foo')
        .returns(Promise.resolve())

      return redirectDb.changeOwner('/foo', 'msb', 'mbland').should.be.fulfilled
    })

    it('fails unless invoked by the original owner', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return redirectDb.changeOwner('/foo', 'mbland', 'mbland')
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
    })

    it('fails if adding to the new owner\'s URL list fails', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve('msb'))
      stubClientMethod('addUrlToOwner').withArgs('mbland', '/foo')
        .callsFake(function(owner, url) {
          return Promise.reject(
            new Error('forced error for ' + owner + ' ' + url))
        })
      stubClientMethod('removeUrlFromOwner').withArgs('msb', '/foo')
        .returns(Promise.resolve())

      return redirectDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'changed ownership of /foo from msb ' +
          'to mbland, but failed to add it to new owner\'s list: ' +
          'Error: forced error for mbland /foo')
    })

    it('fails if removing from the old owner\'s URL list fails', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'owner', 'mbland')
        .returns(Promise.resolve('msb'))
      stubClientMethod('addUrlToOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeUrlFromOwner').withArgs('msb', '/foo')
        .callsFake(function(owner, url) {
          return Promise.reject(
            new Error('forced error for ' + owner + ' ' + url))
        })

      return redirectDb.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'changed ownership of /foo from msb ' +
          'to mbland, but failed to remove it from previous owner\'s list: ' +
          'Error: forced error for msb /foo')
    })
  })

  describe('updateLocation', function() {
    it('successfully changes the location', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('updateProperty').withArgs('/foo', 'location', '/baz')
        .returns(Promise.resolve('/bar'))

      return redirectDb.updateLocation('/foo', 'mbland', '/baz')
        .should.become('/bar')
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return redirectDb.updateLocation('/foo', 'mbland', '/baz')
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
    })
  })

  describe('deleteRedirection', function() {
    it('successfully deletes the redirection', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteRedirection').withArgs('/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeUrlFromOwner').withArgs('mbland', '/foo')
        .returns(Promise.resolve())

      return redirectDb.deleteRedirection('/foo', 'mbland').should.be.fulfilled
    })

    it('fails unless invoked by the owner', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'msb' }))
      return redirectDb.deleteRedirection('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
    })

    it('fails if deleting redirection data throws an error', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteRedirection').withArgs('/foo')
        .callsFake(function(url) {
          return Promise.reject(new Error('forced error for ' + url))
        })

      return redirectDb.deleteRedirection('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'forced error for /foo')
    })

    it('fails if removing from the owner\'s URL list fails', function() {
      stubClientMethod('getRedirect').withArgs('/foo')
        .returns(Promise.resolve({ owner: 'mbland' }))
      stubClientMethod('deleteRedirection').withArgs('/foo')
        .returns(Promise.resolve())
      stubClientMethod('removeUrlFromOwner').withArgs('mbland', '/foo')
        .callsFake(function(owner, url) {
          return Promise.reject(new Error('forced error for ' +
            owner + ' ' + url))
        })

      return redirectDb.deleteRedirection('/foo', 'mbland')
        .should.be.rejectedWith(Error, 'deleted redirection from /foo, ' +
          'but failed to remove URL from the owner\'s list for mbland: ' +
          'Error: forced error for mbland /foo')
    })
  })
})

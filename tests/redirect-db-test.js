'use strict'

var RedirectDb = require('../lib/redirect-db')
var FakeClient = require('./helpers/fake-client')

var sinon = require('sinon')
var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var expect = chai.expect

var REDIRECT_TARGET = 'https://mike-bland.com/'

chai.should()
chai.use(chaiAsPromised)

describe('RedirectDb', function() {
  var fetcher, client, logger, errorSpy

  beforeEach(function() {
    client = new FakeClient
    logger = { error: function() { } }
    errorSpy = sinon.spy(logger, 'error')
    fetcher = new RedirectDb(client, logger)
  })

  describe('fetchRedirect', function() {
    it('returns the root url for an unknown redirect', function() {
      return fetcher.fetchRedirect('/foo').should.become('/')
    })

    it('returns the redirect target for a known URL', function() {
      client.create('/foo', REDIRECT_TARGET, 'mbland')

      return fetcher.fetchRedirect('/foo').should.become(REDIRECT_TARGET)
        .then(function() {
          client.db['/foo'].count.should.equal(1)
        })
    })

    it('logs an error if the URL is known but recordAccess fails', function() {
      var recordAccess = sinon.stub(client, 'recordAccess')

      client.create('/foo', REDIRECT_TARGET, 'mbland')
      recordAccess.withArgs('/foo').callsFake(function() {
        return Promise.reject('forced error')
      })

      return fetcher.fetchRedirect('/foo').should.become(REDIRECT_TARGET)
        .then(function() {
          errorSpy.calledWith('failed to record access for /foo: forced error')
          client.db['/foo'].count.should.equal(0)
        })
    })
  })

  describe('create', function() {
    it('successfully creates a new redirection', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.fulfilled.then(function() {
          client.db['/foo'].should.eql({
            location: REDIRECT_TARGET, owner: 'mbland', count: 0
          })
        })
    })

    it('fails to create a new redirection', function() {
      var create = sinon.stub(client, 'create'),
          expectedMsg = 'error setting redirection for /foo to be owned by ' +
            'mbland: forced error'

      create.withArgs('/foo').callsFake(function() {
        return Promise.reject('forced error')
      })

      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .should.be.rejectedWith(Error, expectedMsg).then(function() {
          expect(client.db['/foo']).to.be.undefined
        })
    })
  })

  describe('getOwnedRedirects', function() {
    it('successfully fetches zero redirects', function() {
      return fetcher.getOwnedRedirects('mbland').should.become([])
    })

    it('successfully fetches owned redirects', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          fetcher.create('/bar', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          fetcher.create('/baz', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return fetcher.getOwnedRedirects('mbland')
        })
        .should.become([
          { url: '/baz', location: REDIRECT_TARGET, owner: 'mbland', count: 0 },
          { url: '/bar', location: REDIRECT_TARGET, owner: 'mbland', count: 0 },
          { url: '/foo', location: REDIRECT_TARGET, owner: 'mbland', count: 0 }
        ])
    })

    it('fails to fetch any redirects', function() {
      var getOwnedRedirects = sinon.stub(client, 'getOwnedRedirects')
      getOwnedRedirects.withArgs('mbland').callsFake(function(owner) {
        return Promise.reject(new Error('forced failure for ' + owner))
      })

      return fetcher.getOwnedRedirects('mbland')
        .should.be.rejectedWith(Error, 'forced failure for mbland')
    })

    it('fails to fetch full info for one of the redirects', function() {
      var get = sinon.stub(client, 'get')

      get.withArgs('/bar').callsFake(function(url) {
        return Promise.reject(new Error('forced failure for ' + url))
      })
      get.callThrough()

      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          fetcher.create('/bar', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          fetcher.create('/baz', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return fetcher.getOwnedRedirects('mbland')
        })
        .should.be.rejectedWith(Error, 'forced failure for /bar')
    })
  })

  describe('changeOwner', function() {
    it('successfully changes the owner', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return fetcher.changeOwner('/foo', 'msb', 'mbland')
        })
        .should.be.fulfilled.then(function() {
          client.db['/foo'].owner.should.equal('mbland')
          client.owners['msb'].should.eql([])
          client.owners['mbland'].should.eql(['/foo'])
        })
    })

    it('only the original owner can change the owner', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return fetcher.changeOwner('/foo', 'mbland', 'mbland')
        })
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
        .then(function() {
          client.db['/foo'].owner.should.equal('msb')
          client.owners['msb'].should.eql(['/foo'])
          expect(client.owners['mbland']).to.be.undefined
        })
    })

    it('fails if the redirection doesn\'t exist', function() {
      return fetcher.changeOwner('/foo', 'msb', 'mbland')
        .should.be.rejectedWith(Error, 'no redirection exists for /foo')
        .then(function() {
          expect(client.db['/foo']).to.be.undefined
        })
    })

    it('fails if the client call fails', function() {
      var changeOwner = sinon.stub(client, 'changeOwner')
      changeOwner.withArgs('/foo', 'mbland').callsFake(function(url, owner) {
        return Promise.reject(new Error(
          'forced error for ' + url + ' ' + owner))
      })

      return fetcher.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return fetcher.changeOwner('/foo', 'msb', 'mbland')
        })
        .should.be.rejectedWith(Error, 'failed to transfer ownership of ' +
          '/foo to mbland: Error: forced error for /foo mbland')
    })
  })

  describe('updateLocation', function() {
    it('successfully changes the location', function() {
      client.db['/foo'] = { owner: 'msb', location: '/bar' }
      return fetcher.updateLocation('/foo', 'msb', REDIRECT_TARGET)
        .should.be.fulfilled.then(function() {
          client.db['/foo'].location.should.equal(REDIRECT_TARGET)
        })
    })

    it('only the original owner can change the location', function() {
      client.db['/foo'] = { owner: 'msb', location: '/bar' }
      return fetcher.updateLocation('/foo', 'mbland', REDIRECT_TARGET)
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
        .then(function() {
          client.db['/foo'].location.should.equal('/bar')
        })
    })

    it('fails if the client call fails', function() {
      var updateLocation = sinon.stub(client, 'updateLocation')
      updateLocation.withArgs('/foo', '/bar').callsFake(function(url, loc) {
        return Promise.reject(new Error('forced error for ' + url + ' ' + loc))
      })
      client.db['/foo'] = { owner: 'mbland', location: REDIRECT_TARGET }

      return fetcher.updateLocation('/foo', 'mbland', '/bar')
        .should.be.rejectedWith(Error, 'failed to update location of ' +
          '/foo to /bar: Error: forced error for /foo /bar')
    })
  })

  describe('deleteRedirection', function() {
    it('successfully deletes the redirection', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return fetcher.create('/bar', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return fetcher.create('/baz', REDIRECT_TARGET, 'mbland')
        })
        .then(function() {
          return fetcher.deleteRedirection('/bar', 'mbland')
        })
        .should.be.fulfilled.then(function() {
          expect(client.db['/bar']).to.be.undefined
          client.owners['mbland'].should.eql(['/baz', '/foo'])
        })
    })

    it('only the original owner can delete the redirection', function() {
      return fetcher.create('/foo', REDIRECT_TARGET, 'msb')
        .then(function() {
          return fetcher.deleteRedirection('/foo', 'mbland')
        })
        .should.be.rejectedWith(Error, 'redirection for /foo is owned by msb')
        .then(function() {
          client.db['/foo'].owner.should.equal('msb')
          client.owners['msb'].should.eql(['/foo'])
        })
    })

    it('fails if the client call fails', function() {
      var deleteRedirection = sinon.stub(client, 'deleteRedirection')
      deleteRedirection.withArgs('/foo').callsFake(function(url) {
        return Promise.reject(new Error('forced error for ' + url))
      })

      return fetcher.create('/foo', REDIRECT_TARGET, 'mbland')
        .then(function() {
          return fetcher.deleteRedirection('/foo', 'mbland')
        })
        .should.be.rejectedWith(Error, 'failed to delete redirection from ' +
          '/foo: Error: forced error for /foo')
    })

  })
})

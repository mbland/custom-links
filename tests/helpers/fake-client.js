'use strict'

module.exports = FakeClient

function FakeClient() {
  this.db = {}
  this.owners = {}
}

FakeClient.prototype.getRedirect = function(url) {
  return Promise.resolve(this.db[url] || null)
}

FakeClient.prototype.recordAccess = function(url) {
  this.db[url].count += 1
  return Promise.resolve()
}

FakeClient.prototype.create = function(url, location, owner) {
  this.db[url] = { location: location, owner: owner, count: 0 }
  addUrlToOwner(this.owners, owner, url)
  return Promise.resolve()
}

FakeClient.prototype.getOwnedRedirects = function(owner) {
  return Promise.resolve(this.owners[owner] || [])
}

function addUrlToOwner(owners, owner, url) {
  if (!owners[owner]) {
    owners[owner] = []
  }
  owners[owner].unshift(url)
}

function removeUrlFromOwner(owners, owner, url) {
  owners[owner] = owners[owner].filter(function(ownedUrl) {
    return ownedUrl !== url
  })
}

FakeClient.prototype.changeOwner = function(url, newOwner) {
  removeUrlFromOwner(this.owners, this.db[url].owner, url)
  this.db[url].owner = newOwner
  addUrlToOwner(this.owners, newOwner, url)
  return Promise.resolve()
}

FakeClient.prototype.updateLocation = function(url, newLocation) {
  this.db[url].location = newLocation
  return Promise.resolve()
}

FakeClient.prototype.deleteRedirection = function(url) {
  removeUrlFromOwner(this.owners, this.db[url].owner, url)
  delete this.db[url]
  return Promise.resolve()
}

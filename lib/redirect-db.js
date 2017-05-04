'use strict'

module.exports = RedirectDb

function RedirectDb(client, logger) {
  this.client = client
  this.logger = logger
}

RedirectDb.prototype.getRedirect = function(url, options) {
  var db = this
  options = options || {}
  return this.client.getRedirect(url).then(function(urlData) {
    if (urlData !== null && options.recordAccess) {
      db.client.recordAccess(url).catch(function(err) {
        db.logger.error('failed to record access for ' + url + ': ' + err)
      })
    }
    return urlData
  })
}

function attachErrorHandler(promise, errMsg) {
  return promise.catch(function(err) {
    throw new Error(errMsg + ': ' + err)
  })
}

RedirectDb.prototype.createRedirect = function(url, location, user) {
  var db = this
  return attachErrorHandler(db.client.createRedirect(url, location, user),
    'error creating redirection for ' + url + ' to be owned by ' + user)
    .then(function() {
      return attachErrorHandler(db.client.addUrlToOwner(user, url),
        'redirection created for ' + url +
        ', but failed to add to list for user ' + user)
    })
}

RedirectDb.prototype.getOwnedRedirects = function(user) {
  var db = this
  return db.client.getOwnedRedirects(user)
    .then(function(redirects) {
      return Promise.all(redirects.map(function(url) {
        return db.client.getRedirect(url).then(function(urlData) {
          urlData.url = url
          return urlData
        })
      }))
    })
}

RedirectDb.prototype.checkOwnership = function(url, user) {
  return this.client.getRedirect(url)
    .then(function(urlData) {
      if (!urlData) {
        throw new Error('no redirection exists for ' + url)
      } else if (urlData.owner !== user) {
        throw new Error('redirection for ' + url + ' is owned by ' +
          urlData.owner)
      }
    })
}

RedirectDb.prototype.updateProperty = function(url, user, property, value) {
  var db = this
  return db.checkOwnership(url, user)
    .then(function() {
      return attachErrorHandler(db.client.updateProperty(url, property, value),
        'failed to update ' + property + ' of ' + url + ' to ' + value)
    })
}

RedirectDb.prototype.changeOwner = function(url, user, newOwner) {
  var db = this
  return db.updateProperty(url, user, 'owner', newOwner)
    .then(function() {
      var errPrefix = 'changed ownership of ' + url + ' from ' + user +
            ' to ' + newOwner + ', but failed to '

      return Promise.all([
        attachErrorHandler(db.client.addUrlToOwner(newOwner, url),
          errPrefix + 'add it to new owner\'s list'),
        attachErrorHandler(db.client.removeUrlFromOwner(user, url),
          errPrefix + 'remove it from previous ' + 'owner\'s list')
      ])
    })
}

RedirectDb.prototype.updateLocation = function(url, user, newLocation) {
  return this.updateProperty(url, user, 'location', newLocation)
}

RedirectDb.prototype.deleteRedirection = function(url, user) {
  var db = this
  return db.checkOwnership(url, user)
    .then(function() {
      return attachErrorHandler(db.client.deleteRedirection(url),
        'failed to delete redirection from ' + url)
    })
    .then(function() {
      return attachErrorHandler(db.client.removeUrlFromOwner(user, url),
        'deleted redirection from ' + url +
        ', but failed to remove URL from the owner\'s list for ' + user)
    })
}

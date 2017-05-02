'use strict'

module.exports = RedirectDb

function RedirectDb(client, logger) {
  this.client = client
  this.logger = logger
}

RedirectDb.prototype.getRedirect = function(url) {
  var db = this
  return db.client.getRedirect(url).then(function(urlData) {
    if (!urlData) {
      return '/'
    }
    db.client.recordAccess(url).catch(function(err) {
      db.logger.error('failed to record access for ' + url + ': ' + err)
    })
    return urlData.location
  })
}

RedirectDb.prototype.createRedirect = function(url, location, user) {
  var db = this
  return db.client.createRedirect(url, location, user)
    .catch(function(err) {
      throw new Error('error creating redirection for ' + url +
        ' to be owned by ' + user + ': ' + err)
    })
    .then(function() {
      return db.client.addUrlToOwner(user, url)
        .catch(function(err) {
          throw new Error('redirection created for ' + url +
            ', but failed to add to list for user ' + user + ': ' + err)
        })
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

function checkOwnership(client, url, user) {
  return client.getRedirect(url)
    .then(function(urlData) {
      if (!urlData) {
        throw new Error('no redirection exists for ' + url)
      } else if (urlData.owner !== user) {
        throw new Error('redirection for ' + url + ' is owned by ' +
          urlData.owner)
      }
    })
}

function updateProperty(client, url, user, property, value) {
  return checkOwnership(client, url, user)
    .then(function() {
      return client.updateProperty(url, property, value)
        .catch(function(err) {
          throw new Error('failed to update ' + property + ' of ' + url +
            ' to ' + value + ': ' + err)
        })
    })
}

RedirectDb.prototype.changeOwner = function(url, user, newOwner) {
  var db = this
  return updateProperty(db.client, url, user, 'owner', newOwner)
    .then(function() {
      var errPrefix = 'changed ownership of ' + url + ' from ' + user +
            ' to ' + newOwner + ', but failed to '

      return Promise.all([
        db.client.addUrlToOwner(newOwner, url).catch(function(err) {
          throw new Error(errPrefix + 'add it to new owner\'s list: ' + err)
        }),
        db.client.removeUrlFromOwner(user, url).catch(function(err) {
          throw new Error(errPrefix + 'remove it from previous ' +
            'owner\'s list: ' + err)
        })
      ])
    })
}

RedirectDb.prototype.updateLocation = function(url, user, newLocation) {
  return updateProperty(this.client, url, user, 'location', newLocation)
}

RedirectDb.prototype.deleteRedirection = function(url, user) {
  var db = this
  return checkOwnership(db.client, url, user)
    .then(function() {
      return db.client.deleteRedirection(url)
        .catch(function(err) {
          throw new Error(
            'failed to delete redirection from ' + url + ': ' + err)
        })
    })
    .then(function() {
      return db.client.removeUrlFromOwner(user, url)
        .catch(function(err) {
          throw new Error('deleted redirection from ' + url +
            ', but failed to remove URL from the owner\'s list for ' + user +
            ': ' + err)
        })
    })
}

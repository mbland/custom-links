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

RedirectDb.prototype.create = function(url, location, user) {
  var db = this
  return db.client.create(url, location, user).catch(function(err) {
    throw new Error('error setting redirection for ' + url +
      ' to be owned by ' + user + ': ' + err)
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
  return client.getRedirect(url).then(function(urlData) {
    if (!urlData) {
      throw new Error('no redirection exists for ' + url)
    } else if (urlData.owner !== user) {
      throw new Error('redirection for ' + url + ' is owned by ' +
        urlData.owner)
    }
  })
}

RedirectDb.prototype.changeOwner = function(url, user, newOwner) {
  var db = this
  return checkOwnership(db.client, url, user).then(function() {
    return db.client.changeOwner(url, newOwner).catch(function(err) {
      throw new Error('failed to transfer ownership of ' + url + ' to ' +
        newOwner + ': ' + err)
    })
  })
}

RedirectDb.prototype.updateLocation = function(url, user, newLocation) {
  var db = this
  return checkOwnership(db.client, url, user).then(function() {
    return db.client.updateLocation(url, newLocation).catch(function(err) {
      throw new Error('failed to update location of ' + url + ' to ' +
        newLocation + ': ' + err)
    })
  })
}

RedirectDb.prototype.deleteRedirection = function(url, user) {
  var db = this
  return checkOwnership(db.client, url, user).then(function() {
    return db.client.deleteRedirection(url).catch(function(err) {
      throw new Error('failed to delete redirection from ' + url + ': ' + err)
    })
  })
}

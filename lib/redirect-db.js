'use strict'

module.exports = RedirectDb

function rethrowError(message) {
  return function(err) {
    err.message = message + ': ' + err.message
    throw err
  }
}

function RedirectDb(client, logger) {
  this.client = client
  this.logger = logger
}

RedirectDb.prototype.userExists = function(user) {
  return this.client.userExists(user)
    .then(function(exists) {
      return exists ? Promise.resolve() :
        Promise.reject('user ' + user + ' doesn\'t exist')
    })
}

RedirectDb.prototype.findUser = function(userId) {
  return this.userExists(userId)
    .then(function() {
      return { id: userId }
    })
}

RedirectDb.prototype.findOrCreateUser = function(userId) {
  return this.client.findOrCreateUser(userId)
    .then(function() {
      return { id: userId }
    })
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

RedirectDb.prototype.createRedirect = function(url, location, user) {
  var db = this

  return db.userExists(user)
    .then(function() {
      return db.client.createRedirect(url, location, user)
        .catch(rethrowError('error creating redirection for ' + url +
          ' to be owned by ' + user))
    })
    .then(function(created) {
      if (created === false) {
        return Promise.reject(url + ' already exists')
      }
      return db.client.addUrlToOwner(user, url)
        .then(function(result) {
          if (result === false) {
            throw new Error('user was deleted before URL could be assigned')
          }
        })
        .catch(rethrowError('redirection created for ' + url +
          ', but failed to add to list for user ' + user))
    })
}

RedirectDb.prototype.getOwnedRedirects = function(user) {
  var db = this
  return db.userExists(user)
    .then(function() {
      return db.client.getOwnedRedirects(user)
    })
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
        return Promise.reject('no redirection exists for ' + url)
      } else if (urlData.owner !== user) {
        return Promise.reject('redirection for ' + url + ' is owned by ' +
          urlData.owner)
      }
    })
}

RedirectDb.prototype.updateProperty = function(url, user, property, value) {
  var db = this
  return db.checkOwnership(url, user)
    .then(function() {
      return db.client.updateProperty(url, property, value)
        .catch(rethrowError('failed to update ' + property + ' of ' + url +
          ' to ' + value))
    })
    .then(function(updated) {
      if (updated === false) {
        throw new Error('property ' + property + ' of ' + url +
          ' doesn\'t exist')
      }
    })
}

RedirectDb.prototype.changeOwner = function(url, user, newOwner) {
  var db = this
  return Promise.all(
    [
      db.checkOwnership(url, user),
      db.userExists(newOwner)
    ])
    .then(function() {
      return db.updateProperty(url, user, 'owner', newOwner)
    })
    .then(function() {
      var errPrefix = 'changed ownership of ' + url + ' from ' + user +
            ' to ' + newOwner + ', but failed to '

      return Promise.all([
        db.client.addUrlToOwner(newOwner, url)
          .catch(rethrowError(errPrefix + 'add it to new owner\'s list')),
        db.client.removeUrlFromOwner(user, url)
          .catch(rethrowError(
            errPrefix + 'remove it from previous owner\'s list'))
      ]).then(function(values) {
        if (values[1] === false) {
          throw new Error('assigned ownership of ' + url + ' to ' + newOwner +
            ', but ' + user + ' didn\'t own it')
        }
      })
    })
}

RedirectDb.prototype.updateLocation = function(url, user, newLocation) {
  return this.updateProperty(url, user, 'location', newLocation)
}

RedirectDb.prototype.deleteRedirection = function(url, user) {
  var db = this
  return db.checkOwnership(url, user)
    .then(function() {
      return db.client.deleteRedirection(url)
        .catch(rethrowError('failed to delete redirection from ' + url))
    })
    .then(function(deleted) {
      if (deleted === false) {
        return Promise.reject('redirection for ' + url + ' already deleted')
      }
      return db.client.removeUrlFromOwner(user, url)
        .catch(rethrowError('deleted redirection from ' + url +
          ', but failed to remove URL from the owner\'s list for ' + user))
    })
    .then(function(removed) {
      if (removed === false) {
        throw new Error('deleted redirection from ' + url + ', but ' + user +
          ' didn\'t own it')
      }
    })
}

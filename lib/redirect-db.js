'use strict'

module.exports = RedirectDb

function rethrowError(message) {
  return err => {
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
    .then(exists => {
      return exists ? Promise.resolve() :
        Promise.reject('user ' + user + ' doesn\'t exist')
    })
}

RedirectDb.prototype.findUser = function(userId) {
  return this.userExists(userId)
    .then(() => ({ id: userId }))
}

RedirectDb.prototype.findOrCreateUser = function(userId) {
  return this.client.findOrCreateUser(userId)
    .then(() => ({ id: userId }))
}

RedirectDb.prototype.getRedirect = function(url, options) {
  options = options || {}
  return this.client.getRedirect(url).then(urlData => {
    if (urlData !== null && options.recordAccess) {
      this.client.recordAccess(url).catch(err => {
        this.logger.error('failed to record access for ' + url + ': ' + err)
      })
    }
    return urlData
  })
}

RedirectDb.prototype.createRedirect = function(url, location, user) {
  return this.userExists(user)
    .then(() => {
      return this.client.createRedirect(url, location, user)
        .catch(rethrowError('error creating redirection for ' + url +
          ' to be owned by ' + user))
    })
    .then(created => {
      if (created === false) {
        return Promise.reject(url + ' already exists')
      }
      return this.client.addUrlToOwner(user, url)
        .then(result => {
          if (result === false) {
            throw new Error('user was deleted before URL could be assigned')
          }
        })
        .catch(rethrowError('redirection created for ' + url +
          ', but failed to add to list for user ' + user))
    })
}

RedirectDb.prototype.getOwnedRedirects = function(user) {
  return this.userExists(user)
    .then(() => this.client.getOwnedRedirects(user))
    .then(redirects => {
      return Promise.all(redirects.map(url => {
        return this.client.getRedirect(url).then(urlData => {
          urlData.url = url
          return urlData
        })
      }))
    })
}

RedirectDb.prototype.checkOwnership = function(url, user) {
  return this.client.getRedirect(url)
    .then(urlData => {
      if (!urlData) {
        return Promise.reject('no redirection exists for ' + url)
      } else if (urlData.owner !== user) {
        return Promise.reject('redirection for ' + url + ' is owned by ' +
          urlData.owner)
      }
    })
}

RedirectDb.prototype.updateProperty = function(url, user, property, value) {
  return this.checkOwnership(url, user)
    .then(() => {
      return this.client.updateProperty(url, property, value)
        .catch(rethrowError('failed to update ' + property + ' of ' + url +
          ' to ' + value))
    })
    .then(updated => {
      if (updated === false) {
        throw new Error('property ' + property + ' of ' + url +
          ' doesn\'t exist')
      }
    })
}

RedirectDb.prototype.changeOwner = function(url, user, newOwner) {
  return Promise.all(
    [
      this.checkOwnership(url, user),
      this.userExists(newOwner)
    ])
    .then(() => this.updateProperty(url, user, 'owner', newOwner))
    .then(() => {
      var errPrefix = 'changed ownership of ' + url + ' from ' + user +
            ' to ' + newOwner + ', but failed to '

      return Promise.all(
        [
          this.client.addUrlToOwner(newOwner, url)
            .catch(rethrowError(errPrefix + 'add it to new owner\'s list')),
          this.client.removeUrlFromOwner(user, url)
            .catch(rethrowError(
              errPrefix + 'remove it from previous owner\'s list'))
        ])
        .then(values => {
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
  return this.checkOwnership(url, user)
    .then(() => {
      return this.client.deleteRedirection(url)
        .catch(rethrowError('failed to delete redirection from ' + url))
    })
    .then(deleted => {
      if (deleted === false) {
        return Promise.reject('redirection for ' + url + ' already deleted')
      }
      return this.client.removeUrlFromOwner(user, url)
        .catch(rethrowError('deleted redirection from ' + url +
          ', but failed to remove URL from the owner\'s list for ' + user))
    })
    .then(removed => {
      if (removed === false) {
        throw new Error('deleted redirection from ' + url + ', but ' + user +
          ' didn\'t own it')
      }
    })
}

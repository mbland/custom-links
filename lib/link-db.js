'use strict'

module.exports = LinkDb

function rethrowError(message) {
  return err => {
    err.message = message + ': ' + err.message
    throw err
  }
}

function LinkDb(client, logger) {
  this.client = client
  this.logger = logger
  this.fetchLinkData = links => this.client.fetchLinkData(links)
}

LinkDb.prototype.userExists = function(user) {
  return this.client.userExists(user)
    .then(exists => {
      return exists ? Promise.resolve() :
        Promise.reject('user ' + user + ' doesn\'t exist')
    })
}

LinkDb.prototype.findUser = function(userId) {
  return this.userExists(userId)
    .then(() => ({ id: userId }))
}

LinkDb.prototype.findOrCreateUser = function(userId) {
  return this.client.findOrCreateUser(userId)
    .then(() => ({ id: userId }))
}

LinkDb.prototype.getLink = function(link, options) {
  options = options || {}
  return this.client.getLink(link).then(linkData => {
    if (linkData !== null && options.recordAccess) {
      this.client.recordAccess(link).catch(err => {
        this.logger.error('failed to record access for ' + link + ': ' + err)
      })
    }
    return linkData
  })
}

LinkDb.prototype.createLink = function(link, target, user) {
  return this.userExists(user)
    .then(() => {
      return this.client.createLink(link, target, user)
        .catch(rethrowError('error creating ' + link +
          ' to be owned by ' + user))
    })
    .then(created => {
      if (created === false) {
        return this.getLinkIfOwner(link, user).then(function() {
          return Promise.reject(link + ' already exists')
        })
      }
      return this.client.addLinkToOwner(user, link)
        .then(result => {
          if (result === false) {
            throw new Error('user was deleted before link could be assigned')
          }
        })
        .catch(rethrowError(link + ' created, ' +
          'but failed to add to list for user ' + user))
    })
}

LinkDb.prototype.getOwnedLinks = function(user) {
  return this.userExists(user)
    .then(() => this.client.getOwnedLinks(user))
    .then(this.fetchLinkData)
}

LinkDb.prototype.getLinkIfOwner = function(link, user) {
  return this.client.getLink(link)
    .then(linkData => {
      if (!linkData) {
        return Promise.reject(link + ' does not exist')
      } else if (linkData.owner !== user) {
        return Promise.reject(link + ' is owned by ' + linkData.owner)
      }
      return linkData
    })
}

LinkDb.prototype.searchShortLinks = function(searchString) {
  return this.client.searchShortLinks(searchString)
    .then(results => { return { results } })
}

LinkDb.prototype.searchTargetLinks = function(searchString) {
  return this.client.searchTargetLinks(searchString)
    .then(targetUrlToCustomLinks => {
      var result = {}
      const promises = Object.keys(targetUrlToCustomLinks)
        .reduce((promises, target) => {
          promises.push(this.fetchLinkData(targetUrlToCustomLinks[target])
            .then(linkInfo => {
              result[target] = linkInfo
            }))
          return promises
        }, [])
      return Promise.all(promises)
        .then(() => result)
    })
}

LinkDb.prototype.completeLink = function(prefix) {
  return this.client.completeLink(prefix)
}

LinkDb.prototype.updateProperty = function(link, user, property, value) {
  return this.getLinkIfOwner(link, user)
    .then(() => {
      return this.client.updateProperty(link, property, value)
        .catch(rethrowError('failed to update ' + property + ' of ' + link +
          ' to ' + value))
    })
    .then(updated => {
      if (updated === false) {
        throw new Error('property ' + property + ' of ' + link +
          ' doesn\'t exist')
      }
    })
}

LinkDb.prototype.changeOwner = function(link, user, newOwner) {
  return Promise.all(
    [
      this.getLinkIfOwner(link, user),
      this.userExists(newOwner)
    ])
    .then(() => this.updateProperty(link, user, 'owner', newOwner))
    .then(() => {
      var errPrefix = 'changed ownership of ' + link + ' from ' + user +
            ' to ' + newOwner + ', but failed to '

      return Promise.all(
        [
          this.client.addLinkToOwner(newOwner, link)
            .catch(rethrowError(errPrefix + 'add it to new owner\'s list')),
          this.client.removeLinkFromOwner(user, link)
            .catch(rethrowError(
              errPrefix + 'remove it from previous owner\'s list'))
        ])
        .then(values => {
          if (values[1] === false) {
            throw new Error('assigned ownership of ' + link + ' to ' +
              newOwner + ', but ' + user + ' didn\'t own it')
          }
        })
    })
}

LinkDb.prototype.updateTarget = function(link, user, newTarget) {
  return this.updateProperty(link, user, 'target', newTarget)
}

LinkDb.prototype.deleteLink = function(link, user) {
  return this.getLinkIfOwner(link, user)
    .then(() => {
      return this.client.deleteLink(link)
        .catch(rethrowError('failed to delete ' + link))
    })
    .then(deleted => {
      if (deleted === false) {
        return Promise.reject(link + ' already deleted')
      }
      return this.client.removeLinkFromOwner(user, link)
        .catch(rethrowError('deleted ' + link +
          ', but failed to remove link from the owner\'s list for ' + user))
    })
    .then(removed => {
      if (removed === false) {
        throw new Error('deleted ' + link + ', but ' + user + ' didn\'t own it')
      }
    })
}

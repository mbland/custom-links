'use strict'

module.exports = RedisClient

/**
 * Internal wrapper for the `redis` npm client created by
 * `redis.createClient`.
 *
 * The interface of this class comprises our own internal API for data store
 * operations.
 *
 * Methods that return `Promises` will return the error object from the
 * underlying Redis client call on rejection.
 *
 * @constructor
 * @param {redis} client - instance of the `redis` npm client
 */
function RedisClient(client, getTimestamp) {
  this.client = client
  this.getTimestamp = getTimestamp || (() => new Date().getTime())
}

// Helper function that Promisifies common Redis client operations
function expectResult(expected, func) {
  return new Promise((resolve, reject) => {
    func((err, result) => err ? reject(err) : resolve(result === expected))
  })
}

/**
 * Determines whether or not a user has logged into the system
 *
 * @param {string} userId - username, email address, or other identifier
 * @returns {Promise} true if the user exists, false otherwise
 */
RedisClient.prototype.userExists = function(userId) {
  return expectResult(1, done => this.client.exists(userId, done))
}

/**
 * Creates a new user record if one doesn't already exist
 *
 * @param {string} userId - username, email address, or other identifier
 * @returns {Promise} true if the user exists, false otherwise
 */
RedisClient.prototype.findOrCreateUser = function(userId) {
  return this.userExists(userId)
    .then(exists => {
      if (exists) {
        return false
      }
      return expectResult(1, done => this.client.lpush(userId, '', done))
    })
}

/**
 * Returns all the information for a custom link
 *
 * The key convention for all custom links is that they all begin with `/`.
 *
 * @param {string} link - The custom link for which to retrieve information
 * @returns {Promise} The information pertaining to `link`
 */
RedisClient.prototype.getLink = function(link) {
  return new Promise((resolve, reject) => {
    this.client.hgetall(link, (err, linkData) => {
      if (err) {
        return reject(err)
      } else if (linkData && linkData.clicks) {
        linkData.clicks = parseInt(linkData.clicks)
      }
      resolve(linkData)
    })
  })
}

/**
 * Returns a list of custom links
 *
 * Currently returns all custom links, but will be refactored to support a
 * custom search pattern.
 *
 * @returns {Promise} a list of custom link records
 */
RedisClient.prototype.getLinks = function() {
  var links = []
  var cursor = 0

  const collectResults = ([cursorNext, results]) => {
    links.push(...results)
    cursor = parseInt(cursorNext)
    return cursor ? scan() : links
  }

  const processResults = (resolve, reject) => {
    this.client.scan(cursor, 'match', '/*',
      (err, results) => err ? reject(err) : resolve(results))
  }

  const scan = () => {
    return new Promise(processResults).then(collectResults)
  }

  return scan().then((links) => Promise.all(links.map(link =>
      this.getLink(link).then(linkData => {
        linkData.link = link
        return linkData
      }))
  ))
}

/**
 * Increments the access count for the specified link
 *
 * Keeps track of how many times a custom link has been followed.
 *
 * @param {string} link - the custom link accessed
 * @returns {Promise}
 */
RedisClient.prototype.recordAccess = function(link) {
  return new Promise((resolve, reject) => {
    this.client.hincrby(link, 'clicks', 1, err => err ? reject(err) : resolve())
  })
}

/**
 * Assigns ownership of a custom link to a user
 *
 * @param {string} owner - the user ID of the new owner of `link`
 * @param {string} link - the custom link to assign to `owner`
 * @returns {Promise} true if ownership was assigned, false otherwise
 */
RedisClient.prototype.addLinkToOwner = function(owner, link) {
  return new Promise((resolve, reject) => {
    this.client.lpushx(owner, link, (err, result) => {
      err ? reject(err) : resolve(result !== 0)
    })
  })
}

/**
 * Removes ownership of a custom link from a user
 *
 * @param {string} owner - the user ID of the current owner of `link`
 * @param {string} link - the custom link to remove from `owner`
 * @returns {Promise} true if ownership was removed, false otherwise
 */
RedisClient.prototype.removeLinkFromOwner = function(owner, link) {
  return expectResult(1, done => this.client.lrem(owner, 1, link, done))
}

/**
 * Creates a new custom link record
 *
 * @param {string} link - custom link to create; must begin with '/'
 * @param {string} target - the target URL for the custom link
 * @param {string} owner - user ID of the link owner; must already exist
 * @returns {Promise} true if the link was created, false otherwise
 */
RedisClient.prototype.createLink = function(link, target, owner) {
  return new Promise((resolve, reject) => {
    var createdStamp = this.getTimestamp()

    this.client.hsetnx(link, 'owner', owner, (err, result) => {
      if (err) {
        return reject(err)
      } else if (result === 0) {
        return resolve(false)
      }
      this.client.hmset(link,
        'target', target,
        'created', createdStamp,
        'updated', createdStamp,
        'clicks', 0,
        err => {
          if (err) {
            return reject(new Error(link + ' created, ' +
              'but failed to set target, clicks, and timestamps: ' + err))
          }
          resolve(true)
        })
    })
  })
}

/**
 * Returns the list of links owned by a particular user
 *
 * @param {string} owner - user ID for which to retrieve custom links
 * @returns {Promise} the list of custom links owned by `owner`
 */
RedisClient.prototype.getOwnedLinks = function(owner) {
  return new Promise((resolve, reject) => {
    this.client.lrange(owner, 0, -1, (err, data) => {
      if (err) {
        return reject(err)
      }
      // Since the model is that users are created with the empty string as the
      // first list element, pop that before returning links.
      data.pop()
      resolve(data)
    })
  })
}

/**
 * Updates an arbitrary property of a custom link record
 *
 * @param {string} link - custom link to update
 * @param {string} property - name of the property to update
 * @param {string} value - value to assign to the property
 * @returns {Promise} true if `link` exists and the property was updated, false
 *   otherwise
 */
RedisClient.prototype.updateProperty = function(link, property, value) {
  return this.getLink(link)
    .then(linkData => {
      if (!linkData) {
        return Promise.resolve(false)
      }
      return expectResult('OK', done => {
        this.client.hmset(link,
          property, value,
          'updated', this.getTimestamp(),
          done)
      })
    })
}

/**
 * Deletes a custom link record
 *
 * @param {string} link - custom link to update
 * @returns {Promise} true if the link was deleted, false otherwise
 */
RedisClient.prototype.deleteLink = function(link) {
  return expectResult(1, done => this.client.del(link, done))
}

'use strict'

module.exports = class Keys {
  static build() {
    return Array.prototype.slice.call(arguments).join(':')
  }

  static completeLinksSet() {
    return COMPLETE_LINKS_SET_KEY
  }

  static targetIndex(target) {
    return Keys.build('target', target)
  }

  static getTargetLinkFromKey(targetLinkKey) {
    return targetLinkKey.slice('target:'.length)
  }
}

const COMPLETE_LINKS_SET_KEY = module.exports.build('complete', 'links')

'use strict'

module.exports = class Keys {

  static get SHORT_LINK_PREFIX() {
    return SHORT_LINK_PREFIX
  }

  static get TARGET_LINK_INDEX_PREFIX() {
    return TARGET_LINK_INDEX_PREFIX
  }

  static build() {
    return Array.prototype.slice.call(arguments).join(':')
  }

  static completeLinksSet() {
    return COMPLETE_LINKS_SET_KEY
  }

  static targetIndex(target) {
    return Keys.build('target', target)
  }

  static getLinkFromTargetIndexKey(targetIndexKey) {
    return targetIndexKey.slice('target:'.length)
  }
}

const COMPLETE_LINKS_SET_KEY = module.exports.build('complete', 'links')
const SHORT_LINK_PREFIX = '/'
const TARGET_LINK_INDEX_PREFIX = 'target:'

/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

module.exports = function(_crawlerOptions) {
  const newClocks = new Map();
  newClocks.set('relativeRoot', 'changedFilesClock');

  const changedFiles = new Map();
  changedFiles.set('foobar.test.js', {mtime: 0, sha1: null, size: 0});

  return new Promise(resolve => {
    resolve({
      changedFiles,
      isFresh: false,
      newClocks,
      removedFiles: new Set(),
    });
  });
};

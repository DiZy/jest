/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

module.exports = function(_crawlerOptions) {
  const newClocks = new Map();
  newClocks.set('relativeRoot', 'removedFilesClock');

  const changedFiles = new Map();
  changedFiles.set('bar.test.js', {mtime: 0, sha1: null, size: 0});

  const removedFiles = new Set();
  removedFiles.add('foo.test.js');

  return new Promise(resolve => {
    resolve({
      changedFiles,
      isFresh: false,
      newClocks,
      removedFiles,
    });
  });
};

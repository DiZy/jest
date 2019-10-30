/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

module.exports = function(_crawlerOptions) {
  return new Promise(resolve => {
    resolve({
      randomFiles: ['foo.test.js'],
    });
  });
};

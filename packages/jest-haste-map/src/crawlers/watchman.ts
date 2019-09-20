/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as path from 'path';
import watchman = require('fb-watchman');
import {Config} from '@jest/types';
import * as fastPath from '../lib/fast_path';
import normalizePathSep from '../lib/normalizePathSep';

import {
  CrawlerOptions,
  FileCrawlData,
  CrawledFileMetadata,
} from '../types';

type WatchmanRoots = Map<string, Array<string>>;

const watchmanURL =
  'https://facebook.github.io/watchman/docs/troubleshooting.html';

function WatchmanError(error: Error): Error {
  error.message =
    `Watchman error: ${error.message.trim()}. Make sure watchman ` +
    `is running for this project. See ${watchmanURL}.`;
  return error;
}

export = async function watchmanCrawl(
  options: CrawlerOptions,
): Promise<FileCrawlData> {
  const fields = ['name', 'exists', 'mtime_ms', 'size'];
  const {clocks, extensions, ignore, rootDir, roots} = options;
  const defaultWatchExpression = [
    'allof',
    ['type', 'f'],
    ['anyof', ...extensions.map(extension => ['suffix', extension])],
  ];
  const client = new watchman.Client();

  let clientError;
  client.on('error', error => (clientError = WatchmanError(error)));

  // TODO: type better than `any`
  const cmd = (...args: Array<any>): Promise<any> =>
    new Promise((resolve, reject) =>
      client.command(args, (error, result) =>
        error ? reject(WatchmanError(error)) : resolve(result),
      ),
    );

  if (options.computeSha1) {
    const {capabilities} = await cmd('list-capabilities');

    if (capabilities.indexOf('field-content.sha1hex') !== -1) {
      fields.push('content.sha1hex');
    }
  }

  async function getWatchmanRoots(
    roots: Array<Config.Path>,
  ): Promise<WatchmanRoots> {
    const watchmanRoots = new Map();
    await Promise.all(
      roots.map(async root => {
        const response = await cmd('watch-project', root);
        const existing = watchmanRoots.get(response.watch);
        // A root can only be filtered if it was never seen with a
        // relative_path before.
        const canBeFiltered = !existing || existing.length > 0;

        if (canBeFiltered) {
          if (response.relative_path) {
            watchmanRoots.set(
              response.watch,
              (existing || []).concat(response.relative_path),
            );
          } else {
            // Make the filter directories an empty array to signal that this
            // root was already seen and needs to be watched for all files or
            // directories.
            watchmanRoots.set(response.watch, []);
          }
        }
      }),
    );
    return watchmanRoots;
  }

  async function queryWatchmanForDirs(rootProjectDirMappings: WatchmanRoots) {
    const files = new Map();
    let isFresh = false;
    await Promise.all(
      Array.from(rootProjectDirMappings).map(
        async ([root, directoryFilters]) => {
          const expression = Array.from(defaultWatchExpression);
          const glob = [];

          if (directoryFilters.length > 0) {
            expression.push([
              'anyof',
              ...directoryFilters.map(dir => ['dirname', dir]),
            ]);

            for (const directory of directoryFilters) {
              for (const extension of extensions) {
                glob.push(`${directory}/**/*.${extension}`);
              }
            }
          } else {
            for (const extension of extensions) {
              glob.push(`**/*.${extension}`);
            }
          }

          const relativeRoot = fastPath.relative(rootDir, root);
          const query = clocks.has(relativeRoot)
            ? // Use the `since` generator if we have a clock available
              {expression, fields, since: clocks.get(relativeRoot)}
            : // Otherwise use the `glob` filter
              {expression, fields, glob};

          const response = await cmd('query', root, query);

          if ('warning' in response) {
            console.warn('watchman warning: ', response.warning);
          }

          isFresh = isFresh || response.is_fresh_instance;
          files.set(root, response);
        },
      ),
    );

    return {
      files,
      isFresh,
    };
  }

  let removedFiles = new Set<Config.Path>();
  const changedFiles = new Map();
  let isFresh = false;
  let watchmanFiles: Map<string, any>;
  try {
    const watchmanRoots = await getWatchmanRoots(roots);
    const watchmanFileResults = await queryWatchmanForDirs(watchmanRoots);

    watchmanFiles = watchmanFileResults.files;
    isFresh = watchmanFileResults.isFresh;
  } finally {
    client.end();
  }

  if (clientError) {
    throw clientError;
  }

  // TODO: remove non-null
  for (const [watchRoot, response] of watchmanFiles!) {
    const fsRoot = normalizePathSep(watchRoot);
    const relativeFsRoot = fastPath.relative(rootDir, fsRoot);
    clocks.set(relativeFsRoot, response.clock);

    for (const fileData of response.files) {
      const filePath = fsRoot + path.sep + normalizePathSep(fileData.name);
      const relativeFilePath = fastPath.relative(rootDir, filePath);


      if (!fileData.exists) {
        removedFiles.add(relativeFilePath);
      } else if (!ignore(filePath)) {
        const mtime =
          typeof fileData.mtime_ms === 'number'
            ? fileData.mtime_ms
            : fileData.mtime_ms.toNumber();
        const size = fileData.size;

        let sha1hex = fileData['content.sha1hex'];
        if (typeof sha1hex !== 'string' || sha1hex.length !== 40) {
          sha1hex = null;
        }

        let changedFileMetadata: CrawledFileMetadata = {mtime, size, sha1: sha1hex};

        const mappings = options.mapper ? options.mapper(filePath) : null;

        if (mappings) {
          for (const absoluteVirtualFilePath of mappings) {
            if (!ignore(absoluteVirtualFilePath)) {
              const relativeVirtualFilePath = fastPath.relative(
                rootDir,
                absoluteVirtualFilePath,
              );
              changedFiles.set(relativeVirtualFilePath, changedFileMetadata);
            }
          }
        } else {
          changedFiles.set(relativeFilePath, changedFileMetadata);
        }
      }
    }
  }

  return {
    removedFiles,
    isFresh,
    changedFiles,
    newClocks: clocks,
  };
};

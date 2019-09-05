/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileMetaData} from './types';
import * as fastPath from './lib/fast_path';
import H from './constants';
import HasteFS from './HasteFS';
import SQLitePersistence from './persistence/SQLitePersistence';

export default class SQLHasteFS implements HasteFS {
  private readonly _rootDir: Config.Path;
  private readonly _cachePath: Config.Path;

  constructor(rootDir: Config.Path, cachePath: Config.Path) {
    this._rootDir = rootDir;
    this._cachePath = cachePath;
  }

  getModuleName(file: Config.Path): string | null {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.ID]) || null;
  }

  getSize(file: Config.Path): number | null {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.SIZE]) || null;
  }

  getDependencies(file: Config.Path): Array<string> | null {
    const fileMetadata = this._getFileData(file);

    if (fileMetadata) {
      return fileMetadata[H.DEPENDENCIES]
        ? fileMetadata[H.DEPENDENCIES].split(H.DEPENDENCY_DELIM)
        : [];
    } else {
      return null;
    }
  }

  getSha1(file: Config.Path): string | null {
    const fileMetadata = this._getFileData(file);
    return (fileMetadata && fileMetadata[H.SHA1]) || null;
  }

  exists(file: Config.Path): boolean {
    return this._getFileData(file) != null;
  }

  getAllFiles(): Array<Config.Path> {
    return Array.from(this.getAbsoluteFileIterator());
  }

  getFileIterator(): Iterable<Config.Path> {
    return SQLitePersistence.read(this._cachePath).files.keys();
  }

  *getAbsoluteFileIterator(): Iterable<Config.Path> {
    for (const file of this.getFileIterator()) {
      yield fastPath.resolve(this._rootDir, file);
    }
  }

  matchFiles(pattern: RegExp | string): Array<Config.Path> {
    return SQLitePersistence.findFilePathsBasedOnPattern(pattern, this._cachePath);
  }

  // TODO; update this to not use getAbsoluteFileIterator
  matchFilesWithGlob(
    globs: Array<Config.Glob>,
    root: Config.Path | null,
  ): Set<Config.Path> {
    const files = new Set<string>();
    for (const file of this.getAbsoluteFileIterator()) {
      const filePath = root ? fastPath.relative(root, file) : file;
      if (micromatch([replacePathSepForGlob(filePath)], globs).length > 0) {
        files.add(file);
      }
    }
    return files;
  }

  private _getFileData(file: Config.Path): FileMetaData {
    return SQLitePersistence.getFileData(file, this._cachePath);
  }
}

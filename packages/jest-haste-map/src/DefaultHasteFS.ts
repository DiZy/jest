/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileData, FileMetaData, FileCrawlData, FilePersistenceData} from './types';
import * as fastPath from './lib/fast_path';
import H from './constants';
import HasteFS from './HasteFS';
import FilePersistence from './persistence/FilePersistence';

export default class DefaultHasteFS implements HasteFS{
  private readonly _rootDir: Config.Path;
  private _files: FileData;
  private readonly _cachePath: Config.Path;

  constructor({rootDir, files, cachePath}: {rootDir: Config.Path; files: FileData; cachePath: Config.Path}) {
    this._rootDir = rootDir;
    this._files = files;
    this._cachePath = cachePath;
  }

  persistFileData(fileCrawlData: FileCrawlData): FilePersistenceData {
    const filePersistenceData = FilePersistence.writeFileData(this._cachePath, fileCrawlData);
    try {
      this._files = filePersistenceData.finalFiles!;
      return filePersistenceData;
    } catch {
      throw new Error("FilePersistence did not return finalFiles as needed");
    }
  }

  setFileMetadata(filePath: string, fileMetadata: FileMetaData): void {
    if(this._files.get(filePath)) {
      this._files.set(filePath, fileMetadata);
    }
    else {
      throw new Error("Tried to set metadata on a file that is not in the HasteFS");
    }
  }

  deleteFileMetadata(filePath: string): void {
    this._files.delete(filePath);
  }

  getModuleName(file: Config.Path): string | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.ID]) || null;
  }

  getSize(file: Config.Path): number | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.SIZE]) || null;
  }

  getDependencies(file: Config.Path): Array<string> | null {
    const fileMetadata = this.getFileMetadata(file);

    if (fileMetadata) {
      return fileMetadata[H.DEPENDENCIES]
        ? fileMetadata[H.DEPENDENCIES].split(H.DEPENDENCY_DELIM)
        : [];
    } else {
      return null;
    }
  }

  getSha1(file: Config.Path): string | null {
    const fileMetadata = this.getFileMetadata(file);
    return (fileMetadata && fileMetadata[H.SHA1]) || null;
  }

  exists(file: Config.Path): boolean {
    return this.getFileMetadata(file) != null;
  }

  getAllFilesMap(): FileData {
    return this._files;
  }

  getAllFiles(): Array<Config.Path> {
    return Array.from(this.getAbsoluteFileIterator());
  }

  getFileIterator(): Iterable<Config.Path> {
    return this._files.keys();
  }

  *getAbsoluteFileIterator(): Iterable<Config.Path> {
    for (const file of this.getFileIterator()) {
      yield fastPath.resolve(this._rootDir, file);
    }
  }

  matchFiles(pattern: RegExp | string): Array<Config.Path> {
    if (!(pattern instanceof RegExp)) {
      pattern = new RegExp(pattern);
    }
    const files = [];
    for (const file of this.getAbsoluteFileIterator()) {
      if (pattern.test(file)) {
        files.push(file);
      }
    }
    return files;
  }

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

  getFileMetadata(file: Config.Path): FileMetaData | undefined {
    // const relativePath = fastPath.relative(this._rootDir, file);
    return this._files.get(file);
  }
}

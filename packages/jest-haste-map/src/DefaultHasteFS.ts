/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileData, FileMetaData, FileCrawlData, FilePersistenceData, InternalHasteMap} from './types';
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

  createFilePersistenceData(fileCrawlData: FileCrawlData): FilePersistenceData {
    return FilePersistence.createFilePersistenceData(this._cachePath, fileCrawlData, this._files);
  }

  persistFileData(filePersistenceData: FilePersistenceData, hasteMap: InternalHasteMap): void {
    FilePersistence.writeFileData(this._cachePath, filePersistenceData, hasteMap);
    try {
      this._files = filePersistenceData.finalFiles!;
    } catch {
      throw new Error("FilePersistence persistFileData was called without finalFiles");
    }
  }

  setFileMetadata(filePath: string, fileMetadata: FileMetaData): void {
    const relativePath = this._convertToRelativePath(filePath);
    this._files.set(relativePath, fileMetadata);
  }

  deleteFileMetadata(filePath: string): void {
    const relativePath = this._convertToRelativePath(filePath);
    this._files.delete(relativePath);
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

  matchFilesBasedOnRelativePath(pattern: RegExp | string): Array<Config.Path> {
    if (!(pattern instanceof RegExp)) {
      pattern = new RegExp(pattern);
    }
    const files = [];
    for (const file of this._files.keys()) {
      if (pattern.test(file)) {
        const filePath = fastPath.resolve(this._rootDir, file);
        files.push(filePath);
      }
    }
    return files;
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
    const relativePath = this._convertToRelativePath(file);
    return this._files.get(relativePath);
  }

  private _convertToRelativePath(file: Config.Path): Config.Path {
    if(file.includes(this._rootDir)) {
      return fastPath.relative(this._rootDir, file);
    }
    return file;
  }
}

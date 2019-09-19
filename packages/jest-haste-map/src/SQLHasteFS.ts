/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileMetaData, FileCrawlData, FilePersistenceData, FileData, WatchmanClocks, DuplicatesIndex, ModuleMapItem, InternalHasteMap} from './types';
import * as fastPath from './lib/fast_path';
import H from './constants';
import HasteFS from './HasteFS';
import SQLitePersistence from './persistence/SQLitePersistence';
import rimraf = require('rimraf');

export default class SQLHasteFS implements HasteFS {
  private readonly _rootDir: Config.Path;
  private readonly _cachePath: Config.Path;
  private _cache: InternalHasteMap;

  constructor(rootDir: Config.Path, cachePath: Config.Path, resetCache?: boolean) {
    this._rootDir = rootDir;
    this._cachePath = cachePath;
    if(resetCache) {
      rimraf.sync(cachePath);
    }
    this._cache = {
      duplicates: SQLitePersistence.getDuplicates(cachePath),
      map: new Map(),
      mocks: new Map(),
      files: new Map(),
      clocks: new Map(),
    }
  }
  
  getFullInternalHasteMap(): InternalHasteMap {
    return SQLitePersistence.readInternalHasteMap(this._cachePath);
  }

  createFilePersistenceData(fileCrawlData: FileCrawlData): FilePersistenceData {
    return SQLitePersistence.createFilePersistenceData(this._cachePath, fileCrawlData);
  }

  updateFileData(data: FilePersistenceData): void {
    return SQLitePersistence.writeFileData(this._cachePath, data);
  };

  persist(): void {
    // SQL data is already persisted
    return;
  }
  
  getClocks(): WatchmanClocks {
    return SQLitePersistence.getClocks(this._cachePath);
  }

  setClocks(clocks: WatchmanClocks): void {
    SQLitePersistence.setClocks(this._cachePath, clocks);
  }

  getDuplicates(): DuplicatesIndex {
    return this._cache.duplicates;
  }

  setDuplicates(duplicates: DuplicatesIndex): void {
    this._cache.duplicates = duplicates;
    SQLitePersistence.setDuplicates(this._cachePath, duplicates);
  }

  getFromModuleMap(moduleName: string): ModuleMapItem | undefined {
    return this._cache.map.get(moduleName) || SQLitePersistence.getFromModuleMap(this._cachePath, moduleName);
  }

  setInModuleMap(moduleName: string, moduleMapItem: ModuleMapItem): void {
    this._cache.map.set(moduleName, moduleMapItem);
    SQLitePersistence.setInModuleMap(this._cachePath, moduleName, moduleMapItem);
  }

  deleteFromModuleMap(moduleName: string, platform?: string | undefined): void {
    if(platform) {
      if (this._cache.map.get(moduleName) && Object.keys(this._cache.map.get(moduleName)!).includes(platform)) {
        delete this._cache.map.get(moduleName)![platform];
      }
  
      if(this._cache.map.get(moduleName) && Object.keys(this._cache.map.get(moduleName)!).length === 0) {
        this._cache.map.delete(moduleName);
      }
    }
    else {
      this._cache.map.delete(moduleName);
    }
    SQLitePersistence.deleteFromModuleMap(this._cachePath, moduleName, platform);
  }

  deleteFromMocks(mockName: string): void {
    this._cache.mocks.delete(mockName);
    SQLitePersistence.deleteFromMocks(this._cachePath, mockName);
  }

  getMock(mockPath: string): string | undefined {
    // TODO: add undefined placeholder in cache
    return this._cache.mocks.get(mockPath) || SQLitePersistence.getMock(this._cachePath, mockPath);
  }

  setMock(mockPath: string, relativeFilePath: string): void {
    this._cache.mocks.set(mockPath, relativeFilePath);
    SQLitePersistence.setMock(this._cachePath, mockPath, relativeFilePath);
  }

  clearModuleMap(): void {
    this._cache.map = new Map();
    SQLitePersistence.clearModuleMap(this._cachePath);
  }

  clearMocks(): void {
    this._cache.mocks = new Map();
    SQLitePersistence.clearMocks(this._cachePath);
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
    return SQLitePersistence.readAllFiles(this._cachePath);
  }

  getAllFiles(): Array<Config.Path> {
    return Array.from(this.getAbsoluteFileIterator());
  }

  getFileIterator(): Iterable<Config.Path> {
    return SQLitePersistence.readAllFiles(this._cachePath).keys();
  }

  *getAbsoluteFileIterator(): Iterable<Config.Path> {
    for (const file of this.getFileIterator()) {
      yield fastPath.resolve(this._rootDir, file);
    }
  }

  matchFilesBasedOnRelativePath(pattern: RegExp | string): Array<Config.Path> {
    const files = SQLitePersistence.findFilePathsBasedOnPattern(this._cachePath, pattern.toString());
    return files.map(file => fastPath.resolve(this._rootDir, file));
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

  getFileMetadata(file: Config.Path): FileMetaData | undefined {
    const relativePath = this._convertToRelativePath(file);
    return SQLitePersistence.getFileMetadata(this._cachePath, relativePath);
  }

  setFileMetadata(filePath: Config.Path, fileMetadata: FileMetaData): void {
    const relativePath = this._convertToRelativePath(filePath);
    return SQLitePersistence.setFileMetadata(this._cachePath, relativePath, fileMetadata);
  }

  deleteFileMetadata(file: Config.Path): void {
    const relativePath = this._convertToRelativePath(file);
    return SQLitePersistence.deleteFileMetadata(this._cachePath, relativePath);
  }

  copyHasteMap(): void {
    // No need to copy locally because it is stored in SQL
  }

  private _convertToRelativePath(file: Config.Path): Config.Path {
    if(file.includes(this._rootDir)) {
      return fastPath.relative(this._rootDir, file);
    }
    return file;
  }
}

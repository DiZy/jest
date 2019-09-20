/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import micromatch = require('micromatch');
import {replacePathSepForGlob} from 'jest-util';
import {Config} from '@jest/types';
import {FileMetaData, FileCrawlData, FilePersistenceData, FileData, WatchmanClocks, DuplicatesIndex, ModuleMapItem, InternalHasteMap, SQLiteCache, DuplicatesSet} from './types';
import * as fastPath from './lib/fast_path';
import H from './constants';
import HasteFS from './HasteFS';
import SQLitePersistence from './persistence/SQLitePersistence';
import rimraf = require('rimraf');

export default class SQLHasteFS implements HasteFS {
  private readonly _rootDir: Config.Path;
  private readonly _cachePath: Config.Path;
  private _localCache: SQLiteCache;

  constructor(rootDir: Config.Path, cachePath: Config.Path, resetCache?: boolean) {
    this._rootDir = rootDir;
    this._cachePath = cachePath;
    if(resetCache) {
      rimraf.sync(cachePath);
    }
    this._localCache = {
      duplicates: SQLitePersistence.getAllDuplicates(cachePath),
      map: new Map(),
      mocks: new Map(),
      removedModules: new Map(),
      removedMocks: new Set(),
      mocksAreCleared: false, 
      mapIsCleared: false,
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
    // Files are already persisted on updateFileData, so only persist ModuleMap
    SQLitePersistence.writeModuleMapData(this._cachePath, this._localCache);
  }
  
  getClocks(): WatchmanClocks {
    return SQLitePersistence.getClocks(this._cachePath);
  }

  setClocks(clocks: WatchmanClocks): void {
    SQLitePersistence.setClocks(this._cachePath, clocks);
  }

  getAllDuplicates(): DuplicatesIndex {
    return this._localCache.duplicates;
  }

  getDuplicate(name: string): Map<string, DuplicatesSet> | undefined {
    return this._localCache.duplicates.get(name);
  }

  setDuplicate(name: string, dups: Map<string, DuplicatesSet>): void {
    this._localCache.duplicates.set(name, dups);
  }

  deleteDuplicate(name: string): void {
    this._localCache.duplicates.delete(name);
  }

  getFromModuleMap(moduleName: string): ModuleMapItem | undefined {
    const clearRemovedPlatforms = (moduleItem: ModuleMapItem | undefined) => {
      if(!moduleItem) {
        return undefined;
      }
      const removedPlatforms = this._localCache.removedModules.get(moduleName);
      if(removedPlatforms === true) {
        return undefined;
      } else if(removedPlatforms) {
        for(const removedPlatform of removedPlatforms) {
          delete moduleItem[removedPlatform];
        }
      }
      return moduleItem;
    }

    let moduleItem = this._localCache.map.get(moduleName);
    
    if(this._localCache.mapIsCleared) {
      return clearRemovedPlatforms(moduleItem);
    }

    moduleItem = moduleItem || SQLitePersistence.getFromModuleMap(this._cachePath, moduleName);
    return clearRemovedPlatforms(moduleItem);
  }

  setInModuleMap(moduleName: string, moduleMapItem: ModuleMapItem): void {
    this._localCache.removedModules.delete(moduleName);
    this._localCache.map.set(moduleName, moduleMapItem);
  }

  deleteFromModuleMap(moduleName: string, platform?: string | undefined): void {
    if(platform) {
      const currentRemovedPlatforms = this._localCache.removedModules.get(moduleName);
      if(currentRemovedPlatforms instanceof Set) {
        currentRemovedPlatforms.add(platform);
      }
      else {
        this._localCache.removedModules.set(moduleName, new Set([platform]));
      }

      if (this._localCache.map.get(moduleName)) {
        delete this._localCache.map.get(moduleName)![platform];

        if(Object.keys(this._localCache.map.get(moduleName)!).length === 0) {
          this._localCache.map.delete(moduleName);
        }
      }
    }
    else {
      // Remove all if platform is not specified
      this._localCache.removedModules.set(moduleName, true);
      this._localCache.map.delete(moduleName);
    }
  }

  deleteFromMocks(mockName: string): void {
    this._localCache.removedMocks.add(mockName);
    this._localCache.mocks.delete(mockName);
  }

  getMock(mockPath: string): string | undefined {
    // TODO: add undefined placeholder in cache
    let mock = this._localCache.mocks.get(mockPath);

    if (this._localCache.removedMocks.has(mockPath)) {
      return undefined;
    }

    if(this._localCache.mocksAreCleared) {
      return mock;
    }

    mock = mock || SQLitePersistence.getMock(this._cachePath, mockPath);
    return mock;
  }

  setMock(mockPath: string, relativeFilePath: string): void {
    this._localCache.removedMocks.delete(mockPath);
    this._localCache.mocks.set(mockPath, relativeFilePath);
  }

  clearModuleMap(): void {
    this._localCache.map = new Map();
    this._localCache.mapIsCleared = true;
  }

  clearMocks(): void {
    this._localCache.mocks = new Map();
    this._localCache.mocksAreCleared = true;
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

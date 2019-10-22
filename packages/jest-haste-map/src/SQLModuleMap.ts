import {Config} from '@jest/types';
import {
  HTypeValue,
  ModuleMetaData,
  RawModuleMap,
  ModuleMapItem,
} from './types';

import * as fastPath from './lib/fast_path';
import H from './constants';
import ModuleMap, { SerializableModuleMap } from './ModuleMap';
import SQLitePersistence from './persistence/SQLitePersistence';

const EMPTY_OBJ = {} as Record<string, any>;
const EMPTY_MAP = new Map();
const NON_EXISTENT_IN_SQL = "NON_EXISTENT_IN_SQL";

const sqlCaches: Map<string, RawModuleMap> = new Map();

export default class SQLModuleMap extends ModuleMap {
    private readonly _cachePath: Config.Path;
    private readonly _rootDir: Config.Path;
  
    constructor(rootDir: Config.Path, cachePath: Config.Path) {
      const emptyMap : RawModuleMap = {
        rootDir,
        duplicates: SQLitePersistence.getAllDuplicates(cachePath),
        map: new Map(),
        mocks: new Map(),
      };
      super(emptyMap);

      console.log(cachePath);
      
      this._rootDir = rootDir;
      this._cachePath = cachePath;
      console.log(sqlCaches.get(cachePath));

      sqlCaches.set(cachePath, emptyMap);
    }
  
    getModule (
      name: string,
      platform?: string | null,
      supportsNativePlatform?: boolean | null,
      type?: HTypeValue | null,
    ): Config.Path | null {
      if (type == null) {
        type = H.MODULE;
      }
  
      const moduleItem = this._getModuleMetadataFromSQL(name, platform, !!supportsNativePlatform);
      if (moduleItem && moduleItem[H.TYPE] === type) {
        const modulePath = moduleItem[H.PATH];
        return modulePath && fastPath.resolve(this._rootDir, modulePath);
      }
      return null;
    }
  
    getPackage(
      name: string,
      platform: string | null | undefined,
      _supportsNativePlatform: boolean | null,
    ): Config.Path | null {
      return this.getModule(name, platform, null, H.PACKAGE);
    }
  
    getMockModule(name: string): Config.Path | undefined {
      let mockPath = sqlCaches.get(this._cachePath)!.mocks.get(name);
      if(mockPath === NON_EXISTENT_IN_SQL) {
        return undefined;
      }

      if (!mockPath) {
        mockPath = SQLitePersistence.getMock(this._cachePath, name);
      }
      if (!mockPath) {
        mockPath = SQLitePersistence.getMock(this._cachePath, name + '/index');
      };

      sqlCaches.get(this._cachePath)!.mocks.set(name, mockPath || NON_EXISTENT_IN_SQL);
      return mockPath && fastPath.resolve(this._rootDir, mockPath);
    }
  
    toJSON(): SerializableModuleMap {
      console.log('test');
      return {
        duplicates: [],
        map: [],
        mocks: [],
        rootDir: this._rootDir,
        sqlDbPath: this._cachePath,
      }
    }
  
    private _getModuleMetadataFromSQL(
      name: string,
      platform: string | null | undefined,
      supportsNativePlatform: boolean
      ): ModuleMetaData | null {
      let map: ModuleMapItem;
      if(sqlCaches.get(this._cachePath)!.map.get(name)) {
        map = sqlCaches.get(this._cachePath)!.map.get(name) || EMPTY_OBJ;
      } else {
        // console.log('not in cache: ' + name);
        map = SQLitePersistence.getFromModuleMap(this._cachePath, name) || EMPTY_OBJ;
        sqlCaches.get(this._cachePath)!.map.set(name, map);
      }
      const dupMap = sqlCaches.get(this._cachePath)!.duplicates.get(name) || EMPTY_MAP;
  
      if (platform != null) {
        super._assertNoDuplicates(
          name,
          platform,
          supportsNativePlatform,
          dupMap.get(platform),
        );
        if (map[platform] != null) {
          return map[platform];
        }
      }
      if (supportsNativePlatform) {
        super._assertNoDuplicates(
          name,
          H.NATIVE_PLATFORM,
          supportsNativePlatform,
          dupMap.get(H.NATIVE_PLATFORM),
        );
        if (map[H.NATIVE_PLATFORM]) {
          return map[H.NATIVE_PLATFORM];
        }
      }
      super._assertNoDuplicates(
        name,
        H.GENERIC_PLATFORM,
        supportsNativePlatform,
        dupMap.get(H.GENERIC_PLATFORM),
      );
      if (map[H.GENERIC_PLATFORM]) {
        return map[H.GENERIC_PLATFORM];
      }
      return null;
    }
  
  }
  
import * as path from 'path';
import rimraf from 'rimraf';
import * as fs from 'fs';
import {tmpdir} from 'os';
import SQLitePersistence from '../persistence/SQLitePersistence';

const testDirectory = path.resolve(tmpdir(), 'jest-index-sql-test');
const cacheFilePath = path.resolve(testDirectory, 'project');

describe('SQLitePersistence', () => {
  beforeEach(() => {
    //Clear db
    rimraf.sync(testDirectory);
    fs.mkdirSync(testDirectory);
  });

  it('findFilePathsBasedOnPattern', () => {
    SQLitePersistence.setFileMetadata(cacheFilePath, 'randomTestFile', [
      '',
      0,
      0,
      0,
      '',
      '',
    ]);

    const filesFound = SQLitePersistence.findFilePathsBasedOnPattern(
      cacheFilePath,
      'testFile$',
    );

    expect(filesFound).toEqual(['randomTestFile']);
  });
});

import {Persistence} from '../types';

// Try to load SQLite persistence, but fall back to file persistence when SQLite
// is not available.

export default function getPersistence(useSQLite: boolean) {
  let chosenModule: Persistence;
  if (useSQLite) {
    try {
      require.resolve('better-sqlite3');
      chosenModule = require('./SQLitePersistence').default;
    } catch {
      throw new Error("better-sqlite3 is required for SQL mode");
    }
  }
  else {
    chosenModule = require('./FilePersistence').default;
  }

  return chosenModule;
}
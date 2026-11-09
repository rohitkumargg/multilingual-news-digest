// Mock database for testing route handlers without touching any real database
export const mockState = {
  rateLimitCount: 1,
  existingUsers: [],
  insertedUsers: [],
  userExists: true,
  existingSavedArticles: [],
  savedArticleCount: 0,
  insertSavedArticleResult: [{ savedAt: new Date('2026-10-23T12:00:00Z') }],
  deleteResult: [{ id: 'saved-1' }],
  throwError: null,
  userStreakRows: [],
  profileStreakRows: [],
  savedArticleRows: [],
  lastQueries: [],
};

export function resetMockState() {
  mockState.rateLimitCount = 1;
  mockState.existingUsers = [];
  mockState.insertedUsers = [];
  mockState.userExists = true;
  mockState.existingSavedArticles = [];
  mockState.savedArticleCount = 0;
  mockState.insertSavedArticleResult = [{ savedAt: new Date('2026-10-23T12:00:00Z') }];
  mockState.deleteResult = [{ id: 'saved-1' }];
  mockState.throwError = null;
  mockState.userStreakRows = [];
  mockState.profileStreakRows = [];
  mockState.savedArticleRows = [];
  mockState.lastQueries = [];
}

function getTableName(table) {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table[Symbol.for('drizzle:Name')] || table.name || '';
}

export const db = {
  insert(table) {
    if (mockState.throwError) throw mockState.throwError;
    return {
      values(vals) {
        if (vals && vals.email) {
          mockState.insertedUsers.push(vals);
        }
        mockState.lastQueries.push({ type: 'insert', table: getTableName(table), values: vals });
        return {
          onConflictDoUpdate(opts) {
            return {
              returning(ret) {
                return Promise.resolve([{ count: mockState.rateLimitCount }]);
              },
            };
          },
          onConflictDoNothing(opts) {
            return {
              returning(ret) {
                return Promise.resolve(mockState.insertSavedArticleResult);
              },
              then(resolve, reject) {
                return Promise.resolve([]).then(resolve, reject);
              },
            };
          },
          then(resolve, reject) {
            return Promise.resolve([{ id: 'new-user-id' }]).then(resolve, reject);
          },
        };
      },
    };
  },

  select(fields) {
    if (mockState.throwError) throw mockState.throwError;
    return {
      from(table) {
        const tableName = getTableName(table);
        return {
          where(condition) {
            mockState.lastQueries.push({ type: 'select', table: tableName, fields, condition });
            return {
              orderBy(...orderArgs) {
                return {
                  limit(lim) {
                    return {
                      offset(off) {
                        mockState.lastQueries.push({
                          type: 'select.pagination',
                          table: tableName,
                          limit: lim,
                          offset: off,
                          condition,
                        });
                        return Promise.resolve(mockState.savedArticleRows);
                      },
                    };
                  },
                };
              },
              limit(n) {
                if (tableName === 'user_streaks') {
                  return Promise.resolve(mockState.profileStreakRows);
                }
                return Promise.resolve(mockState.existingUsers);
              },
              then(resolve, reject) {
                return Promise.resolve([{ value: mockState.savedArticleCount }]).then(resolve, reject);
              },
            };
          },
        };
      },
    };
  },

  delete(table) {
    if (mockState.throwError) throw mockState.throwError;
    return {
      where(condition) {
        mockState.lastQueries.push({ type: 'delete', table: getTableName(table), condition });
        return {
          returning(ret) {
            return Promise.resolve(mockState.deleteResult);
          },
        };
      },
    };
  },

  async transaction(fn) {
    if (mockState.throwError) throw mockState.throwError;
    const tx = {
      select(fields) {
        return {
          from(table) {
            const tableName = getTableName(table);
            return {
              where(cond) {
                mockState.lastQueries.push({ type: 'tx.select', table: tableName, cond });
                return {
                  for(lock) {
                    if (tableName === 'user_streaks') {
                      return Promise.resolve(mockState.userStreakRows);
                    }
                    if (mockState.userExists) {
                      return Promise.resolve([{ id: 'usr-1' }]);
                    }
                    return Promise.resolve([]);
                  },
                  limit(n) {
                    return Promise.resolve(mockState.existingSavedArticles);
                  },
                  then(resolve, reject) {
                    return Promise.resolve([{ value: mockState.savedArticleCount }]).then(resolve, reject);
                  },
                };
              },
            };
          },
        };
      },
      insert(table) {
        return {
          values(vals) {
            mockState.lastQueries.push({ type: 'tx.insert', table: getTableName(table), vals });
            return {
              onConflictDoNothing(opts) {
                return {
                  returning(ret) {
                    return Promise.resolve(mockState.insertSavedArticleResult);
                  },
                };
              },
            };
          },
        };
      },
      update(table) {
        return {
          set(vals) {
            mockState.lastQueries.push({ type: 'tx.update', table: getTableName(table), set: vals });
            return {
              where(cond) {
                mockState.lastQueries.push({ type: 'tx.update.where', table: getTableName(table), cond });
                return Promise.resolve([{ id: 'updated' }]);
              },
            };
          },
        };
      },
    };
    return await fn(tx);
  },
};

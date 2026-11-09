import assert from 'node:assert/strict';

/**
 * MND — Concurrency and Boundary Simulation for 500-Article Limit
 *
 * This test models the PostgreSQL transaction semantics implemented in
 * app/api/user/saved/route.js:
 * 1. Lock on user's row in users table via SELECT ... FOR UPDATE (serialized per user)
 * 2. Idempotent check for already-saved article
 * 3. Count check against MAX_SAVED_ARTICLES_PER_USER (500)
 * 4. Insertion with unique constraint ON CONFLICT DO NOTHING
 */

class MockPostgresDatabase {
  constructor() {
    this.savedArticles = new Map(); // key: `${userId}:${stableId}`, value: article
    this.userLocks = new Map(); // userId -> Promise chain for simulating row lock
  }

  // Acquire row-level lock on user (serializes transactions for that user)
  async lockUser(userId) {
    let unlock;
    const nextLock = new Promise((resolve) => {
      unlock = resolve;
    });
    const currentLock = this.userLocks.get(userId) || Promise.resolve();
    this.userLocks.set(userId, nextLock);
    await currentLock;
    return unlock;
  }

  async executeSaveTransaction(userId, article) {
    const unlock = await this.lockUser(userId);
    try {
      // Simulate small DB I/O delay inside the transaction
      await new Promise((r) => setTimeout(r, 5));

      const key = `${userId}:${article.stableId}`;

      // 5b. Check if already saved
      if (this.savedArticles.has(key)) {
        return { status: 200, data: { success: true, alreadySaved: true } };
      }

      // 5c. Count existing
      let userCount = 0;
      for (const [k] of this.savedArticles.entries()) {
        if (k.startsWith(`${userId}:`)) userCount++;
      }

      if (userCount >= 500) {
        return {
          status: 400,
          data: {
            success: false,
            error: 'Maximum limit of 500 saved articles reached. Remove older saved articles to bookmark new ones.',
          },
        };
      }

      // 5d. Insert
      this.savedArticles.set(key, { ...article, userId, savedAt: new Date().toISOString() });
      return { status: 201, data: { success: true, savedAt: new Date().toISOString() } };
    } finally {
      unlock();
    }
  }

  getUserCount(userId) {
    let count = 0;
    for (const [k] of this.savedArticles.entries()) {
      if (k.startsWith(`${userId}:`)) count++;
    }
    return count;
  }
}

async function runBoundaryTests() {
  console.log('=== MND 500-Article Limit Boundary & Concurrency Tests ===\n');

  // Scenario 1: 499 saved articles + one new article => 500
  {
    const db = new MockPostgresDatabase();
    const userId = 'user-1';
    for (let i = 0; i < 499; i++) {
      db.savedArticles.set(`${userId}:art-${i}`, { title: `Art ${i}` });
    }
    assert.equal(db.getUserCount(userId), 499);

    const res = await db.executeSaveTransaction(userId, { stableId: 'art-new-1' });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(db.getUserCount(userId), 500);
    console.log('✓ Scenario 1 Passed: 499 saved articles + 1 new article => successfully reaches 500');
  }

  // Scenario 2: 500 saved articles + one new article => rejected (400)
  {
    const db = new MockPostgresDatabase();
    const userId = 'user-2';
    for (let i = 0; i < 500; i++) {
      db.savedArticles.set(`${userId}:art-${i}`, { title: `Art ${i}` });
    }
    assert.equal(db.getUserCount(userId), 500);

    const res = await db.executeSaveTransaction(userId, { stableId: 'art-new-2' });
    assert.equal(res.status, 400);
    assert.equal(res.data.success, false);
    assert.match(res.data.error, /Maximum limit of 500 saved articles reached/);
    assert.equal(db.getUserCount(userId), 500);
    console.log('✓ Scenario 2 Passed: 500 saved articles + 1 new article => rejected with 400 limit error');
  }

  // Scenario 3: 500 saved articles + duplicate existing article => remains 500 & returns alreadySaved: true
  {
    const db = new MockPostgresDatabase();
    const userId = 'user-3';
    for (let i = 0; i < 500; i++) {
      db.savedArticles.set(`${userId}:art-${i}`, { title: `Art ${i}` });
    }
    assert.equal(db.getUserCount(userId), 500);

    // Save article that already exists at index 42
    const res = await db.executeSaveTransaction(userId, { stableId: 'art-42' });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.alreadySaved, true);
    assert.equal(db.getUserCount(userId), 500);
    console.log('✓ Scenario 3 Passed: 500 saved articles + duplicate save => returns 200 alreadySaved, count remains 500');
  }

  // Scenario 4: Two concurrent requests for DIFFERENT articles starting at 499 => exactly 500 saved (no overfill)
  {
    const db = new MockPostgresDatabase();
    const userId = 'user-4';
    for (let i = 0; i < 499; i++) {
      db.savedArticles.set(`${userId}:art-${i}`, { title: `Art ${i}` });
    }
    assert.equal(db.getUserCount(userId), 499);

    // Launch both concurrently
    const [resA, resB] = await Promise.all([
      db.executeSaveTransaction(userId, { stableId: 'art-concurrent-A' }),
      db.executeSaveTransaction(userId, { stableId: 'art-concurrent-B' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [201, 400], 'One request must succeed (201) and the other must be rejected (400)');
    assert.equal(db.getUserCount(userId), 500, 'Total count must never exceed 500');
    console.log('✓ Scenario 4 Passed: 2 concurrent requests starting at 499 => serialized, exactly 1 succeeds, 1 rejected, count stays at 500');
  }

  // Scenario 5: Two concurrent requests for the SAME article starting at 499 => exactly 500 saved, no duplicate rows
  {
    const db = new MockPostgresDatabase();
    const userId = 'user-5';
    for (let i = 0; i < 499; i++) {
      db.savedArticles.set(`${userId}:art-${i}`, { title: `Art ${i}` });
    }
    assert.equal(db.getUserCount(userId), 499);

    const [resA, resB] = await Promise.all([
      db.executeSaveTransaction(userId, { stableId: 'art-same-A' }),
      db.executeSaveTransaction(userId, { stableId: 'art-same-A' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 201], 'One request inserts (201) and the second returns alreadySaved (200)');
    assert.equal(db.getUserCount(userId), 500, 'Count reaches 500 with no duplicate rows');
    console.log('✓ Scenario 5 Passed: 2 concurrent requests for same article => no duplicate rows, 1 inserted, 1 alreadySaved');
  }

  console.log('\n=== All 5 Boundary & Concurrency Scenarios Passed Perfectly! ===');
}

runBoundaryTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});

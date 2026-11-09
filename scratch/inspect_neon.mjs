process.loadEnvFile('.env.local');
import { Pool } from '@neondatabase/serverless';

async function inspectDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // 1. List all tables in public schema
    const tablesRes = await pool.query(`
      SELECT table_schema, table_name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);
    console.log('Tables found in non-system schemas:', tablesRes.rows.length);
    tablesRes.rows.forEach(r => console.log(' - ' + r.table_schema + '.' + r.table_name + ' (' + r.table_type + ')'));

    // 2. Check for drizzle migrations table
    const drizzleRes = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name LIKE '%drizzle%';
    `);
    console.log('Drizzle tracking tables found:', drizzleRes.rows.length);
    drizzleRes.rows.forEach(r => console.log(' - ' + r.table_schema + '.' + r.table_name));

    if (drizzleRes.rows.length > 0) {
      const migSchema = drizzleRes.rows[0].table_schema;
      const migTable = drizzleRes.rows[0].table_name;
      const migs = await pool.query(`SELECT * FROM "${migSchema}"."${migTable}"`);
      console.log('Applied migration rows:', migs.rows.length);
      migs.rows.forEach(m => console.log('   Migration:', m));
    }
  } catch (err) {
    console.error('Query error:', err.message);
  } finally {
    await pool.end();
  }
}

inspectDb();

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, registration_rate_limit } from '@/lib/schema';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REGISTRATIONS_PER_HOUR = 5;

function getClientIpHash(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const rawIp = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || '127.0.0.1');
  return crypto.createHash('sha256').update(rawIp).digest('hex');
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { email: rawEmail, password: rawPassword } = body || {};

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || email.length > 255) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    if (rawPassword.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password must not exceed 128 characters' },
        { status: 400 }
      );
    }

    // Atomic rate limiting check (Approved Decision B: Max 5 registrations/hour per IP)
    // Uses PostgreSQL single atomic upsert with exclusive row-level locking on conflict.
    const ipHash = getClientIpHash(request);

    const [rateLimitRecord] = await db
      .insert(registration_rate_limit)
      .values({
        ip_hash: ipHash,
        registration_count: 1,
        window_start: sql`now()`,
      })
      .onConflictDoUpdate({
        target: registration_rate_limit.ip_hash,
        set: {
          registration_count: sql`CASE
            WHEN registration_rate_limit.window_start < now() - interval '1 hour' THEN 1
            WHEN registration_rate_limit.registration_count <= ${MAX_REGISTRATIONS_PER_HOUR} THEN registration_rate_limit.registration_count + 1
            ELSE registration_rate_limit.registration_count
          END`,
          window_start: sql`CASE
            WHEN registration_rate_limit.window_start < now() - interval '1 hour' THEN now()
            ELSE registration_rate_limit.window_start
          END`,
        },
      })
      .returning({
        count: registration_rate_limit.registration_count,
      });

    if (rateLimitRecord && rateLimitRecord.count > MAX_REGISTRATIONS_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: 'Too many registrations from this IP address. Maximum 5 per hour.' },
        { status: 429 }
      );
    }

    // Check email uniqueness
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    // Hash password (12 rounds) and insert user
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    await db.insert(users).values({
      email,
      password_hash: passwordHash,
    });

    return NextResponse.json(
      { success: true, message: 'Account created.' },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Register API] Error creating user:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create account. Please try again later.' },
      { status: 500 }
    );
  }
}

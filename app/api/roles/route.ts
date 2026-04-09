import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { Role } from '@/lib/types';

export async function GET() {
  const roles = queryAll<Role>(
    'SELECT * FROM roles ORDER BY "set", team, night_wake_order, name',
  );
  return NextResponse.json(roles);
}

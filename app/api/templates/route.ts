import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type { RoleTemplate } from '@/lib/types';

// GET /api/templates — List all templates
export async function GET() {
  const templates = queryAll<RoleTemplate>(
    'SELECT * FROM role_templates ORDER BY created_at DESC',
  );
  return NextResponse.json(templates);
}

// POST /api/templates — Save a new template
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, playerCount, roles } = body as {
    name?: string;
    playerCount?: number;
    roles?: { roleId: number; roleName: string; count: number }[];
  };

  if (!name || !playerCount || !roles || roles.length === 0) {
    return NextResponse.json(
      { error: 'Name, playerCount, and roles are required' },
      { status: 400 },
    );
  }

  const result = run(
    'INSERT INTO role_templates (name, player_count, roles_json) VALUES (?, ?, ?)',
    name,
    playerCount,
    JSON.stringify(roles),
  );

  return NextResponse.json({
    id: result.lastInsertRowid,
    name,
    playerCount,
  });
}

// DELETE /api/templates?id=N — Delete a template
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
  }
  run('DELETE FROM role_templates WHERE id = ?', parseInt(id));
  return NextResponse.json({ success: true });
}

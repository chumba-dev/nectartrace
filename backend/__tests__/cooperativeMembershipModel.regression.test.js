const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(
  backendRoot,
  'prisma',
  'migrations',
  '20261124150000_cooperative_membership_notifications',
  'migration.sql'
), 'utf8');

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Missing ${name} model`);
  return match[1];
}

test('cooperative applications, memberships, and notifications expose the required enums', () => {
  expect(schema).toMatch(/enum CooperativeApplicationStatus \{\s+PENDING\s+APPROVED\s+REJECTED\s+\}/);
  expect(schema).toMatch(/enum CooperativeMemberRole \{\s+OWNER\s+MANAGER\s+STAFF\s+\}/);
  for (const type of [
    'COOPERATIVE_APPLICATION_SUBMITTED',
    'COOPERATIVE_APPLICATION_APPROVED',
    'COOPERATIVE_APPLICATION_REJECTED',
    'HARVEST_OFFER_SUBMITTED',
    'ORDER_CREATED',
  ]) {
    expect(schema).toContain(type);
  }
});

test('membership is unique per user and notification recipients are ownership-indexed', () => {
  const membership = modelBlock('CooperativeMembership');
  const notification = modelBlock('Notification');
  const recipient = modelBlock('NotificationRecipient');

  expect(membership).toMatch(/userId\s+Int\s+@unique/);
  expect(membership).toContain('@@unique([cooperativeId, userId])');
  expect(membership).toContain('@@index([cooperativeId, isActive, role])');
  expect(notification).toContain('@@unique([type, entityType, entityId])');
  expect(recipient).toContain('@@unique([notificationId, userId])');
  expect(recipient).toContain('@@index([userId, readAt, createdAt])');
});

test('migration deterministically chooses the lowest-id active owner without changing global roles', () => {
  expect(migration).toContain('FROM "User" AS staff');
  expect(migration).toContain('staff."role" = \'COOPERATIVE_STAFF\'');
  expect(migration).toMatch(/MIN\(staff\."id"\) FILTER \(WHERE staff\."isActive"\)/);
  expect(migration).toContain('OVER (PARTITION BY staff."cooperativeId")');
  expect(migration).toContain("THEN 'OWNER'::\"CooperativeMemberRole\"");
  expect(migration).toContain("ELSE 'STAFF'::\"CooperativeMemberRole\"");
  expect(migration).toContain('ORDER BY staff."cooperativeId", staff."id"');
  expect(migration).not.toMatch(/UPDATE\s+"User"[\s\S]*SET\s+"role"/i);
});

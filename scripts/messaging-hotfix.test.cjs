const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, process, console,
    require: (name) => name in mocks ? mocks[name] : name === 'zod' ? require('zod') : {},
  }, { filename: file });
  return module.exports;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const dancerId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function setup({ manage = true, enabled = true, claimed = true, project = true, memberError = false } = {}) {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    const result = table === 'projects' ? { data: project ? { id: projectId } : null }
      : table === 'dancers' ? { data: { id: dancerId, profile_id: claimed ? userId : null } }
      : table === 'chat_rooms' ? { data: { id: 'existing-room', archived_at: null } }
      : { data: null, error: memberError ? { message: 'failed' } : null };
    const chain = new Proxy({}, { get: (_, key) => key === 'then'
      ? (resolve) => Promise.resolve(result).then(resolve)
      : () => chain });
    return chain;
  } };
  const rooms = load('src/lib/messaging/rooms.ts', { '@/lib/supabase/admin': { createAdminClient: () => client } });
  const actions = load('src/app/actions/staff-messages.ts', {
    '@/lib/auth/guard': { requireUser: async () => ({ id: userId }) },
    '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/messaging/access': { assertProjectManageAccess: async () => manage },
    '@/lib/messaging/flags': { messagingEnabled: () => enabled },
    '@/lib/messaging/rooms': rooms,
  });
  return { actions, calls };
}

for (const role of ['administrator', 'project owner', 'co-manager']) {
  test(`${role} can open a claimed non-applicant profile using the project gate`, async () => {
    const { actions, calls } = setup();
    const r = await actions.openDancerThreadAction({ projectId, dancerId });
    assert.equal(r.ok, true);
    assert.equal(r.data.roomId, 'existing-room');
    assert.equal(calls.includes('applications'), false);
    assert.ok(calls.includes('chat_room_members'));
  });
}
test('unrelated user is denied before privileged recipient reads or writes', async () => {
  const { actions, calls } = setup({ manage: false });
  assert.equal((await actions.openDancerThreadAction({ projectId, dancerId })).ok, false);
  assert.equal(calls.length, 0);
});
for (const [name, options] of [['unclaimed profile', { claimed: false }], ['deleted project', { project: false }], ['feature flag off', { enabled: false }]]) {
  test(`${name} cannot create a room`, async () => {
    const { actions, calls } = setup(options);
    assert.equal((await actions.openDancerThreadAction({ projectId, dancerId })).ok, false);
    assert.equal(calls.includes('chat_rooms'), false);
  });
}
test('invalid ids fail before database access', async () => {
  const { actions, calls } = setup();
  assert.equal((await actions.openDancerThreadAction({ projectId: 'bad', dancerId })).ok, false);
  assert.equal(calls.length, 0);
});
test('membership write failure is surfaced instead of claiming the conversation is usable', async () => {
  const { actions } = setup({ memberError: true });
  assert.equal((await actions.openDancerThreadAction({ projectId, dancerId })).ok, false);
});

test('project picker scopes a co-manager to their memberships and owned projects', async () => {
  const filters = [];
  const client = { from(table) {
    const result = table === 'project_managers' ? { data: [{ project_id: projectId }], error: null } : { data: [{ id: projectId, title: 'Project' }], error: null };
    const chain = new Proxy({}, { get: (_, method) => method === 'then' ? (resolve) => Promise.resolve(result).then(resolve)
      : (...args) => { filters.push([table, method, ...args]); return chain; } });
    return chain;
  } };
  const { listMessageProjects } = load('src/lib/messaging/project-options.ts', { '@/lib/supabase/admin': { createAdminClient: () => client } });
  await listMessageProjects({ id: userId, is_admin: false });
  assert.ok(filters.some((f) => f[0] === 'project_managers' && f[1] === 'eq' && f[2] === 'profile_id' && f[3] === userId));
  assert.ok(filters.some((f) => f[1] === 'or' && f[2] === `owner_id.eq.${userId},id.in.(${projectId})`));
});

for (const allowed of [true, false]) {
  test(`private project context uses only RLS-authorized room ids (authorized=${allowed})`, async () => {
    const queriedIds = [];
    function clientFor(admin) {
      return { from(table) {
        const result = { data: admin ? [{ id: projectId, title: 'Private conversation context', status: 'open' }]
          : table === 'dancers' ? [{ id: dancerId }]
          : table === 'dancer_managers' ? []
          : table === 'chat_room_members' ? allowed ? [{ room_id: 'room', last_read_seq: 0, muted_until: null,
            room: { id: 'room', project_id: projectId, last_seq: 1, archived_at: null, closed_at: null, project: null } }] : []
          : { body: 'message', kind: 'text' } };
        const chain = new Proxy({}, { get: (_, method) => method === 'then' ? (resolve) => Promise.resolve(result).then(resolve)
          : (...args) => { if (admin && method === 'in') queriedIds.push(...args[1]); return chain; } });
        return chain;
      } };
    }
    const { listMemberInboxRooms } = load('src/lib/messaging/inbox-query.ts', {
      '@/lib/supabase/admin': { createAdminClient: () => clientFor(true) },
      './types': { previewText: (s) => s },
    });
    const rooms = await listMemberInboxRooms(clientFor(false), userId);
    assert.deepEqual(queriedIds, allowed ? [projectId] : []);
    assert.equal(rooms.length, allowed ? 1 : 0);
    if (allowed) assert.equal(rooms[0].projectTitle, 'Private conversation context');
  });
}

// 本地访客好友关系。身份沿用房间中的 profileId；不提供公网账号认证。
const text = value => String(value || '').trim();
const error = (status, code) => ({status, payload: {error: code}});

export function createFriendsApi(api, persist = () => {}) {
  api.friends ||= [];
  api.friendRequests ||= [];

  function identity(input) {
    const provider = text(input.provider) || 'local';
    const providerUserId = text(input.providerUserId);
    const profileId = text(input.profileId) || providerUserId, clientId = text(input.clientId);
    if (!profileId || !clientId || profileId.length > 128 || clientId.length > 128) return null;
    let repaired = false;
    for (const q of api.questions) {
      if (q.creatorClientId === clientId && !q.creatorProfileId) {
        q.creatorProfileId = profileId; repaired = true;
      }
      // 老版曾把提问者写入 responder 字段，不把这条记录视为第二个人。
      if (q.responderClientId === clientId && q.responderClientId !== q.creatorClientId && !q.responderProfileId) {
        q.responderProfileId = profileId; repaired = true;
      }
    }
    for (const t of api.topics) for (const p of t.participants || []) {
      if (p.clientId === clientId && !p.profileId) {p.profileId = profileId; repaired = true;}
    }
    if (repaired) persist();
    return {profileId, clientId, provider, providerUserId: providerUserId || profileId};
  }

  function roomMembers(roomId) {
    const q = api.questions.find(q => q.roomId === roomId);
    if (!q) return [];
    const people = new Map();
    function add(profileId, name, type) {
      if (text(profileId) && !people.has(profileId)) people.set(profileId, {profileId, name: text(name) || type, type, roomId});
    }
    add(q.creatorProfileId, q.name, '提问者');
    if (q.responderClientId !== q.creatorClientId && q.responderProfileId !== q.creatorProfileId) {
      add(q.responderProfileId, q.responderName, '解决者');
    }
    const topic = api.topics.find(t => t.roomId === roomId);
    for (const p of topic?.participants || []) {
      if (p.clientId === q.creatorClientId || p.clientId === q.responderClientId) continue;
      add(p.profileId, p.name, '社群好友');
    }
    return [...people.values()];
  }

  function getState(input) {
    const who = identity(input);
    if (!who) return error(400, 'identity_required');
    const {profileId} = who, roomId = text(input.roomId);
    const members = roomMembers(roomId);
    const friends = api.friends.filter(f => f.ownerProfileId === profileId)
      .map(({id, profileId, name, type, sourceType, roomId, provider, providerUserId}) => ({id, profileId, name, type, sourceType, roomId, provider: provider || 'local', providerUserId: providerUserId || profileId}));
    const pending = api.friendRequests.filter(r => r.status === 'pending');
    return {status: 200, payload: {
      friends,
      incoming: pending.filter(r => r.toProfileId === profileId).map(r => ({id: r.id, profileId: r.fromProfileId, name: r.fromName, type: r.fromType, roomId: r.roomId})),
      outgoing: pending.filter(r => r.fromProfileId === profileId).map(r => ({id: r.id, profileId: r.toProfileId, name: r.toName, type: r.toType, roomId: r.roomId})),
      peers: members.some(m => m.profileId === profileId) ? members.filter(m => m.profileId !== profileId) : []
    }};
  }

  function request(input) {
    const who = identity(input);
    if (!who) return error(400, 'identity_required');
    const targetProfileId = text(input.targetProfileId), roomId = text(input.roomId);
    if (!targetProfileId || !roomId) return error(400, 'room_and_target_required');
    if (targetProfileId === who.profileId) return error(400, 'cannot_add_self');
    const members = roomMembers(roomId), from = members.find(m => m.profileId === who.profileId), to = members.find(m => m.profileId === targetProfileId);
    if (!from || !to) return error(403, 'shared_room_required');
    if (api.friends.some(f => f.ownerProfileId === who.profileId && f.profileId === targetProfileId)) return error(409, 'already_friends');
    const previous = api.friendRequests.find(r => r.status === 'pending' && ((r.fromProfileId === who.profileId && r.toProfileId === targetProfileId) || (r.toProfileId === who.profileId && r.fromProfileId === targetProfileId)));
    if (previous) return error(409, previous.toProfileId === who.profileId ? 'request_received' : 'request_pending');
    const item = {id: crypto.randomUUID(), roomId, fromProfileId: from.profileId, toProfileId: to.profileId, fromName: from.name, toName: to.name, fromType: from.type, toType: to.type, fromProvider: who.provider, fromProviderUserId: who.providerUserId, toProvider: 'local', toProviderUserId: to.profileId, status: 'pending', createdAt: Date.now()};
    api.friendRequests.push(item);
    return {status: 201, payload: {request: {id: item.id, status: item.status}}};
  }

  function respond(input) {
    const who = identity(input);
    if (!who) return error(400, 'identity_required');
    if (typeof input.accept !== 'boolean') return error(400, 'accept_boolean_required');
    const item = api.friendRequests.find(r => r.id === text(input.requestId));
    if (!item) return error(404, 'request_not_found');
    if (item.toProfileId !== who.profileId) return error(403, 'recipient_required');
    if (item.status !== 'pending') return error(409, 'request_already_handled');
    item.status = input.accept ? 'accepted' : 'rejected'; item.respondedAt = Date.now();
    if (input.accept) {
      for (const [ownerProfileId, profileId, name, type, provider, providerUserId] of [[item.fromProfileId, item.toProfileId, item.toName, item.toType, item.toProvider, item.toProviderUserId], [item.toProfileId, item.fromProfileId, item.fromName, item.fromType, item.fromProvider, item.fromProviderUserId]]) {
        if (!api.friends.some(f => f.ownerProfileId === ownerProfileId && f.profileId === profileId)) api.friends.push({id: crypto.randomUUID(), ownerProfileId, profileId, name, type, sourceType: type, provider: provider || 'local', providerUserId: providerUserId || profileId, roomId: item.roomId, requestId: item.id, createdAt: Date.now()});
      }
    }
    return {status: 200, payload: {ok: true, status: item.status}};
  }
  function remove(input, friendId) {
    const who = identity(input);
    if (!who) return error(400, 'identity_required');
    const id = text(friendId);
    const friend = api.friends.find(f => f.id === id && f.ownerProfileId === who.profileId);
    if (!friend) return error(404, 'friend_not_found');
    const otherProfileId = friend.profileId;
    api.friends = api.friends.filter(f => !((f.ownerProfileId === who.profileId && f.profileId === otherProfileId) || (f.ownerProfileId === otherProfileId && f.profileId === who.profileId)));
    return {status: 200, payload: {ok: true, removedProfileId: otherProfileId}};
  }
  return {getState, request, respond, remove};
}

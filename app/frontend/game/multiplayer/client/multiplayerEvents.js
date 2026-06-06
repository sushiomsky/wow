export const CLIENT_EVENTS = Object.freeze({
    JOIN_PAIR: 'join_pair',
    JOIN_PRIVATE_PAIR: 'join_private_pair',
    REFRESH_OPEN_GAMES: 'refresh_open_games',
    INPUT: 'input',
    // Battle Royale modes
    JOIN_ENDLESS_BR: 'join_endless_br',
    JOIN_SITNGO_BR: 'join_sitngo_br',
    JOIN_TEAM_ENDLESS_BR: 'join_team_endless_br',
    JOIN_TEAM_SITNGO_BR: 'join_team_sitngo_br',
});

export const SERVER_EVENTS = Object.freeze({
    CONNECTED: 'connected',
    INIT: 'init',
    STATE: 'state',
    WAITING_FOR_PARTNER: 'waiting_for_partner',
    PRIVATE_PAIR_CREATED: 'private_pair_created',
    JOIN_ERROR: 'join_error',
    OPEN_GAMES: 'open_games',
    // Battle Royale: Cross-dungeon events
    PLAYER_LEFT_VIA_TUNNEL: 'player_left_via_tunnel',
    PLAYER_ARRIVED_VIA_TUNNEL: 'player_arrived_via_tunnel',
    // Battle Royale: Queue status
    SITNGO_QUEUE_STATUS: 'sitngo_queue_status',
    TEAM_QUEUE_STATUS: 'team_queue_status',
    MATCH_STARTING: 'match_starting',
    // Match lifecycle
    MATCH_END: 'match_end',
});

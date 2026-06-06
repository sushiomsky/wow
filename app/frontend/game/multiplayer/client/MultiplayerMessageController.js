import { SERVER_EVENTS } from './multiplayerEvents.js';

export class MultiplayerMessageController {
    constructor({
        effectsController,
    }) {
        this.effectsController = effectsController;
    }

    handle(msg) {
        switch (msg.type) {
            case SERVER_EVENTS.CONNECTED:
                this.effectsController.handleConnected(msg);
                break;

            case SERVER_EVENTS.WAITING_FOR_PARTNER:
                this.effectsController.handleWaitingForPartner();
                break;

            case SERVER_EVENTS.PRIVATE_PAIR_CREATED:
                this.effectsController.handlePrivatePairCreated(msg);
                break;

            case SERVER_EVENTS.JOIN_ERROR:
                this.effectsController.handleJoinError(msg);
                break;

            case SERVER_EVENTS.OPEN_GAMES:
                this.effectsController.handleOpenGames(msg);
                break;

            case SERVER_EVENTS.INIT:
                this.effectsController.handleInit(msg);
                break;

            case SERVER_EVENTS.STATE:
                this.effectsController.handleState(msg);
                break;

            case SERVER_EVENTS.MATCH_STARTING:
                this.effectsController.handleMatchStarting(msg);
                break;
            
            // Battle Royale: Cross-dungeon events
            case SERVER_EVENTS.PLAYER_LEFT_VIA_TUNNEL:
                this.effectsController.handlePlayerLeftViaTunnel(msg);
                break;
            
            case SERVER_EVENTS.PLAYER_ARRIVED_VIA_TUNNEL:
                this.effectsController.handlePlayerArrivedViaTunnel(msg);
                break;

            case SERVER_EVENTS.MATCH_END:
                this.effectsController.handleMatchEnd(msg);
                break;
        }
    }
}

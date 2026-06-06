/**
 * DungeonGraph - Manages connections between dungeons
 * 
 * Tracks which dungeons are connected via tunnels and provides
 * graph operations for the battle royale mode.
 */
'use strict';

class DungeonGraph {
    constructor() {
        // Map<dungeonId, Set<dungeonId>> - adjacency list
        this.adjacency = new Map();
    }
    
    /**
     * Add a dungeon to the graph (no connections yet)
     */
    addDungeon(dungeonId) {
        if (!this.adjacency.has(dungeonId)) {
            this.adjacency.set(dungeonId, new Set());
            console.log(`[DungeonGraph] Added dungeon ${dungeonId}`);
        }
    }
    
    /**
     * Remove a dungeon from the graph
     */
    removeDungeon(dungeonId) {
        // Remove all connections TO this dungeon
        for (const [id, neighbors] of this.adjacency.entries()) {
            neighbors.delete(dungeonId);
        }
        
        // Remove the dungeon itself
        this.adjacency.delete(dungeonId);
        console.log(`[DungeonGraph] Removed dungeon ${dungeonId}`);
    }
    
    /**
     * Create bidirectional connection between two dungeons
     */
    connect(dungeonA, dungeonB) {
        if (!this.adjacency.has(dungeonA) || !this.adjacency.has(dungeonB)) {
            console.warn(`[DungeonGraph] Cannot connect - dungeon not in graph`);
            return false;
        }
        
        if (dungeonA === dungeonB) {
            console.warn(`[DungeonGraph] Cannot connect dungeon to itself`);
            return false;
        }
        
        this.adjacency.get(dungeonA).add(dungeonB);
        this.adjacency.get(dungeonB).add(dungeonA);
        
        console.log(`[DungeonGraph] Connected ${dungeonA} ←→ ${dungeonB}`);
        return true;
    }
    
    /**
     * Remove connection between two dungeons
     */
    disconnect(dungeonA, dungeonB) {
        if (this.adjacency.has(dungeonA)) {
            this.adjacency.get(dungeonA).delete(dungeonB);
        }
        if (this.adjacency.has(dungeonB)) {
            this.adjacency.get(dungeonB).delete(dungeonA);
        }
        console.log(`[DungeonGraph] Disconnected ${dungeonA} ←→ ${dungeonB}`);
    }
    
    /**
     * Get all neighbors of a dungeon
     */
    getNeighbors(dungeonId) {
        const neighbors = this.adjacency.get(dungeonId);
        return neighbors ? Array.from(neighbors) : [];
    }
    
    /**
     * Check if two dungeons are connected
     */
    areConnected(dungeonA, dungeonB) {
        const neighbors = this.adjacency.get(dungeonA);
        return neighbors ? neighbors.has(dungeonB) : false;
    }
    
    /**
     * Automatically connect a new dungeon to existing ones
     * 
     * @param {string} dungeonId - The dungeon to connect
     * @param {number} maxLinks - Maximum connections to create (default: 2)
     * @param {string} topology - 'ring' or 'random' (default: 'ring')
     * @returns {string[]} - Array of dungeonIds that were connected
     */
    autoConnect(dungeonId, maxLinks = 2, topology = 'ring') {
        if (!this.adjacency.has(dungeonId)) {
            console.warn(`[DungeonGraph] Dungeon ${dungeonId} not in graph`);
            return [];
        }
        
        const existing = Array.from(this.adjacency.keys())
            .filter(id => id !== dungeonId);
        
        if (existing.length === 0) {
            console.log(`[DungeonGraph] No existing dungeons to connect to`);
            return [];
        }
        
        let toConnect = [];
        
        if (topology === 'ring') {
            // Ring topology: connect to the most recent dungeon
            // This creates a linear chain that loops back
            const mostRecent = existing[existing.length - 1];
            toConnect = [mostRecent];
            
            // If this is the 3rd+ dungeon, also connect back to first (close the ring)
            if (existing.length >= 2) {
                const first = existing[0];
                const mostRecentNeighbors = this.getNeighbors(mostRecent);
                
                // Only close ring if mostRecent has space
                if (mostRecentNeighbors.length < maxLinks) {
                    // Don't add first if already connected
                    if (!this.areConnected(dungeonId, first)) {
                        toConnect.push(first);
                    }
                }
            }
        } else {
            // Random topology: connect to random existing dungeons
            const shuffled = existing.sort(() => Math.random() - 0.5);
            toConnect = shuffled.slice(0, Math.min(maxLinks, existing.length));
        }
        
        // Create connections
        const connected = [];
        for (const targetId of toConnect) {
            if (this.connect(dungeonId, targetId)) {
                connected.push(targetId);
            }
        }
        
        return connected;
    }
    
    /**
     * Get graph statistics
     */
    getStats() {
        const dungeonCount = this.adjacency.size;
        let totalConnections = 0;
        let minConnections = Infinity;
        let maxConnections = 0;
        
        for (const neighbors of this.adjacency.values()) {
            const count = neighbors.size;
            totalConnections += count;
            minConnections = Math.min(minConnections, count);
            maxConnections = Math.max(maxConnections, count);
        }
        
        // Each connection counted twice (bidirectional)
        const uniqueConnections = totalConnections / 2;
        const avgConnections = dungeonCount > 0 ? totalConnections / dungeonCount : 0;
        
        return {
            dungeonCount,
            uniqueConnections,
            avgConnections: avgConnections.toFixed(2),
            minConnections: dungeonCount > 0 ? minConnections : 0,
            maxConnections,
        };
    }
    
    /**
     * Get all dungeons in the graph
     */
    getAllDungeons() {
        return Array.from(this.adjacency.keys());
    }
    
    /**
     * Get a visual representation of the graph (for debugging)
     */
    toString() {
        const lines = [];
        lines.push(`DungeonGraph: ${this.adjacency.size} dungeons`);
        
        for (const [dungeonId, neighbors] of this.adjacency.entries()) {
            const shortId = dungeonId.substring(0, 8);
            const neighborIds = Array.from(neighbors).map(id => id.substring(0, 8)).join(', ');
            lines.push(`  ${shortId} → [${neighborIds}]`);
        }
        
        return lines.join('\n');
    }
}

module.exports = { DungeonGraph };

export class MultiplayerShareController {
    constructor({ uiController }) {
        this.uiController = uiController;
    }

    async copyPrivateLink(msg) {
        const pairCode = msg?.code || '';
        const codeEl = document.getElementById('pairCode');
        if (codeEl && pairCode) codeEl.value = pairCode;

        const rawJoinUrl = msg?.joinUrl || `/?room=${encodeURIComponent(pairCode)}`;
        const absoluteJoinUrl = rawJoinUrl.startsWith('http')
            ? rawJoinUrl
            : `${location.origin}${rawJoinUrl}`;
        const fallbackText = `Private classic link: ${absoluteJoinUrl}`;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(absoluteJoinUrl);
                this.uiController.setStatus(`Private room ready (${pairCode}). Link copied to clipboard.`);
                this.uiController.setStatusError(false);
                return;
            }
        } catch (_error) {
            // Keep graceful fallback text.
        }

        this.uiController.setStatus(`${fallbackText} (copy manually)`);
        this.uiController.setStatusError(false);
    }
}

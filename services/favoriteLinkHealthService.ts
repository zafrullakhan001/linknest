import { LinkHealth } from '../types';

const API_BASE: string =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE) ||
    '/api';

export interface LinkHealthCheckResult {
    linkId: string;
    health: LinkHealth;
    latency?: number; // Local latency (roundtrip from browser to server) in milliseconds
    serverLatency?: number; // Server-side latency (time taken by server to check URL) in milliseconds
}

/**
 * Service for checking favorite link health with cancellation support
 */
class FavoriteLinkHealthService {
    private abortController: AbortController | null = null;
    private checkingInProgress = false;

    /**
   * Check health for a single link using the backend API
   */
    async checkSingleLink(linkId: string): Promise<LinkHealthCheckResult> {
        const startTime = performance.now();

        try {
            // Create a new abort controller for this request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for the backend call

            const response = await fetch(`${API_BASE}/linkhealth/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ linkId }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            const localLatency = Math.round(performance.now() - startTime);

            return {
                linkId,
                health: data.health,
                latency: localLatency,
                serverLatency: data.health.serverLatency !== undefined ? data.health.serverLatency : 0
            };
        } catch (error: any) {
            const localLatency = Math.round(performance.now() - startTime);

            if (error.name === 'AbortError') {
                return {
                    linkId,
                    health: {
                        status: 'timeout',
                        httpCode: null,
                        error: 'Request timed out',
                        checkedAt: Date.now()
                    },
                    latency: localLatency,
                    serverLatency: 0
                };
            }

            return {
                linkId,
                health: {
                    status: 'broken',
                    httpCode: null,
                    error: error.message || 'Failed to check link',
                    checkedAt: Date.now()
                },
                latency: localLatency,
                serverLatency: 0
            };
        }
    }

    /**
     * Check health for multiple links with cancellation support
     * Returns a map of linkId to health check result
     */
    async checkMultipleLinks(
        links: Array<{ id: string; url: string }>,
        onProgress?: (linkId: string, result: LinkHealthCheckResult) => void
    ): Promise<Map<string, LinkHealthCheckResult>> {
        // Cancel any existing check
        this.cancelCheck();

        // Create new abort controller
        this.abortController = new AbortController();
        this.checkingInProgress = true;

        const results = new Map<string, LinkHealthCheckResult>();

        try {
            // Check links in batches to avoid overwhelming the browser/server
            const batchSize = 3; // Smaller batch size for backend requests
            for (let i = 0; i < links.length; i += batchSize) {
                // Check if cancelled
                if (this.abortController.signal.aborted) {
                    break;
                }

                const batch = links.slice(i, i + batchSize);
                const batchPromises = batch.map(link =>
                    this.checkSingleLink(link.id)
                        .then(result => {
                            if (onProgress && !this.abortController?.signal.aborted) {
                                onProgress(link.id, result);
                            }
                            return result;
                        })
                );

                const batchResults = await Promise.all(batchPromises);

                // Store results
                batchResults.forEach(result => {
                    results.set(result.linkId, result);
                });

                // Small delay between batches to prevent overwhelming the browser
                if (i + batchSize < links.length && !this.abortController.signal.aborted) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } finally {
            this.checkingInProgress = false;
            this.abortController = null;
        }

        return results;
    }

    /**
     * Cancel any ongoing health checks
     */
    cancelCheck(): void {
        if (this.abortController && this.checkingInProgress) {
            this.abortController.abort();
            this.abortController = null;
            this.checkingInProgress = false;
        }
    }

    /**
     * Check if a health check is currently in progress
     */
    isChecking(): boolean {
        return this.checkingInProgress;
    }

    /**
     * Get health status color for the shark fin indicator
     */
    getHealthColor(status: string): string {
        switch (status) {
            case 'healthy':
            case 'accessible':
            case 'restricted':
                return 'bg-emerald-500'; // Show all accessible/online statuses as green
            case 'broken':
                return 'bg-red-500';
            case 'timeout':
                return 'bg-orange-500';
            case 'checking':
                return 'bg-blue-500 animate-pulse';
            default:
                return 'bg-slate-400';
        }
    }

    /**
     * Format latency for display
     */
    formatLatency(latency?: number | null): string {
        if (latency === undefined || latency === null) return '';
        if (latency < 1000) return `${latency}ms`;
        return `${(latency / 1000).toFixed(1)}s`;
    }

    /**
     * Get status code display text
     */
    getStatusDisplay(httpCode?: number | null, status?: string): string {
        if (status === 'timeout') return 'Timeout';
        if (status === 'checking') return 'Checking...';
        if (httpCode) return `${httpCode}`;
        return '';
    }
}

export const favoriteLinkHealthService = new FavoriteLinkHealthService();

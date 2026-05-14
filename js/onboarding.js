/**
 * OpenFret onboarding.
 *
 * - Shows a dismissible welcome banner on first visit.
 * - Provides a help modal accessible from the header "?" button.
 * - Remembers dismissal state in localStorage.
 */
(function () {
    'use strict';

    var BANNER_KEY = 'openfret.welcomeDismissed.v1';

    function isBannerDismissed() {
        return localStorage.getItem(BANNER_KEY) === 'true';
    }

    function dismissBanner() {
        localStorage.setItem(BANNER_KEY, 'true');
        var banner = document.getElementById('welcomeBanner');
        if (banner) banner.style.display = 'none';
    }

    function showBannerIfNeeded() {
        var banner = document.getElementById('welcomeBanner');
        if (!banner) return;
        banner.style.display = isBannerDismissed() ? 'none' : 'flex';
    }

    function showHelpModal() {
        var modal = document.getElementById('helpModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeHelpModal() {
        var modal = document.getElementById('helpModal');
        if (modal) modal.style.display = 'none';
    }

    // Expose globally so inline onclick attributes in index.html can call them.
    window.OpenFretOnboarding = {
        dismissBanner: dismissBanner,
        showBannerIfNeeded: showBannerIfNeeded,
        showHelpModal: showHelpModal,
        closeHelpModal: closeHelpModal
    };

    // Aliases for inline handlers
    window.dismissWelcomeBanner = dismissBanner;
    window.showHelpModal = showHelpModal;
    window.closeHelpModal = closeHelpModal;

    document.addEventListener('DOMContentLoaded', showBannerIfNeeded);

    // Register service worker for offline + install-to-home-screen support.
    // Only runs when served over HTTPS or localhost (browser security rule).
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('./service-worker.js').catch(function (err) {
                console.warn('OpenFret service worker registration failed:', err);
            });
        });
    }
})();

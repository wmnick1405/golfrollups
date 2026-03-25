// public/js/shared.js

/**
 * 1. THE SMART FETCH TOOL
 * This replaces the standard 'fetch'. It automatically handles 
 * the 401 login check and converts data to JSON.
 */
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // If the session expired, send them back to login
        if (response.status === 401) {
            window.location.href = 'index.html';
            return null;
        }
        
        return await response.json();
    } catch (err) {
        console.error("Fetch error:", err);
        return null;
    }
}

/**
 * 2. DATE FORMATTER
 * Converts "2026-03-25" into "25/03/2026"
 */
function formatDate(dateString) {
    if (!dateString) return "N/A";
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB');
}

/**
 * 3. NAVIGATION LOADER
 * Injects the menu into the 'nav-placeholder' div
 */
function loadNavigation() {
    const navElem = document.getElementById('nav-placeholder');
    if (navElem) {
        fetch('nav.html')
            .then(res => res.text())
            .then(data => {
                navElem.innerHTML = data;
            });
    }
}

// Automatically check login and load nav when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Don't check login if we are already on the login page
    if (!window.location.pathname.endsWith('index.html') && 
        window.location.pathname !== '/') {
        // We do a quick test fetch to see if we are logged in
        apiFetch('/api/golfers');
    }
    loadNavigation();
});

// Shared logout function
async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'index.html';
}